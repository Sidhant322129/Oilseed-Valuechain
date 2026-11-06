// backend/src/controllers/bidMonitor.controller.js
// Admin Bid Monitor controller — all endpoints under /api/admin/procurement/*
// Every handler is gated by authenticate + requireRole('admin') at route level.
// Every admin mutation: requires reason, writes audit log, inserts notifications.

import { adminClient } from '../config/supabaseClient.js';
import { createError } from '../middleware/errorHandler.js';
import {
  freezeBid,
  unfreezeBid,
  forceCloseBid,
  voidQuote,
  suspendFpo,
  reinstateFpo,
  writeAuditLog,
  getLocalAuditLogs,
  ANOMALY_CONFIG,
} from '../services/bidMonitor.service.js';

function ip(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// ── GET /api/admin/procurement/overview ────────────────────────────────────────
export async function getOverview(req, res, next) {
  try {
    const [
      { count: totalBids },
      { count: openBids },
      { count: frozenBids },
      { count: totalQuotes },
      { count: flagsOpen },
      { count: suspendedFpos },
    ] = await Promise.all([
      adminClient.from('procurement_bids').select('*', { count: 'exact', head: true }),
      adminClient.from('procurement_bids').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      adminClient.from('procurement_bids').select('*', { count: 'exact', head: true }).eq('status', 'frozen'),
      adminClient.from('bid_seller_quotes').select('*', { count: 'exact', head: true }).neq('status', 'closed'),
      adminClient.from('bid_flags').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      adminClient.from('users').select('*', { count: 'exact', head: true }).eq('fpo_bidding_suspended', true),
    ]);

    // Aggregate bid value by crop type
    const { data: bids } = await adminClient
      .from('procurement_bids')
      .select('crop_type, max_price_per_kg, quantity_tonnes, status')
      .in('status', ['open', 'frozen']);

    const cropBreakdown = {};
    let totalOpenValue = 0;
    for (const b of (bids || [])) {
      const val = (parseFloat(b.max_price_per_kg) || 0) * (parseFloat(b.quantity_tonnes) || 0) * 1000;
      cropBreakdown[b.crop_type] = (cropBreakdown[b.crop_type] || 0) + val;
      totalOpenValue += val;
    }

    // Recent audit events (last 20)
    const { data: recentAudit } = await adminClient
      .from('bid_audit_log')
      .select('id, bid_id, actor_role, action, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    return res.status(200).json({
      success: true,
      total_bids: totalBids || 0,
      kpis: {
        total_bids: totalBids || 0,
        open_bids: openBids || 0,
        frozen_bids: frozenBids || 0,
        total_active_quotes: totalQuotes || 0,
        open_flags: flagsOpen || 0,
        suspended_fpos: suspendedFpos || 0,
        total_open_value_inr: Math.round(totalOpenValue),
      },
      crop_breakdown: Object.entries(cropBreakdown).map(([crop, value]) => ({ crop, value: Math.round(value) })),
      recent_audit: recentAudit || [],
      anomaly_thresholds: ANOMALY_CONFIG,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/admin/procurement/bids ───────────────────────────────────────────
export async function listBids(req, res, next) {
  try {
    const {
      status,
      crop_type,
      fpo_id,
      page = 1,
      limit = 50,
    } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('procurement_bids')
      .select('*, users!fpo_id(id, full_name, email, fpo_bidding_suspended, suspension_reason)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (status && status !== 'all') query = query.eq('status', status);
    if (crop_type) query = query.eq('crop_type', crop_type);
    if (fpo_id) query = query.eq('fpo_id', fpo_id);

    const { data, error, count } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({
      bids: data || [],
      meta: { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/admin/procurement/bids/:id ───────────────────────────────────────
export async function getBidDetail(req, res, next) {
  try {
    const { id } = req.params;

    const { data: bid, error: bErr } = await adminClient
      .from('procurement_bids')
      .select('*, users!fpo_id(id, full_name, email, fpo_bidding_suspended, suspension_reason)')
      .eq('id', id)
      .maybeSingle();

    if (bErr) return next(createError(bErr.message, 500, 'DB_QUERY_ERROR'));
    if (!bid) return next(createError('Bid not found.', 404, 'NOT_FOUND'));

    const { data: quotes } = await adminClient
      .from('bid_seller_quotes')
      .select('*, users!farmer_user_id(id, full_name, email)')
      .eq('bid_id', id)
      .order('created_at', { ascending: false });

    const { data: auditLog } = await adminClient
      .from('bid_audit_log')
      .select('*')
      .eq('bid_id', id)
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: flags } = await adminClient
      .from('bid_flags')
      .select('*')
      .eq('bid_id', id)
      .order('created_at', { ascending: false });

    return res.status(200).json({
      bid,
      quotes: quotes || [],
      audit_log: auditLog || [],
      flags: flags || [],
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/admin/procurement/audit-log ──────────────────────────────────────
export async function getAuditLog(req, res, next) {
  try {
    const { bid_id, actor_id, action, from, to, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('bid_audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (bid_id) query = query.eq('bid_id', bid_id);
    if (actor_id) query = query.eq('actor_id', actor_id);
    if (action) query = query.eq('action', action);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    let logs = [];
    let totalCount = 0;
    const { data, error, count } = await query;
    if (error || !data) {
      const local = getLocalAuditLogs();
      logs = local;
      totalCount = local.length;
    } else {
      logs = data;
      totalCount = count || data.length;
    }

    return res.status(200).json({
      success: true,
      audit_logs: logs,
      logs: logs,
      meta: { total: totalCount, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/admin/procurement/audit-log/export ────────────────────────────────
export async function exportAuditLogCsv(req, res, next) {
  try {
    const { bid_id, actor_id, action, from, to } = req.query;

    let query = adminClient
      .from('bid_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (bid_id) query = query.eq('bid_id', bid_id);
    if (actor_id) query = query.eq('actor_id', actor_id);
    if (action) query = query.eq('action', action);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    const rows = data || [];
    const headers = ['id', 'bid_id', 'quote_id', 'actor_id', 'actor_role', 'action', 'reason', 'ip_address', 'created_at'];
    const csvLines = [headers.join(',')];

    for (const r of rows) {
      csvLines.push(headers.map(h => {
        const val = r[h] ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bid_audit_log_${Date.now()}.csv"`);
    return res.status(200).send(csvLines.join('\n'));
  } catch (err) {
    next(err);
  }
}

// ── GET /api/admin/procurement/flags ──────────────────────────────────────────
export async function getFlags(req, res, next) {
  try {
    const { status = 'open', severity, flag_type, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('bid_flags')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (status && status !== 'all') query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);
    if (flag_type) query = query.eq('flag_type', flag_type);

    const { data, error, count } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({
      flags: data || [],
      meta: { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/admin/procurement/flags/:id/review ─────────────────────────────
export async function reviewFlag(req, res, next) {
  try {
    const { id } = req.params;
    const { status, review_note } = req.body;

    if (!['reviewed', 'dismissed', 'actioned'].includes(status)) {
      return res.status(400).json({ error: { message: 'status must be reviewed, dismissed, or actioned', code: 'INVALID_STATUS' } });
    }

    const { data, error } = await adminClient
      .from('bid_flags')
      .update({
        status,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        review_note: review_note || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));
    return res.status(200).json({ flag: data });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/admin/procurement/analytics ──────────────────────────────────────
export async function getAnalytics(req, res, next) {
  try {
    const { crop_type, from, to } = req.query;

    // Compute time range (default last 30 days)
    const endDate = to ? new Date(to) : new Date();
    const startDate = from ? new Date(from) : new Date(endDate.getTime() - 30 * 86400 * 1000);

    let bidsQuery = adminClient
      .from('procurement_bids')
      .select('id, crop_type, max_price_per_kg, quantity_tonnes, status, fpo_id, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (crop_type) bidsQuery = bidsQuery.eq('crop_type', crop_type);

    const { data: bids } = await bidsQuery;
    const { data: quotes } = await adminClient
      .from('bid_seller_quotes')
      .select('bid_id, price_per_kg, quantity_kg, status, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    const { OFFICIAL_CCEA_MSP_2026_27: MSP } = await import('../services/msp.service.js');

    // Build daily volume/price series
    const dailyMap = {};
    for (const b of (bids || [])) {
      const day = b.created_at?.slice(0, 10);
      if (!day) continue;
      if (!dailyMap[day]) dailyMap[day] = { date: day, bid_count: 0, total_qty_tonnes: 0, avg_offer: 0, prices: [] };
      dailyMap[day].bid_count++;
      dailyMap[day].total_qty_tonnes += parseFloat(b.quantity_tonnes) || 0;
      dailyMap[day].prices.push(parseFloat(b.max_price_per_kg) || 0);
    }
    const daily_series = Object.values(dailyMap).map(d => ({
      ...d,
      avg_offer: d.prices.length > 0 ? Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length * 100) / 100 : 0,
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Offer price vs MSP per crop
    const cropMap = {};
    for (const b of (bids || [])) {
      const msp = MSP[b.crop_type]?.msp_per_kg;
      if (!cropMap[b.crop_type]) cropMap[b.crop_type] = { crop: b.crop_type, avg_offer: 0, msp: msp || 0, prices: [], count: 0 };
      cropMap[b.crop_type].prices.push(parseFloat(b.max_price_per_kg) || 0);
      cropMap[b.crop_type].count++;
    }
    const price_vs_msp = Object.values(cropMap).map(c => ({
      crop: c.crop,
      avg_offer: c.prices.length > 0 ? Math.round(c.prices.reduce((a, b) => a + b, 0) / c.prices.length * 100) / 100 : 0,
      msp: c.msp,
      count: c.count,
    }));

    // Quote fulfillment rate
    const totalQuotes = (quotes || []).length;
    const acceptedQuotes = (quotes || []).filter(q => q.status === 'accepted').length;
    const fulfillment_rate = totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 1000) / 10 : 0;

    // Status distribution
    const statusMap = {};
    for (const b of (bids || [])) {
      statusMap[b.status] = (statusMap[b.status] || 0) + 1;
    }
    const status_distribution = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    return res.status(200).json({
      daily_series,
      price_vs_msp,
      fulfillment_rate,
      status_distribution,
      total_bids: (bids || []).length,
      total_quotes: totalQuotes,
      range: { from: startDate.toISOString(), to: endDate.toISOString() },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/admin/procurement/bids/:id/freeze ───────────────────────────────
export async function adminFreezeBid(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: { message: 'reason is required', code: 'MISSING_REASON' } });

    const result = await freezeBid({ bidId: id, adminId: req.user.id, reason: reason.trim(), ip: ip(req) });
    if (!result.ok) return res.status(400).json({ error: { message: result.error, code: 'ACTION_FAILED' } });
    return res.status(200).json({ message: `Bid #${id.slice(0, 8)} frozen.`, bid: result.bid });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/admin/procurement/bids/:id/unfreeze ─────────────────────────────
export async function adminUnfreezeBid(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: { message: 'reason is required', code: 'MISSING_REASON' } });

    const result = await unfreezeBid({ bidId: id, adminId: req.user.id, reason: reason.trim(), ip: ip(req) });
    if (!result.ok) return res.status(400).json({ error: { message: result.error, code: 'ACTION_FAILED' } });
    return res.status(200).json({ message: `Bid #${id.slice(0, 8)} unfrozen.`, bid: result.bid });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/admin/procurement/bids/:id/force-close ──────────────────────────
export async function adminForceCloseBid(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: { message: 'reason is required', code: 'MISSING_REASON' } });

    const result = await forceCloseBid({ bidId: id, adminId: req.user.id, reason: reason.trim(), ip: ip(req) });
    if (!result.ok) return res.status(400).json({ error: { message: result.error, code: 'ACTION_FAILED' } });
    return res.status(200).json({ message: `Bid #${id.slice(0, 8)} force-closed.`, bid: result.bid });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/admin/procurement/quotes/:id/void ───────────────────────────────
export async function adminVoidQuote(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: { message: 'reason is required', code: 'MISSING_REASON' } });

    const result = await voidQuote({ quoteId: id, adminId: req.user.id, reason: reason.trim(), ip: ip(req) });
    if (!result.ok) return res.status(400).json({ error: { message: result.error, code: 'ACTION_FAILED' } });
    return res.status(200).json({ message: `Quote #${id.slice(0, 8)} voided.`, quote: result.quote });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/admin/procurement/fpos/:id/suspend ──────────────────────────────
export async function adminSuspendFpo(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: { message: 'reason is required', code: 'MISSING_REASON' } });

    const result = await suspendFpo({ fpoUserId: id, adminId: req.user.id, reason: reason.trim(), ip: ip(req) });
    if (!result.ok) return res.status(400).json({ error: { message: result.error, code: 'ACTION_FAILED' } });
    return res.status(200).json({ message: `FPO suspended. All open bids frozen.`, user: result.user });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/admin/procurement/fpos/:id/reinstate ────────────────────────────
export async function adminReinstateFpo(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: { message: 'reason is required', code: 'MISSING_REASON' } });

    const result = await reinstateFpo({ fpoUserId: id, adminId: req.user.id, reason: reason.trim(), ip: ip(req) });
    if (!result.ok) return res.status(400).json({ error: { message: result.error, code: 'ACTION_FAILED' } });
    return res.status(200).json({ message: `FPO reinstated.`, user: result.user });
  } catch (err) {
    next(err);
  }
}
