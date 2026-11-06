// src/controllers/admin.controller.js
// Admin-only endpoints: user management, system stats, audit views.
// Strictly requireRole('admin') — enforced at route level.

import { adminClient } from '../config/supabaseClient.js';
import { createError } from '../middleware/errorHandler.js';
import { broadcastToRole } from '../services/notification.service.js';

// GET /api/admin/users — list all platform users
export async function listUsers(req, res, next) {
  try {
    const { role, is_verified, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('users')
      .select('id, email, full_name, role, is_verified, created_at, updated_at')
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    if (role) query = query.eq('role', role);
    if (is_verified !== undefined) query = query.eq('is_verified', is_verified === 'true');

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ users: data, meta: { page: Number(page), limit: Number(limit) } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/users/:id/role — change a user's role
export async function updateUserRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: { message: `role must be one of: ${validRoles.join(', ')}`, code: 'INVALID_ROLE' } });
    }

    const { data, error } = await adminClient
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));

    return res.status(200).json({ message: 'User role updated.', user: data });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/users/:id/verify — mark user as verified
export async function verifyUser(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await adminClient
      .from('users')
      .update({ is_verified: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));

    return res.status(200).json({ message: 'User verified.', user: data });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/users/:id — hard delete user
export async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ error: { message: 'You cannot delete your own account.', code: 'SELF_DELETE_FORBIDDEN' } });
    }

    const { error } = await adminClient.from('users').delete().eq('id', id);
    if (error) return next(createError(error.message, 500, 'DB_DELETE_ERROR'));

    return res.status(200).json({ message: 'User deleted.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/stats — platform-wide statistics
export async function getPlatformStats(req, res, next) {
  try {
    const [
      { count: userCount },
      { count: farmerCount },
      { count: cropCount },
      { count: orderCount },
      { count: loanCount },
    ] = await Promise.all([
      adminClient.from('users').select('*', { count: 'exact', head: true }),
      adminClient.from('farmers').select('*', { count: 'exact', head: true }),
      adminClient.from('crops').select('*', { count: 'exact', head: true }),
      adminClient.from('orders').select('*', { count: 'exact', head: true }),
      adminClient.from('loan_applications').select('*', { count: 'exact', head: true }),
    ]);

    return res.status(200).json({
      stats: {
        total_users: userCount,
        total_farmers: farmerCount,
        total_crop_registrations: cropCount,
        total_orders: orderCount,
        total_loan_applications: loanCount,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/broadcast or POST /api/admin/notifications/broadcast — send bulk notification (admin only)
export async function broadcastNotification(req, res, next) {
  try {
    const { title, message, category = 'system', priority = 'normal', target_role } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: { message: 'title and message are required.', code: 'MISSING_FIELDS' } });
    }

    const { count, notifications } = await broadcastToRole({
      target_role,
      title,
      message,
      category,
      priority,
    });

    const roleLabel = target_role === 'buyer'
      ? 'all buyers'
      : target_role === 'fpo'
      ? 'all FPOs'
      : (target_role && target_role !== 'all' ? `all ${target_role}s` : 'all platform users');
    return res.status(200).json({
      message: `Broadcast delivered successfully to ${roleLabel} (${count} recipient${count !== 1 ? 's' : ''}).`,
      count,
      notifications,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/audit-logs — platform-wide system audit events (admin only)
export async function getAuditLogs(req, res, next) {
  try {
    const { limit = 25 } = req.query;

    const { data, error } = await adminClient
      .from('notifications')
      .select('id, title, message, category, priority, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ logs: data || [] });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/procurement-bids — list all procurement bids for administrative audit
export async function listProcurementBids(req, res, next) {
  try {
    const { getAllProcurementBids } = await import('../services/procurement.service.js');
    const bids = await getAllProcurementBids();
    return res.status(200).json({ bids, count: bids.length });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/procurement-bids/:id/cancel — administrative force-cancel of a bid
export async function forceCancelProcurementBid(req, res, next) {
  try {
    const { id } = req.params;
    const { forceCancelBid } = await import('../services/procurement.service.js');
    const updated = await forceCancelBid(id, req.user?.id);
    return res.status(200).json({ message: `Bid #${id} force-cancelled.`, bid: updated });
  } catch (err) {
    next(err);
  }
}


