// src/controllers/warehouse.controller.js
// CRUD for warehouses table. Role gate: fpo / processor / admin.

import { adminClient } from '../config/supabaseClient.js';
import { validationResult } from 'express-validator';
import { createError } from '../middleware/errorHandler.js';

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        message: 'Validation failed.',
        code: 'VALIDATION_ERROR',
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      },
    });
  }
  return null;
}

// GET /api/warehouse
export async function listWarehouses(req, res, next) {
  try {
    const { state, district, has_cold_storage, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('warehouses')
      .select('*, users!manager_id(full_name, email)')
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    if (state) query = query.eq('state', state);
    if (district) query = query.eq('district', district);
    if (has_cold_storage !== undefined) query = query.eq('has_cold_storage', has_cold_storage === 'true');

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ warehouses: data });
  } catch (err) {
    next(err);
  }
}

// GET /api/warehouse/:id
export async function getWarehouse(req, res, next) {
  try {
    const { id } = req.params;
    const { data, error } = await adminClient
      .from('warehouses')
      .select('*, users!manager_id(full_name, email, phone_number)')
      .eq('id', id)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!data) return res.status(404).json({ error: { message: 'Warehouse not found.', code: 'NOT_FOUND' } });

    return res.status(200).json({ warehouse: data });
  } catch (err) {
    next(err);
  }
}

// POST /api/warehouse
export async function createWarehouse(req, res, next) {
  try {
    const validationFailed = handleValidationErrors(req, res);
    if (validationFailed) return;

    const {
      name, state, district, address, pincode,
      total_capacity_tonnes, available_capacity_tonnes,
      has_cold_storage, has_moisture_control,
      storage_rate_per_tonne_month, contact_phone, license_number,
      latitude, longitude,
    } = req.body;

    const { data, error } = await adminClient
      .from('warehouses')
      .insert({
        name, state, district, address, pincode,
        total_capacity_tonnes, available_capacity_tonnes,
        has_cold_storage: has_cold_storage || false,
        has_moisture_control: has_moisture_control !== undefined ? has_moisture_control : true,
        storage_rate_per_tonne_month: storage_rate_per_tonne_month || 0,
        contact_phone: contact_phone || null,
        license_number: license_number || null,
        latitude: latitude || null,
        longitude: longitude || null,
        manager_id: req.user.id,
      })
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_INSERT_ERROR'));

    return res.status(201).json({ message: 'Warehouse created.', warehouse: data });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/warehouse/:id
export async function updateWarehouse(req, res, next) {
  try {
    const { id } = req.params;
    const allowedFields = [
      'name', 'address', 'available_capacity_tonnes', 'total_capacity_tonnes',
      'has_cold_storage', 'has_moisture_control', 'storage_rate_per_tonne_month', 'contact_phone',
    ];

    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    updates.updated_at = new Date().toISOString();

    const { data, error } = await adminClient
      .from('warehouses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));

    return res.status(200).json({ message: 'Warehouse updated.', warehouse: data });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/warehouse/:id — admin only
export async function deleteWarehouse(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await adminClient.from('warehouses').delete().eq('id', id);
    if (error) return next(createError(error.message, 500, 'DB_DELETE_ERROR'));
    return res.status(200).json({ message: 'Warehouse deleted.' });
  } catch (err) {
    next(err);
  }
}
