// src/controllers/logistics.controller.js
// CRUD for logistics table. Role gate: processor / admin.

import { adminClient } from '../config/supabaseClient.js';
import { createError } from '../middleware/errorHandler.js';

// GET /api/logistics
export async function listLogistics(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('logistics')
      .select('*, orders(id, order_number, buyer_id, total_amount, batch_id, batches(id, batch_code, crop_id, crops(crop_type, variety)))')
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      const { data: fallbackData } = await adminClient
        .from('logistics')
        .select('*')
        .range(offset, offset + Number(limit) - 1)
        .order('created_at', { ascending: false });
      return res.status(200).json({ logistics: fallbackData || [] });
    }

    return res.status(200).json({ logistics: data || [] });
  } catch (err) {
    next(err);
  }
}

// GET /api/logistics/:id
export async function getLogisticsEntry(req, res, next) {
  try {
    const { id } = req.params;
    const { data, error } = await adminClient
      .from('logistics')
      .select('*, orders(*), warehouses!pickup_warehouse_id(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!data) return res.status(404).json({ error: { message: 'Logistics entry not found.', code: 'NOT_FOUND' } });

    return res.status(200).json({ logistics: data });
  } catch (err) {
    next(err);
  }
}

// POST /api/logistics — create logistics entry for an order
export async function createLogistics(req, res, next) {
  try {
    const {
      order_id, carrier_company_name, vehicle_number, driver_name, driver_phone,
      pickup_warehouse_id, pickup_address, delivery_address,
      dispatch_time, estimated_delivery_time,
    } = req.body;

    if (!order_id || !carrier_company_name || !vehicle_number || !driver_name || !driver_phone || !pickup_address || !delivery_address) {
      return res.status(400).json({ error: { message: 'Required logistics fields missing.', code: 'MISSING_FIELDS' } });
    }

    const tracking_number = `TRK-${Date.now().toString(36).toUpperCase()}`;

    const { data, error } = await adminClient
      .from('logistics')
      .insert({
        order_id, carrier_company_name, vehicle_number, driver_name, driver_phone,
        pickup_warehouse_id: pickup_warehouse_id || null,
        pickup_address, delivery_address,
        dispatch_time: dispatch_time || null,
        estimated_delivery_time: estimated_delivery_time || null,
        tracking_number,
        transporter_id: req.user.id,
        status: 'assigned',
        status_updates_history: [],
      })
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_INSERT_ERROR'));

    return res.status(201).json({ message: 'Logistics entry created.', logistics: data });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/logistics/:id/status — update delivery status
export async function updateLogisticsStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, current_latitude, current_longitude, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: { message: 'status is required.', code: 'MISSING_FIELDS' } });
    }

    // Append to history log
    const { data: existing } = await adminClient
      .from('logistics')
      .select('status_updates_history')
      .eq('id', id)
      .maybeSingle();

    const history = existing?.status_updates_history || [];
    history.push({
      status,
      timestamp: new Date().toISOString(),
      latitude: current_latitude || null,
      longitude: current_longitude || null,
      notes: notes || null,
    });

    const updates = {
      status,
      status_updates_history: history,
      updated_at: new Date().toISOString(),
    };
    if (current_latitude) updates.current_latitude = current_latitude;
    if (current_longitude) updates.current_longitude = current_longitude;
    if (status === 'delivered') updates.actual_delivery_time = new Date().toISOString();

    const { data, error } = await adminClient
      .from('logistics')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));

    return res.status(200).json({ message: 'Logistics status updated.', logistics: data });
  } catch (err) {
    next(err);
  }
}
