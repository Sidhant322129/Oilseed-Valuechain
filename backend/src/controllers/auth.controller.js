// src/controllers/auth.controller.js
// Handles: signup, login (OTP dispatch), OTP verify, session refresh, DigiLocker scaffold
// All auth operations call check_user_exists RPC from Week 1 before proceeding.

import { adminClient, anonClient } from '../config/supabaseClient.js';
import { validationResult } from 'express-validator';
import { createError } from '../middleware/errorHandler.js';

// ─── Utility ───────────────────────────────────────────────────────────────

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        message: 'Validation failed. Check the errors field for details.',
        code: 'VALIDATION_ERROR',
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      },
    });
  }
  return null;
}

async function checkUserExists(email) {
  const cleanEmail = email.trim().toLowerCase();

  // Primary: RPC function from auth_trigger.sql
  const { data, error } = await adminClient.rpc('check_user_exists', {
    check_email: cleanEmail,
  });

  if (error) {
    console.warn('[checkUserExists] RPC failed:', error.code, error.message);

    // Fallback: direct table query (adminClient bypasses RLS)
    const { data: rows, error: qErr } = await adminClient
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .limit(1);

    if (qErr) {
      console.error('[checkUserExists] Direct query ALSO failed:', qErr.code, qErr.message, qErr.details);
      throw createError(
        `DB error: ${qErr.message} (code: ${qErr.code})`,
        500,
        'DB_QUERY_ERROR'
      );
    }

    return Array.isArray(rows) && rows.length > 0;
  }

  return Boolean(data);
}

// ─── POST /api/auth/signup ──────────────────────────────────────────────────
// Body: { email, role, full_name }
// Sends email OTP. Returns 409 if account already exists.
export async function signup(req, res, next) {
  try {
    const validationFailed = handleValidationErrors(req, res);
    if (validationFailed) return;

    const { email, role = 'farmer', full_name } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // Enforce signup-vs-login separation using Week 1 RPC
    const exists = await checkUserExists(cleanEmail);
    if (exists) {
      return res.status(409).json({
        error: {
          message: 'An account with this email already exists. Please sign in instead.',
          code: 'USER_ALREADY_EXISTS',
        },
      });
    }

    // Dispatch OTP — shouldCreateUser: true creates the auth.users row
    const { error: otpError } = await anonClient.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
        data: {
          role,
          full_name: full_name || cleanEmail.split('@')[0],
        },
      },
    });

    if (otpError) {
      return next(createError(`OTP dispatch failed: ${otpError.message}`, 502, 'OTP_SEND_FAILED'));
    }

    return res.status(200).json({
      message: 'OTP sent to your email. Please check your inbox and enter the 6-digit code.',
      email: cleanEmail,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/login ───────────────────────────────────────────────────
// Body: { email }
// Sends email OTP. Returns 404 if no account found.
export async function login(req, res, next) {
  try {
    const validationFailed = handleValidationErrors(req, res);
    if (validationFailed) return;

    const { email } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    const exists = await checkUserExists(cleanEmail);
    if (!exists) {
      return res.status(404).json({
        error: {
          message: 'No account found with this email. Please sign up first.',
          code: 'USER_NOT_FOUND',
        },
      });
    }

    const { error: otpError } = await anonClient.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: false },
    });

    if (otpError) {
      return next(createError(`OTP dispatch failed: ${otpError.message}`, 502, 'OTP_SEND_FAILED'));
    }

    return res.status(200).json({
      message: 'OTP sent to your email. Please check your inbox and enter the 6-digit code.',
      email: cleanEmail,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/verify-otp ─────────────────────────────────────────────
// Body: { email, token, role, full_name }
// Verifies OTP and upserts the public.users profile row.
export async function verifyOtp(req, res, next) {
  try {
    const validationFailed = handleValidationErrors(req, res);
    if (validationFailed) return;

    const { email, token, role = 'farmer', full_name } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
      email: cleanEmail,
      token,
      type: 'email',
    });

    if (verifyError || !verifyData?.session) {
      return res.status(400).json({
        error: {
          message: 'Invalid or expired OTP. Please request a new code.',
          code: 'OTP_INVALID',
        },
      });
    }

    const authUser = verifyData.session.user;

    // Upsert profile into public.users — safe to call on both signup and signin
    const { data: profile, error: upsertError } = await adminClient
      .from('users')
      .upsert(
        {
          id: authUser.id,
          email: cleanEmail,
          full_name: full_name || cleanEmail.split('@')[0],
          role: role || 'farmer',
          is_verified: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id', ignoreDuplicates: false }
      )
      .select()
      .maybeSingle();

    if (upsertError) {
      console.warn('[auth/verify-otp] Profile upsert warning:', upsertError.message);
    }

    return res.status(200).json({
      message: 'Authentication successful.',
      session: {
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
        expires_at: verifyData.session.expires_at,
      },
      user: profile || {
        id: authUser.id,
        email: cleanEmail,
        role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/refresh ─────────────────────────────────────────────────
// Body: { refresh_token }
// Refreshes an expired access token.
export async function refreshSession(req, res, next) {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: { message: 'refresh_token is required.', code: 'MISSING_REFRESH_TOKEN' },
      });
    }

    const { data, error } = await anonClient.auth.refreshSession({ refresh_token });

    if (error || !data?.session) {
      return res.status(401).json({
        error: {
          message: 'Refresh token is invalid or expired. Please sign in again.',
          code: 'REFRESH_FAILED',
        },
      });
    }

    return res.status(200).json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
// Returns the authenticated user's profile. Requires authenticate middleware.
export async function getMe(req, res) {
  return res.status(200).json({ user: req.user });
}

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
// Invalidates the session server-side. Token passed in Authorization header.
export async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (token) {
      // Sign out the specific session associated with this token
      await anonClient.auth.admin?.signOut(token).catch(() => {});
    }
    return res.status(200).json({ message: 'Signed out successfully.' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/digilocker ─────────────────────────────────────────────
// DigiLocker eKYC scaffold — full Setu DigiLocker Sandbox integration is Week 8.
// Validates input and returns a structured 501 so Week 3 frontend can build against it.
export async function digilockerInitiate(req, res) {
  const { farmer_id } = req.body;

  if (!farmer_id) {
    return res.status(400).json({
      error: { message: 'farmer_id is required.', code: 'MISSING_FARMER_ID' },
    });
  }

  return res.status(501).json({
    message: 'DigiLocker eKYC integration is pending (Week 8).',
    code: 'INTEGRATION_PENDING',
    contract: {
      endpoint: 'POST /api/auth/digilocker',
      description: 'Initiates Setu DigiLocker Sandbox eKYC flow for a farmer.',
      request_body: { farmer_id: 'uuid — the farmer profile ID' },
      expected_response_when_live: {
        redirect_url: 'string — Setu DigiLocker consent URL to redirect farmer to',
        session_id: 'string — DigiLocker session ID for callback verification',
      },
    },
  });
}
