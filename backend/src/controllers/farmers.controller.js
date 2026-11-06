// src/controllers/farmers.controller.js
// CRUD for the farmers and land_records tables.
// Role gate: farmer (own record), fpo (all farmers in district), admin (all)

import { adminClient } from '../config/supabaseClient.js';
import { validationResult } from 'express-validator';
import { createError } from '../middleware/errorHandler.js';
import { anchorFarmerOnChain } from '../services/blockchain.service.js';
import { relayRegisterFarmer } from '../services/relayer.service.js';

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

function normalizeIndianPhoneNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const digits = String(value).replace(/\D/g, '').slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? digits : undefined;
}

// GET /api/farmers — list farmers (admin/fpo: all; farmer: own profile only)
export async function listFarmers(req, res, next) {
  try {
    const { role, id: userId } = req.user;
    const { district, state, page = 1, limit = 20 } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    let query = adminClient
      .from('farmers')
      .select(`
        id, user_id, state, district, village, pincode,
        kyc_status, total_land_area_acres, fpo_membership_name, created_at,
        users!inner(full_name, email, role, phone_number)
      `)
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    if (role === 'farmer') {
      // Farmers can only see their own record
      query = query.eq('user_id', userId);
    } else {
      if (district) query = query.eq('district', district);
      if (state) query = query.eq('state', state);
    }

    const { data, error, count } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ farmers: data, meta: { page: Number(page), limit: Number(limit) } });
  } catch (err) {
    next(err);
  }
}

