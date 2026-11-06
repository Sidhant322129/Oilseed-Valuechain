// backend/src/services/priceAlert.service.js
// Service layer for detecting meaningful price increases in APMC mandi price_history
// and dispatching scoped notifications to farmers growing that specific oilseed crop.

import { adminClient } from '../config/supabaseClient.js';
import { PRICE_ALERT_CONFIG } from '../config/priceAlert.config.js';

/**
 * Format crop type for human display (e.g. 'mustard' -> 'Mustard', 'soybean' -> 'Soybean')
 */
function formatCropName(cropType) {
  if (!cropType) return 'Oilseed';
  return cropType.charAt(0).toUpperCase() + cropType.slice(1);
}

/**
 * Check if a newly recorded price qualifies as a meaningful surge.
 * If yes, create notifications for all farmers currently growing this crop.
 * 
 * @param {Object} newPriceRecord - The newly inserted price_history row
 * @returns {Promise<Object>} Evaluation summary and created alerts
 */
export async function checkAndCreatePriceAlert(newPriceRecord) {
  if (!newPriceRecord || !newPriceRecord.crop_type || !newPriceRecord.modal_price_per_quintal) {
    return { alertTriggered: false, reason: 'INVALID_PRICE_RECORD' };
  }

  const newPrice = Number(newPriceRecord.modal_price_per_quintal);
  const cropType = newPriceRecord.crop_type;

  // 1. Fetch previous price benchmark for this crop
  let prevQuery = adminClient
    .from('price_history')
    .select('*')
    .eq('crop_type', cropType);

  if (newPriceRecord.id) {
    prevQuery = prevQuery.neq('id', newPriceRecord.id);
  }

  if (newPriceRecord.price_date) {
    prevQuery = prevQuery.lte('price_date', newPriceRecord.price_date);
  }

  prevQuery = prevQuery
    .order('price_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  const { data: prevRecords, error: prevErr } = await prevQuery;
  if (prevErr) {
    console.error('[priceAlert.service] Error fetching previous price:', prevErr);
    return { alertTriggered: false, error: prevErr.message };
  }

  const previousRecord = prevRecords && prevRecords.length > 0 ? prevRecords[0] : null;

  // If no prior historical benchmark exists, we cannot determine a percentage increase yet
  if (!previousRecord || !previousRecord.modal_price_per_quintal) {
    return {
      alertTriggered: false,
      reason: 'FIRST_RECORD_FOR_CROP',
      message: `Initial price baseline established at ₹${newPrice}/quintal. Subsequent entries will be benchmarked against this.`,
    };
  }

  const prevPrice = Number(previousRecord.modal_price_per_quintal);
  const amountIncrease = newPrice - prevPrice;
  const pctIncrease = ((amountIncrease) / prevPrice) * 100;

  // 2. Check threshold
  const threshold = PRICE_ALERT_CONFIG.DEFAULT_PRICE_SURGE_THRESHOLD_PCT;
  if (pctIncrease < threshold) {
    return {
      alertTriggered: false,
      reason: 'BELOW_THRESHOLD',
      pctIncrease: Number(pctIncrease.toFixed(2)),
      threshold,
      prevPrice,
      newPrice,
    };
  }

  // 3. Determine urgency priority
  let priority = 'normal';
  if (pctIncrease >= PRICE_ALERT_CONFIG.PRIORITY_THRESHOLDS.URGENT_PCT) {
    priority = 'urgent';
  } else if (pctIncrease >= PRICE_ALERT_CONFIG.PRIORITY_THRESHOLDS.HIGH_PCT) {
    priority = 'high';
  }

  // 4. Find all farmers growing this specific crop, plus all FPOs and processors
  const [cropRes, fpoRes, procRes] = await Promise.all([
    adminClient
      .from('crops')
      .select(`crop_type, variety, farmers!inner(user_id)`)
      .eq('crop_type', cropType),
    adminClient
      .from('users')
      .select('id')
      .eq('role', 'fpo'),
    adminClient
      .from('users')
      .select('id')
      .eq('role', 'processor'),
  ]);

  const farmerUserIds = (cropRes.data || []).map(r => r.farmers?.user_id).filter(Boolean);
  const fpoUserIds = (fpoRes.data || []).map(u => u.id).filter(Boolean);
  const procUserIds = (procRes.data || []).map(u => u.id).filter(Boolean);

  const targetUserIds = [...new Set([...farmerUserIds, ...fpoUserIds, ...procUserIds])];

  const formattedCrop = formatCropName(cropType);
  const roundedPct = Number(pctIncrease.toFixed(1));
  const roundedAmount = Number(amountIncrease.toFixed(2));
  const title = `Price Surge Alert: ${formattedCrop} (+${roundedPct}%)`;
  const mandiStr = newPriceRecord.mandi_name ? ` at ${newPriceRecord.mandi_name}` : '';
  const districtStr = newPriceRecord.district ? `, ${newPriceRecord.district}` : '';
  const message = `Modal price for ${formattedCrop} (${newPriceRecord.variety || 'All Varieties'}) increased from ₹${prevPrice.toLocaleString('en-IN')}/q to ₹${newPrice.toLocaleString('en-IN')}/q (+₹${roundedAmount}/q / +${roundedPct}%)${mandiStr}${districtStr}.`;

  const metadata = {
    crop_type: cropType,
    variety: newPriceRecord.variety || previousRecord.variety || null,
    previous_price: prevPrice,
    new_price: newPrice,
    percentage_increase: Number(pctIncrease.toFixed(2)),
    amount_increase: roundedAmount,
    mandi_name: newPriceRecord.mandi_name || 'Market Mandi',
    district: newPriceRecord.district || '',
    state: newPriceRecord.state || '',
    price_date: newPriceRecord.price_date || new Date().toISOString().split('T')[0],
    price_history_id: newPriceRecord.id || null,
  };

  const createdNotifications = [];

  // 5. Insert notification for each farmer, FPO, and processor (idempotent)
  for (const userId of targetUserIds) {
    // Check if notification already exists for this price_history_id and user
    if (newPriceRecord.id) {
      const { data: existing } = await adminClient
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('category', 'mandi_price')
        .contains('metadata', { price_history_id: newPriceRecord.id })
        .maybeSingle();

      if (existing) {
        continue;
      }
    }

    const { data: notif, error: insertErr } = await adminClient
      .from('notifications')
      .insert({
        user_id: userId,
        category: 'mandi_price',
        priority,
        title,
        message,
        action_url: '/farmer?tab=overview',
        is_read: false,
        metadata,
      })
      .select()
      .single();

    if (!insertErr && notif) {
      createdNotifications.push(notif);
    }
  }

  return {
    alertTriggered: true,
    cropType,
    prevPrice,
    newPrice,
    percentageIncrease: Number(pctIncrease.toFixed(2)),
    amountIncrease: roundedAmount,
    priority,
    farmersEligibleCount: farmerUserIds.length,
    alertsDispatchedCount: createdNotifications.length,
    notifications: createdNotifications,
  };
}

/**
 * Clean up expired price alert notifications older than specified days
 * or superseded alerts.
 * 
 * @param {string} userId - ID of the user
 * @param {number} expiryDays - Retention window in days (default 30)
 * @returns {Promise<Object>} Deletion result
 */
export async function cleanupExpiredPriceAlerts(userId, expiryDays = PRICE_ALERT_CONFIG.ALERT_EXPIRY_DAYS) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - expiryDays);

  let query = adminClient
    .from('notifications')
    .delete()
    .eq('category', 'mandi_price')
    .lt('created_at', cutoffDate.toISOString());

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { error, count } = await query;
  if (error) {
    console.error('[priceAlert.service] Cleanup error:', error);
    throw error;
  }

  return { cleaned: true, cutoffDate: cutoffDate.toISOString(), deletedCount: count || 0 };
}
