// backend/src/services/notification.service.js
// Centralized notification dispatch service for the Oilseed Value Chain platform.
// Executes with adminClient (service_role key) to safely bypass RLS policies
// and ensure guaranteed delivery across all 6 dashboards (Farmer, FPO, Processor,
// Retailer, Government, Admin).

import { adminClient } from '../config/supabaseClient.js';

/**
 * Valid categories enforced by PostgreSQL notification_category_enum
 */
export const VALID_CATEGORIES = [
  'order',
  'weather_alert',
  'pest_alert',
  'mandi_price',
  'loan',
  'insurance',
  'system',
];

/**
 * Valid priorities enforced by PostgreSQL notification_priority_enum
 */
export const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/**
 * Normalizes any category string to a valid PostgreSQL notification_category_enum value.
 * Safely maps custom / legacy aliases (bids, procurement, alert, etc.) to valid enum values.
 */
export function normalizeCategory(category) {
  if (!category) return 'system';
  const c = String(category).toLowerCase().trim();
  if (VALID_CATEGORIES.includes(c)) return c;

  // Category alias mappings
  if (['bids', 'bid', 'quote', 'quotes', 'procurement', 'marketplace', 'order_placed', 'payment', 'batch'].includes(c)) {
    return 'order';
  }
  if (['price', 'mandi', 'price_alert', 'market', 'prices'].includes(c)) {
    return 'mandi_price';
  }
  if (['weather', 'forecast', 'rain', 'climate'].includes(c)) {
    return 'weather_alert';
  }
  if (['pest', 'disease', 'pathology', 'crop_health'].includes(c)) {
    return 'pest_alert';
  }
  if (['finance', 'credit', 'subsidy', 'dbt', 'kcc'].includes(c)) {
    return 'loan';
  }
  if (['claim', 'insurance_claim'].includes(c)) {
    return 'insurance';
  }
  return 'system';
}

/**
 * Normalizes priority to a valid PostgreSQL notification_priority_enum value.
 */
export function normalizePriority(priority) {
  if (!priority) return 'normal';
  const p = String(priority).toLowerCase().trim();
  if (VALID_PRIORITIES.includes(p)) return p;

  if (['critical', 'emergency', 'danger'].includes(p)) return 'urgent';
  if (['important', 'warning'].includes(p)) return 'high';
  if (['info', 'medium'].includes(p)) return 'normal';
  return 'normal';
}

/**
 * Format a single notification record for DB insertion.
 */
export function sanitizeNotificationPayload(item) {
  const uid = item?.user_id || item?.userId;
  if (!item || !uid || !item.title || !item.message) {
    return null;
  }
  return {
    user_id: uid,
    title: String(item.title).trim(),
    message: String(item.message).trim(),
    category: normalizeCategory(item.category),
    priority: normalizePriority(item.priority),
    action_url: item.action_url ? String(item.action_url).trim() : null,
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
    is_read: false,
    created_at: new Date().toISOString(),
  };
}

/**
 * Dispatches a single notification using adminClient (bypasses RLS).
 * 
 * @param {Object} notificationData
 * @returns {Promise<Object|null>} The inserted notification record, or null if failed
 */
export async function sendNotification(notificationData) {
  const payload = sanitizeNotificationPayload(notificationData);
  if (!payload) {
    console.warn('[notification.service] Invalid notification payload:', notificationData);
    return null;
  }

  try {
    const { data, error } = await adminClient
      .from('notifications')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[notification.service] Insert error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[notification.service] Unexpected dispatch failure:', err.message);
    return null;
  }
}

/**
 * Dispatches multiple notifications in a single bulk transaction using adminClient.
 * 
 * @param {Array<Object>} notificationList
 * @returns {Promise<Array<Object>>} Array of successfully inserted notification records
 */
export async function sendBulkNotifications(notificationList) {
  if (!Array.isArray(notificationList) || notificationList.length === 0) {
    return [];
  }

  const validRows = notificationList
    .map(sanitizeNotificationPayload)
    .filter(Boolean);

  if (validRows.length === 0) {
    return [];
  }

  try {
    const { data, error } = await adminClient
      .from('notifications')
      .insert(validRows)
      .select();

    if (error) {
      console.error('[notification.service] Bulk insert error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[notification.service] Unexpected bulk dispatch failure:', err.message);
    return [];
  }
}

/**
 * Broadcasts a notification to all users of a specific role, or all users across the platform.
 * 
 * @param {Object} params
 * @param {string} [params.target_role] - 'farmer' | 'fpo' | 'processor' | 'retailer' | 'government' | 'admin' | 'all'
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.category='system']
 * @param {string} [params.priority='normal']
 * @param {string} [params.action_url]
 * @param {Object} [params.metadata]
 * @returns {Promise<{ count: number, notifications: Array }>}
 */
export async function broadcastToRole({
  target_role,
  title,
  message,
  category = 'system',
  priority = 'normal',
  action_url,
  metadata = {},
}) {
  if (!title || !message) {
    throw new Error('title and message are required for broadcast');
  }

  let userQuery = adminClient.from('users').select('id');
  if (target_role && target_role !== 'all') {
    if (target_role === 'buyer') {
      userQuery = userQuery.in('role', ['processor', 'retailer', 'buyer']);
    } else {
      userQuery = userQuery.eq('role', target_role);
    }
  }

  const { data: users, error: userErr } = await userQuery;
  if (userErr) {
    console.error('[notification.service] Error fetching broadcast recipients:', userErr.message);
    throw userErr;
  }

  if (!users || users.length === 0) {
    return { count: 0, notifications: [] };
  }

  const notifs = users.map(u => ({
    user_id: u.id,
    title,
    message,
    category,
    priority,
    action_url,
    metadata: {
      ...metadata,
      broadcast: true,
      target_role: target_role || 'all',
    },
  }));

  const inserted = await sendBulkNotifications(notifs);
  return { count: inserted.length, notifications: inserted };
}