// GET /api/farmers/:id — get single farmer profile
export async function getFarmer(req, res, next) {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    const { data, error } = await adminClient
      .from('farmers')
      .select(`
        *, users!inner(full_name, email, phone_number, role, avatar_url, is_verified),
        land_records(*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!data) {
      return res.status(404).json({ error: { message: 'Farmer profile not found.', code: 'FARMER_NOT_FOUND' } });
    }

    // Farmers can only fetch their own profile
    if (role === 'farmer' && data.user_id !== userId) {
      return res.status(403).json({ error: { message: 'Access denied.', code: 'ROLE_FORBIDDEN' } });
    }

    return res.status(200).json({ farmer: data });
  } catch (err) {
    next(err);
  }
}

// POST /api/farmers — create farmer profile (linked to authenticated user)
export async function createFarmer(req, res, next) {
  try {
    const validationFailed = handleValidationErrors(req, res);
    if (validationFailed) return;

    const { id: userId } = req.user;
    const {
      state, district, taluka_tehsil, village, pincode,
      bank_name, bank_account_number, bank_ifsc_code, upi_id,
      fpo_membership_name, total_land_area_acres, phone_number,
    } = req.body;

    const normalizedPhoneNumber = normalizeIndianPhoneNumber(phone_number);
    if (phone_number && !normalizedPhoneNumber) {
      return res.status(400).json({
        error: { message: 'Enter a valid 10-digit Indian mobile number.', code: 'INVALID_PHONE_NUMBER' },
      });
    }

    // Check if profile already exists
    const { data: existing } = await adminClient
      .from('farmers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: { message: 'A farmer profile already exists for this account.', code: 'PROFILE_ALREADY_EXISTS' },
      });
    }

    if (normalizedPhoneNumber) {
      const { error: phoneError } = await adminClient
        .from('users')
        .update({ phone_number: normalizedPhoneNumber })
        .eq('id', userId);
      if (phoneError) return next(createError(phoneError.message, 500, 'PHONE_UPDATE_ERROR'));
    }

    const { data, error } = await adminClient
      .from('farmers')
      .insert({
        user_id: userId,
        state,
        district,
        taluka_tehsil,
        village,
        pincode,
        bank_name,
        bank_account_number,
        bank_ifsc_code,
        upi_id,
        fpo_membership_name,
        total_land_area_acres: total_land_area_acres || 0,
      })
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_INSERT_ERROR'));

    // Automatically anchor farmer identity on Ethereum Sepolia via FarmerRegistry.sol
    let blockchainReceipt = null;
    try {
      blockchainReceipt = await anchorFarmerOnChain(data);
      // Asynchronously broadcast on-chain transaction to FarmerRegistry.sol on Sepolia
      relayRegisterFarmer({
        farmerId: data.id,
        walletAddress: null
      });
    } catch (bcErr) {
      console.warn('[FarmersController] Automated blockchain sync non-fatal warning:', bcErr.message);
    }

    return res.status(201).json({
      message: 'Farmer profile created and anchored to sovereign blockchain identity successfully.',
      farmer: data,
      blockchain: blockchainReceipt
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/farmers/member — FPO / Admin onboards a member farmer into FPO collective registry
export async function registerMemberFarmer(req, res, next) {
  try {
    const validationFailed = handleValidationErrors(req, res);
    if (validationFailed) return;

    const {
      full_name, email, phone_number, district, state,
      village, pincode, total_land_area_acres, kyc_status,
    } = req.body;

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (full_name || '').trim();

    // 1. Check if user already exists
    let userId = null;
    const { data: existingUser } = await adminClient
      .from('users')
      .select('id, email, full_name, phone_number')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingUser) {
      userId = existingUser.id;
      if (cleanName && cleanName !== existingUser.full_name) {
        await adminClient.from('users').update({ full_name: cleanName }).eq('id', userId);
      }
    } else {
      // 2. Create in auth
      const tempPassword = `Farmer@${Math.random().toString(36).slice(-8)}!`;
      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          role: 'farmer',
          full_name: cleanName,
          phone_number: phone_number || null,
        },
      });

      if (authErr) {
        return next(createError(authErr.message, 400, 'AUTH_USER_CREATION_FAILED'));
      }

      userId = authUser.user.id;

      // Ensure public.users entry exists
      await adminClient.from('users').upsert({
        id: userId,
        email: cleanEmail,
        full_name: cleanName,
        phone_number: phone_number || null,
        role: 'farmer',
        is_verified: true,
      });
    }

    // 3. Upsert farmer profile
    const { data: existingFarmer } = await adminClient
      .from('farmers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    let farmerRecord;
    const farmerPayload = {
      district: district || 'Morena',
      state: state || 'Madhya Pradesh',
      village: village || 'Ambah',
      pincode: pincode || '476001',
      total_land_area_acres: parseFloat(total_land_area_acres) || 5.0,
      kyc_status: kyc_status || 'verified',
      fpo_membership_name: req.user?.full_name || 'FPO Collective',
      updated_at: new Date().toISOString(),
    };

    if (existingFarmer) {
      const { data, error } = await adminClient
        .from('farmers')
        .update(farmerPayload)
        .eq('id', existingFarmer.id)
        .select(`
          id, user_id, district, state, village, pincode,
          total_land_area_acres, kyc_status, fpo_membership_name, created_at,
          users!inner(full_name, email, phone_number)
        `)
        .single();

      if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));
      farmerRecord = data;
    } else {
      const { data, error } = await adminClient
        .from('farmers')
        .insert({
          user_id: userId,
          ...farmerPayload,
        })
        .select(`
          id, user_id, district, state, village, pincode,
          total_land_area_acres, kyc_status, fpo_membership_name, created_at,
          users!inner(full_name, email, phone_number)
        `)
        .single();

      if (error) return next(createError(error.message, 500, 'DB_INSERT_ERROR'));
      farmerRecord = data;
    }

    // Automatically anchor member farmer identity on Ethereum Sepolia
    try {
      relayRegisterFarmer({
        farmerId: farmerRecord.id,
        walletAddress: null
      });
    } catch (bcErr) {
      console.warn('[FarmersController] relayRegisterFarmer warning:', bcErr.message);
    }

    return res.status(201).json({
      message: 'Member farmer registered successfully.',
      farmer: farmerRecord,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/farmers/:id — update farmer profile
export async function updateFarmer(req, res, next) {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    const { data: existing } = await adminClient
      .from('farmers')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({ error: { message: 'Farmer profile not found.', code: 'FARMER_NOT_FOUND' } });
    }

    if (role === 'farmer' && existing.user_id !== userId) {
      return res.status(403).json({ error: { message: 'You can only update your own profile.', code: 'ROLE_FORBIDDEN' } });
    }

    if (req.body.phone_number !== undefined) {
      const normalizedPhoneNumber = normalizeIndianPhoneNumber(req.body.phone_number);
      if (req.body.phone_number && !normalizedPhoneNumber) {
        return res.status(400).json({
          error: { message: 'Enter a valid 10-digit Indian mobile number.', code: 'INVALID_PHONE_NUMBER' },
        });
      }

      const { error: phoneError } = await adminClient
        .from('users')
        .update({ phone_number: normalizedPhoneNumber })
        .eq('id', existing.user_id);
      if (phoneError) return next(createError(phoneError.message, 500, 'PHONE_UPDATE_ERROR'));
    }

    const allowedFields = [
      'state', 'district', 'taluka_tehsil', 'village', 'pincode',
      'bank_name', 'bank_account_number', 'bank_ifsc_code', 'upi_id',
      'fpo_membership_name', 'total_land_area_acres',
    ];

    if (role === 'fpo' || role === 'admin') {
      allowedFields.push('kyc_status');
    }

    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    updates.updated_at = new Date().toISOString();

    const { data, error } = await adminClient
      .from('farmers')
      .update(updates)
      .eq('id', id)
      .select(`
        id, user_id, district, state, village, pincode,
        total_land_area_acres, kyc_status, fpo_membership_name, created_at,
        users!inner(full_name, email, phone_number)
      `)
      .single();

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));

    // If KYC status became verified, anchor on Sepolia
    if (req.body.kyc_status === 'verified') {
      try {
        relayRegisterFarmer({
          farmerId: id,
          walletAddress: null
        });
      } catch (bcErr) {
        console.warn('[FarmersController] relayRegisterFarmer KYC warning:', bcErr.message);
      }
    }

    return res.status(200).json({ message: 'Farmer profile updated.', farmer: data });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/farmers/:id — admin or fpo
export async function deleteFarmer(req, res, next) {
  try {
    const { id } = req.params;

    const { error } = await adminClient.from('farmers').delete().eq('id', id);
    if (error) return next(createError(error.message, 500, 'DB_DELETE_ERROR'));

    return res.status(200).json({ message: 'Farmer profile deleted.' });
  } catch (err) {
    next(err);
  }
}

