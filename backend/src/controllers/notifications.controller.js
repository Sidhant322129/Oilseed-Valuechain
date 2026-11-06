// src/controllers/notifications.controller.js
// CRUD for the notifications table.
// Users can only read/mark-read their own notifications.
// Admin can create notifications for any user.

import { adminClient } from '../config/supabaseClient.js';
import { createError } from '../middleware/errorHandler.js';
import { cleanupExpiredPriceAlerts } from '../services/priceAlert.service.js';
import { sendBulkNotifications } from '../services/notification.service.js';

// GET /api/notifications — get own notifications
export async function listNotifications(req, res, next) {
  try {
    const { id: userId } = req.user;
    const { is_read, category, page = 1, limit = 30 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    if (is_read !== undefined) query = query.eq('is_read', is_read === 'true');
    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ notifications: data, meta: { page: Number(page), limit: Number(limit) } });
  } catch (err) {
    next(err);
  }
}

// GET /api/notifications/price-alerts — get authenticated user's price alerts
export async function getPriceAlerts(req, res, next) {
  try {
    const { id: userId } = req.user;
    const { is_read, limit = 20, page = 1 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('category', 'mandi_price')
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (is_read !== undefined) {
      query = query.eq('is_read', is_read === 'true');
    }

    const { data, count, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    // Count unread price alerts
    const { count: unreadCount } = await adminClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category', 'mandi_price')
      .eq('is_read', false);

    return res.status(200).json({
      priceAlerts: data || [],
      totalCount: count || 0,
      unreadCount: unreadCount || 0,
      meta: { page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/notifications/:id/read — mark a notification as read
export async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    const { data, error } = await adminClient
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', userId) // Ensure user can only mark their own
      .select()
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));
    if (!data) {
      return res.status(404).json({ error: { message: 'Notification not found.', code: 'NOT_FOUND' } });
    }

    return res.status(200).json({ message: 'Notification marked as read.', notification: data });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/notifications/mark-all-read — mark all own notifications as read
export async function markAllRead(req, res, next) {
  try {
    const { id: userId } = req.user;

    const { error } = await adminClient
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));

    return res.status(200).json({ message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/notifications — create single or bulk notifications using adminClient
export async function createNotification(req, res, next) {
  try {
    const rawItems = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.notifications)
      ? req.body.notifications
      : [req.body];

    const inserted = await sendBulkNotifications(rawItems);

    if (inserted.length === 0) {
      return res.status(400).json({
        error: { message: 'user_id, title, and message are required for each notification.', code: 'MISSING_FIELDS' },
      });
    }

    return res.status(201).json({
      message: `${inserted.length} notification(s) created.`,
      notification: inserted.length === 1 ? inserted[0] : undefined,
      notifications: inserted,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/notifications/price-alerts/cleanup — purge expired alerts
export async function cleanupPriceAlerts(req, res, next) {
  try {
    const { id: userId } = req.user;
    const { days } = req.query;
    const expiryDays = days ? Number(days) : undefined;
    const result = await cleanupExpiredPriceAlerts(userId, expiryDays);
    return res.status(200).json({ message: 'Expired price alerts cleaned up.', ...result });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/notifications/:id
export async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;

    let query = adminClient.from('notifications').delete().eq('id', id);
    if (role !== 'admin') query = query.eq('user_id', userId);

    const { error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_DELETE_ERROR'));

    return res.status(200).json({ message: 'Notification deleted.' });
  } catch (err) {
    next(err);
  }
}

