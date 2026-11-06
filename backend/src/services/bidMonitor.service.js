// backend/src/services/bidMonitor.service.js
// Admin Bid Monitor service layer.
// Responsibilities:
//   1. writeAuditLog(entry)   — append-only insert into bid_audit_log
//   2. raiseFlag(entry)       — insert into bid_flags
//   3. Anomaly detection      — runAnomalyDetection() called by cron + inline
//   4. Freeze / unfreeze enforcement — isBidFrozen(), isFpoSuspended()
//   5. Admin action helpers   — freeze, unfreeze, forceClose, voidQuote, suspendFpo, reinstateFpo
//
// All writes use adminClient (service_role key) to bypass RLS.
// Anomaly thresholds live in ANOMALY_CONFIG — admin can tune via env later.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminClient } from '../config/supabaseClient.js';
import { OFFICIAL_CCEA_MSP_2026_27 } from './msp.service.js';
import { sendBulkNotifications, normalizeCategory } from './notification.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIT_FILE = path.resolve(__dirname, '../../data/audit_log.json');

export function getLocalAuditLogs() {
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

export function appendLocalAuditLog(entry) {
  try {
    const logs = getLocalAuditLogs();
    logs.unshift(entry);
    if (logs.length > 500) logs.length = 500;
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch (_) {}
}

// ── Anomaly thresholds — single source of truth ───────────────────────────────
export const ANOMALY_CONFIG = {
  price_above_msp_pct:             Number(process.env.BM_PRICE_ABOVE_MSP_PCT       || 40),
  below_msp_attempts_window_h:     Number(process.env.BM_BELOW_MSP_WINDOW_H        || 24),
  below_msp_attempts_threshold:    Number(process.env.BM_BELOW_MSP_THRESHOLD       || 3),
  cancels_window_days:             Number(process.env.BM_CANCELS_WINDOW_DAYS       || 7),
  cancels_threshold:               Number(process.env.BM_CANCELS_THRESHOLD         || 3),
  shill_window_minutes:            Number(process.env.BM_SHILL_WINDOW_MINUTES      || 30),
  farmer_ask_above_offer_pct:      Number(process.env.BM_FARMER_ASK_ABOVE_OFFER_PCT|| 30),
  low_quote_deadline_hours:        Number(process.env.BM_LOW_QUOTE_DEADLINE_HOURS  || 12),
  anti_snipe_trigger_count:        Number(process.env.BM_ANTI_SNIPE_COUNT          || 2),
};

// ── 1. Write audit log ─────────────────────────────────────────────────────────
export async function writeAuditLog({
  bid_id = null,
  quote_id = null,
  actor_id = null,
  actor_role = 'system',
  action,
  old_value = null,
  new_value = null,
  reason = null,
  ip_address = null,
}) {
  const entry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    bid_id,
    quote_id,
    actor_id,
    actor_role,
    action,
    old_value: old_value ? JSON.parse(JSON.stringify(old_value)) : null,
    new_value: new_value ? JSON.parse(JSON.stringify(new_value)) : null,
    reason,
    ip_address,
    created_at: new Date().toISOString(),
  };

  appendLocalAuditLog(entry);

  try {
    const { error } = await adminClient.from('bid_audit_log').insert(entry);
    if (error) {
      // Supabase table not compiled or RLS error
    }
  } catch (err) {
    // Silent fallback
  }
}

// ── 2. Raise a flag ───────────────────────────────────────────────────────────
export async function raiseFlag({
  bid_id = null,
  quote_id = null,
  fpo_id = null,
  farmer_id = null,
  flag_type,
  severity = 'medium',
  details = {},
}) {
  try {
    // De-duplicate: don't raise the same flag_type for same bid within 1h
    if (bid_id) {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
      const { data: existing } = await adminClient
        .from('bid_flags')
        .select('id')
        .eq('bid_id', bid_id)
        .eq('flag_type', flag_type)
        .eq('status', 'open')
        .gte('created_at', oneHourAgo)
        .limit(1);
      if (existing && existing.length > 0) return; // already flagged recently
    }

    await adminClient.from('bid_flags').insert({
      bid_id,
      quote_id,
      fpo_id,
      farmer_id,
      flag_type,
      severity,
      details: JSON.parse(JSON.stringify(details)),
      status: 'open',
      created_at: new Date().toISOString(),
    });

    // Also write to audit log
    await writeAuditLog({
      bid_id,
      quote_id,
      actor_id: fpo_id || farmer_id,
      actor_role: 'system',
      action: 'anomaly_detected',
      new_value: { flag_type, severity, details },
      reason: `Automatic anomaly detection: ${flag_type}`,
    });
  } catch (err) {
    console.error('[bidMonitor] raiseFlag exception:', err.message);
  }
}

// ── 3. Enforcement guards ─────────────────────────────────────────────────────

export async function isBidFrozen(bidId) {
  try {
    const { data } = await adminClient
      .from('procurement_bids')
      .select('status')
      .eq('id', bidId)
      .maybeSingle();
    return data?.status === 'frozen';
  } catch {
    return false;
  }
}

export async function isFpoSuspended(fpoUserId) {
  if (!fpoUserId) return false;
  try {
    const { data } = await adminClient
      .from('users')
      .select('fpo_bidding_suspended')
      .eq('id', fpoUserId)
      .maybeSingle();
    return Boolean(data?.fpo_bidding_suspended);
  } catch {
    return false;
  }
}

// ── 4. Admin action helpers ───────────────────────────────────────────────────

export async function freezeBid({ bidId, adminId, reason, ip }) {
  const { data: bid, error } = await adminClient
    .from('procurement_bids')
    .select('status, fpo_id, crop_type, max_price_per_kg')
    .eq('id', bidId)
    .maybeSingle();

  if (error || !bid) return { ok: false, error: 'Bid not found.' };
  if (bid.status === 'frozen') return { ok: false, error: 'Bid is already frozen.' };
  if (['fulfilled', 'cancelled', 'force_closed'].includes(bid.status)) {
    return { ok: false, error: `Cannot freeze a bid in status: ${bid.status}.` };
  }

  const oldStatus = bid.status;
  const { data: updated, error: upErr } = await adminClient
    .from('procurement_bids')
    .update({
      status: 'frozen',
      frozen_by: adminId,
      frozen_at: new Date().toISOString(),
      frozen_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bidId)
    .select()
    .single();

  if (upErr) return { ok: false, error: upErr.message };

  await writeAuditLog({
    bid_id: bidId,
    actor_id: adminId,
    actor_role: 'admin',
    action: 'admin_freeze',
    old_value: { status: oldStatus },
    new_value: { status: 'frozen', reason },
    reason,
    ip_address: ip,
  });

  // Notify FPO
  if (bid.fpo_id) {
    await sendBulkNotifications([{
      user_id: bid.fpo_id,
      title: `⚠️ Bid #${bidId.slice(0, 8)} Frozen by Admin`,
      message: `Your bid for ${bid.crop_type} at ₹${bid.max_price_per_kg}/kg has been frozen. Reason: ${reason}. No new quotes or price changes accepted until unfrozen.`,
      category: 'system',
      priority: 'high',
    }]);
  }

  return { ok: true, bid: updated };
}

export async function unfreezeBid({ bidId, adminId, reason, ip }) {
  const { data: bid } = await adminClient
    .from('procurement_bids')
    .select('status, fpo_id, crop_type')
    .eq('id', bidId)
    .maybeSingle();

  if (!bid) return { ok: false, error: 'Bid not found.' };
  if (bid.status !== 'frozen') return { ok: false, error: 'Bid is not frozen.' };

  const { data: updated, error: upErr } = await adminClient
    .from('procurement_bids')
    .update({
      status: 'open',
      frozen_by: null,
      frozen_at: null,
      frozen_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bidId)
    .select()
    .single();

  if (upErr) return { ok: false, error: upErr.message };

  await writeAuditLog({
    bid_id: bidId,
    actor_id: adminId,
    actor_role: 'admin',
    action: 'admin_unfreeze',
    old_value: { status: 'frozen' },
    new_value: { status: 'open', reason },
    reason,
    ip_address: ip,
  });

  if (bid.fpo_id) {
    await sendBulkNotifications([{
      user_id: bid.fpo_id,
      title: `✅ Bid #${bidId.slice(0, 8)} Unfrozen`,
      message: `Your bid for ${bid.crop_type} has been unfrozen and is now accepting quotes again. Reason: ${reason}.`,
      category: 'system',
      priority: 'normal',
    }]);
  }

  return { ok: true, bid: updated };
}

export async function forceCloseBid({ bidId, adminId, reason, ip }) {
  const { data: bid } = await adminClient
    .from('procurement_bids')
    .select('status, fpo_id, crop_type')
    .eq('id', bidId)
    .maybeSingle();

  if (!bid) return { ok: false, error: 'Bid not found.' };
  if (['fulfilled', 'cancelled', 'force_closed'].includes(bid.status)) {
    return { ok: false, error: `Bid already in terminal status: ${bid.status}.` };
  }

  const { data: updated, error: upErr } = await adminClient
    .from('procurement_bids')
    .update({
      status: 'force_closed',
      closed_by: adminId,
      closed_at: new Date().toISOString(),
      closed_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bidId)
    .select()
    .single();

  if (upErr) return { ok: false, error: upErr.message };

  // Reject all pending quotes
  const { data: pendingQuotes } = await adminClient
    .from('bid_seller_quotes')
    .select('id, farmer_user_id, farmer_name')
    .eq('bid_id', bidId)
    .eq('status', 'pending');

  if (pendingQuotes && pendingQuotes.length > 0) {
    await adminClient
      .from('bid_seller_quotes')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('bid_id', bidId)
      .eq('status', 'pending');

    // Notify each quoting farmer
    const farmerNotifs = pendingQuotes
      .filter(q => q.farmer_user_id)
      .map(q => ({
        user_id: q.farmer_user_id,
        title: `Bid #${bidId.slice(0, 8)} Force-Closed by Admin`,
        message: `The bid you quoted on (${bid.crop_type}) has been administratively closed. Your pending quote has been rejected. Reason: ${reason}.`,
        category: 'system',
        priority: 'high',
      }));
    if (farmerNotifs.length > 0) await sendBulkNotifications(farmerNotifs);
  }

  // Notify FPO
  if (bid.fpo_id) {
    await sendBulkNotifications([{
      user_id: bid.fpo_id,
      title: `🔴 Bid #${bidId.slice(0, 8)} Force-Closed by Admin`,
      message: `Your bid for ${bid.crop_type} has been administratively closed. Reason: ${reason}. Contact support for more details.`,
      category: 'system',
      priority: 'urgent',
    }]);
  }

  await writeAuditLog({
    bid_id: bidId,
    actor_id: adminId,
    actor_role: 'admin',
    action: 'admin_force_close',
    old_value: { status: bid.status },
    new_value: { status: 'force_closed', reason },
    reason,
    ip_address: ip,
  });

  return { ok: true, bid: updated };
}

export async function voidQuote({ quoteId, adminId, reason, ip }) {
  const { data: quote } = await adminClient
    .from('bid_seller_quotes')
    .select('id, bid_id, status, quantity_kg, farmer_user_id, price_per_kg')
    .eq('id', quoteId)
    .maybeSingle();

  if (!quote) return { ok: false, error: 'Quote not found.' };
  if (quote.status === 'closed') return { ok: false, error: 'Quote already closed.' };

  const oldStatus = quote.status;
  const { data: updated, error: upErr } = await adminClient
    .from('bid_seller_quotes')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', quoteId)
    .select()
    .single();

  if (upErr) return { ok: false, error: upErr.message };

  // Restore remaining_qty on bid if quote was accepted
  if (oldStatus === 'accepted' && quote.quantity_kg) {
    await adminClient.rpc('restore_bid_remaining_qty', {
      p_bid_id: quote.bid_id,
      p_qty_kg: quote.quantity_kg,
    }).catch(() => {
      // Fallback: manual update
      adminClient
        .from('procurement_bids')
        .select('remaining_qty')
        .eq('id', quote.bid_id)
        .maybeSingle()
        .then(({ data: b }) => {
          if (b) {
            adminClient
              .from('procurement_bids')
              .update({ remaining_qty: (b.remaining_qty || 0) + quote.quantity_kg })
              .eq('id', quote.bid_id);
          }
        });
    });
  }

  if (quote.farmer_user_id) {
    await sendBulkNotifications([{
      user_id: quote.farmer_user_id,
      title: `Your Quote Was Voided by Admin`,
      message: `Your quote of ₹${quote.price_per_kg}/kg has been voided by an administrator. Reason: ${reason}.`,
      category: 'system',
      priority: 'high',
    }]);
  }

  await writeAuditLog({
    bid_id: quote.bid_id,
    quote_id: quoteId,
    actor_id: adminId,
    actor_role: 'admin',
    action: 'admin_void_quote',
    old_value: { status: oldStatus },
    new_value: { status: 'closed', reason },
    reason,
    ip_address: ip,
  });

  return { ok: true, quote: updated };
}

export async function suspendFpo({ fpoUserId, adminId, reason, ip }) {
  const { data: fpo } = await adminClient
    .from('users')
    .select('id, fpo_bidding_suspended, full_name')
    .eq('id', fpoUserId)
    .maybeSingle();

  if (!fpo) return { ok: false, error: 'FPO user not found.' };
  if (fpo.fpo_bidding_suspended) return { ok: false, error: 'FPO is already suspended.' };

  const { data: updated, error: upErr } = await adminClient
    .from('users')
    .update({
      fpo_bidding_suspended: true,
      suspension_reason: reason,
      suspended_by: adminId,
      suspended_at: new Date().toISOString(),
    })
    .eq('id', fpoUserId)
    .select()
    .single();

  if (upErr) return { ok: false, error: upErr.message };

  // Freeze all open bids by this FPO
  const { data: openBids } = await adminClient
    .from('procurement_bids')
    .select('id')
    .eq('fpo_id', fpoUserId)
    .eq('status', 'open');

  if (openBids && openBids.length > 0) {
    await adminClient
      .from('procurement_bids')
      .update({
        status: 'frozen',
        frozen_by: adminId,
        frozen_at: new Date().toISOString(),
        frozen_reason: `FPO suspended: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .in('id', openBids.map(b => b.id));
  }

  await writeAuditLog({
    actor_id: adminId,
    actor_role: 'admin',
    action: 'fpo_suspended',
    new_value: { fpo_id: fpoUserId, reason },
    reason,
    ip_address: ip,
  });

  await sendBulkNotifications([{
    user_id: fpoUserId,
    title: `Your FPO Bidding Access Has Been Suspended`,
    message: `Your procurement bidding privileges have been suspended by an administrator. Reason: ${reason}. Contact support to reinstate.`,
    category: 'system',
    priority: 'urgent',
  }]);

  return { ok: true, user: updated };
}

export async function reinstateFpo({ fpoUserId, adminId, reason, ip }) {
  const { data: fpo } = await adminClient
    .from('users')
    .select('id, fpo_bidding_suspended')
    .eq('id', fpoUserId)
    .maybeSingle();

  if (!fpo) return { ok: false, error: 'FPO user not found.' };
  if (!fpo.fpo_bidding_suspended) return { ok: false, error: 'FPO is not suspended.' };

  const { data: updated, error: upErr } = await adminClient
    .from('users')
    .update({
      fpo_bidding_suspended: false,
      suspension_reason: null,
      suspended_by: null,
      suspended_at: null,
      reinstated_by: adminId,
      reinstated_at: new Date().toISOString(),
    })
    .eq('id', fpoUserId)
    .select()
    .single();

  if (upErr) return { ok: false, error: upErr.message };

  await writeAuditLog({
    actor_id: adminId,
    actor_role: 'admin',
    action: 'fpo_reinstated',
    new_value: { fpo_id: fpoUserId, reason },
    reason,
    ip_address: ip,
  });

  await sendBulkNotifications([{
    user_id: fpoUserId,
    title: `Your FPO Bidding Access Has Been Reinstated`,
    message: `Your procurement bidding privileges have been reinstated. You can now create and manage bids. Reason: ${reason}.`,
    category: 'system',
    priority: 'high',
  }]);

  return { ok: true, user: updated };
}

// ── 5. Anomaly Detection ──────────────────────────────────────────────────────
// Called by cron every 5 minutes AND inline on bid/quote writes.

function getMspForCrop(cropType) {
  const key = (cropType || '').toLowerCase().trim();
  const mspData = OFFICIAL_CCEA_MSP_2026_27[key];
  return mspData?.msp_per_kg || null;
}

export async function runAnomalyDetection() {
  const results = { checked: 0, flags_raised: 0, errors: 0 };

  try {
    // Fetch all non-terminal open/frozen bids with recent activity (last 7 days)
    const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const { data: bids, error: bErr } = await adminClient
      .from('procurement_bids')
      .select('id, fpo_id, crop_type, max_price_per_kg, quantity_tonnes, status, delivery_deadline, created_at')
      .in('status', ['open', 'frozen'])
      .gte('created_at', since);

    if (bErr || !bids) return results;
    results.checked = bids.length;

    for (const bid of bids) {
      const cropMsp = getMspForCrop(bid.crop_type);
      const offerPx = parseFloat(bid.max_price_per_kg) || 0;

      // ── Rule 1: Price > MSP * (1 + threshold%) ──────────────────────────
      if (cropMsp && offerPx > cropMsp * (1 + ANOMALY_CONFIG.price_above_msp_pct / 100)) {
        await raiseFlag({
          bid_id: bid.id,
          fpo_id: bid.fpo_id,
          flag_type: 'price_manipulation_high',
          severity: 'high',
          details: {
            offer_price: offerPx,
            msp: cropMsp,
            pct_above_msp: Math.round(((offerPx - cropMsp) / cropMsp) * 100),
            threshold_pct: ANOMALY_CONFIG.price_above_msp_pct,
          },
        });
        results.flags_raised++;
      }

      // ── Rule 2: Last-minute raises (anti-sniping triggered 2+ times) ────
      const deadline = new Date(bid.delivery_deadline);
      const now = new Date();
      const hoursToDeadline = (deadline - now) / 3600000;
      if (hoursToDeadline > 0 && hoursToDeadline < 24) {
        const { data: recentRaises } = await adminClient
          .from('bid_audit_log')
          .select('id')
          .eq('bid_id', bid.id)
          .eq('action', 'price_raised')
          .gte('created_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString());
        if (recentRaises && recentRaises.length >= ANOMALY_CONFIG.anti_snipe_trigger_count) {
          await raiseFlag({
            bid_id: bid.id,
            fpo_id: bid.fpo_id,
            flag_type: 'anti_snipe_repeated_raises',
            severity: 'medium',
            details: {
              raise_count: recentRaises.length,
              hours_to_deadline: Math.round(hoursToDeadline),
              threshold: ANOMALY_CONFIG.anti_snipe_trigger_count,
            },
          });
          results.flags_raised++;
        }
      }

      // ── Rule 3: Zero quotes near deadline (low-severity insight) ────────
      if (hoursToDeadline > 0 && hoursToDeadline < ANOMALY_CONFIG.low_quote_deadline_hours) {
        const { count: quoteCount } = await adminClient
          .from('bid_seller_quotes')
          .select('id', { count: 'exact', head: true })
          .eq('bid_id', bid.id)
          .neq('status', 'closed');
        if ((quoteCount || 0) === 0) {
          await raiseFlag({
            bid_id: bid.id,
            fpo_id: bid.fpo_id,
            flag_type: 'zero_quotes_near_deadline',
            severity: 'low',
            details: {
              hours_to_deadline: Math.round(hoursToDeadline),
              threshold_hours: ANOMALY_CONFIG.low_quote_deadline_hours,
            },
          });
          results.flags_raised++;
        }
      }
    }

    // ── Rule 4: Serial cancellations per FPO ────────────────────────────────
    const cancelsSince = new Date(Date.now() - ANOMALY_CONFIG.cancels_window_days * 86400 * 1000).toISOString();
    const { data: recentCancels } = await adminClient
      .from('bid_audit_log')
      .select('bid_id, actor_id')
      .eq('action', 'bid_cancelled')
      .gte('created_at', cancelsSince);

    if (recentCancels) {
      const cancelsByFpo = {};
      for (const c of recentCancels) {
        if (!c.actor_id) continue;
        cancelsByFpo[c.actor_id] = (cancelsByFpo[c.actor_id] || 0) + 1;
      }
      for (const [fpoId, count] of Object.entries(cancelsByFpo)) {
        if (count >= ANOMALY_CONFIG.cancels_threshold) {
          await raiseFlag({
            fpo_id: fpoId,
            flag_type: 'serial_cancellations',
            severity: 'medium',
            details: {
              cancel_count: count,
              window_days: ANOMALY_CONFIG.cancels_window_days,
              threshold: ANOMALY_CONFIG.cancels_threshold,
            },
          });
          results.flags_raised++;
        }
      }
    }

    // ── Rule 5: Below-MSP bid attempts per FPO ──────────────────────────────
    const belowMspSince = new Date(Date.now() - ANOMALY_CONFIG.below_msp_attempts_window_h * 3600 * 1000).toISOString();
    const { data: recentBids } = await adminClient
      .from('procurement_bids')
      .select('id, fpo_id, crop_type, max_price_per_kg')
      .gte('created_at', belowMspSince);

    if (recentBids) {
      const belowMspByFpo = {};
      for (const b of recentBids) {
        const msp = getMspForCrop(b.crop_type);
        if (!msp) continue;
        const px = parseFloat(b.max_price_per_kg) || 0;
        if (px < msp && b.fpo_id) {
          if (!belowMspByFpo[b.fpo_id]) belowMspByFpo[b.fpo_id] = [];
          belowMspByFpo[b.fpo_id].push({ bid_id: b.id, crop: b.crop_type, price: px, msp });
        }
      }
      for (const [fpoId, attempts] of Object.entries(belowMspByFpo)) {
        if (attempts.length >= ANOMALY_CONFIG.below_msp_attempts_threshold) {
          await raiseFlag({
            fpo_id: fpoId,
            flag_type: 'repeated_below_msp_attempts',
            severity: 'high',
            details: {
              attempt_count: attempts.length,
              window_hours: ANOMALY_CONFIG.below_msp_attempts_window_h,
              threshold: ANOMALY_CONFIG.below_msp_attempts_threshold,
              samples: attempts.slice(0, 5),
            },
          });
          results.flags_raised++;
        }
      }
    }

    // ── Rule 6: Shill / collusive bidding (alternate raises in short window) ─
    const shillSince = new Date(Date.now() - ANOMALY_CONFIG.shill_window_minutes * 60 * 1000).toISOString();
    const { data: recentRaiseLogs } = await adminClient
      .from('bid_audit_log')
      .select('bid_id, actor_id, created_at')
      .eq('action', 'price_raised')
      .gte('created_at', shillSince)
      .order('created_at', { ascending: true });

    if (recentRaiseLogs) {
      // Group raises by bid, check if 2+ distinct actors raised alternately
      const raisesByBid = {};
      for (const r of recentRaiseLogs) {
        if (!r.bid_id || !r.actor_id) continue;
        if (!raisesByBid[r.bid_id]) raisesByBid[r.bid_id] = [];
        raisesByBid[r.bid_id].push(r.actor_id);
      }
      for (const [bidId, actors] of Object.entries(raisesByBid)) {
        const uniqueActors = new Set(actors);
        if (uniqueActors.size >= 2 && actors.length >= 4) {
          // 4+ raises by 2+ different actors in short window = suspicious
          await raiseFlag({
            bid_id: bidId,
            flag_type: 'potential_collusive_bidding',
            severity: 'high',
            details: {
              raise_count: actors.length,
              distinct_actors: uniqueActors.size,
              window_minutes: ANOMALY_CONFIG.shill_window_minutes,
            },
          });
          results.flags_raised++;
        }
      }
    }

    // ── Rule 7: Over-commitment — farmer quoting same stock across many bids ─
    const { data: farmerQuotes } = await adminClient
      .from('bid_seller_quotes')
      .select('farmer_user_id, quantity_kg, bid_id')
      .in('status', ['pending', 'accepted'])
      .gte('created_at', cancelsSince);

    if (farmerQuotes) {
      const totalByFarmer = {};
      for (const q of farmerQuotes) {
        if (!q.farmer_user_id) continue;
        if (!totalByFarmer[q.farmer_user_id]) totalByFarmer[q.farmer_user_id] = { total: 0, bids: new Set() };
        totalByFarmer[q.farmer_user_id].total += parseFloat(q.quantity_kg) || 0;
        totalByFarmer[q.farmer_user_id].bids.add(q.bid_id);
      }
      for (const [farmerId, data] of Object.entries(totalByFarmer)) {
        if (data.bids.size >= 3 && data.total > 50000) { // 50 tonnes across 3+ bids
          await raiseFlag({
            farmer_id: farmerId,
            flag_type: 'farmer_over_commitment',
            severity: 'medium',
            details: {
              total_committed_kg: data.total,
              bid_count: data.bids.size,
            },
          });
          results.flags_raised++;
        }
      }
    }

  } catch (err) {
    console.error('[bidMonitor] anomaly detection error:', err.message);
    results.errors++;
  }

  return results;
}

// Inline check: call when a quote is submitted to detect farmer over-price
export async function checkQuoteAnomaly({ quoteId, bidId, farmerId, pricePerKg, bidOfferPrice }) {
  if (!bidOfferPrice || !pricePerKg) return;
  const pctAbove = ((pricePerKg - bidOfferPrice) / bidOfferPrice) * 100;
  if (pctAbove > ANOMALY_CONFIG.farmer_ask_above_offer_pct) {
    await raiseFlag({
      bid_id: bidId,
      quote_id: quoteId,
      farmer_id: farmerId,
      flag_type: 'farmer_quote_far_above_offer',
      severity: 'medium',
      details: {
        quote_price: pricePerKg,
        offer_price: bidOfferPrice,
        pct_above: Math.round(pctAbove),
        threshold_pct: ANOMALY_CONFIG.farmer_ask_above_offer_pct,
      },
    });
  }
}
