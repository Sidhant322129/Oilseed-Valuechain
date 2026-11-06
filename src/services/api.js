// src/services/api.js
// Axios client for the Express backend (VITE_API_URL).
//
// API CLIENT CONVENTION:
//   - BASE_URL is set to `<origin>/api` (e.g. `http://localhost:5000/api` or `/api` via Vite proxy).
//   - All frontend service calls MUST pass paths WITHOUT a leading `/api` (e.g. `/auction/lots`, `/marketplace/batches`).
//   - Any accidental leading `/api/` in request paths is sanitized below to eliminate double prefixes.
//
// Reads the Supabase session JWT and attaches it as Authorization: Bearer <token>
// on every request so the backend JWT middleware can authenticate the caller.
//
// USAGE:
//   import { apiGet, apiPost, apiPatch } from '@/services/api';
//   const data = await apiGet('/marketplace/batches');
//   await apiPost('/crops', { crop_type: 'mustard', ... });

import axios from 'axios';
import { supabase } from '@/lib/supabaseClient';

// In dev: Vite proxy forwards /api/* -> http://localhost:5000/api/* (no CORS preflight).
// In prod: set VITE_API_URL=https://your-ec2-host.
const BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') + '/api'
  : '/api';

/** Strips duplicate /api prefix if accidentally provided by caller */
function normalizeApiPath(path) {
  if (!path) return '';
  return path.startsWith('/api/') ? path.slice(4) : path;
}

/**
 * Builds an axios config object with a fresh, valid Supabase JWT attached.
 *
 * Strategy:
 *  1. Call getSession() to read the cached session from localStorage.
 *  2. If the access_token is missing OR the token will expire within the next
 *     60 seconds, call refreshSession() to silently obtain a new token pair.
 *  3. Return the Authorization header with the (possibly refreshed) token.
 *
 * This prevents the "Token is invalid or has expired" error that occurs when
 * a component mounts after the 1-hour JWT lifetime has elapsed.
 */
async function buildAuthHeaders() {
  try {
    let { data: { session } } = await supabase.auth.getSession();

    // Check if token is missing or expires within the next 60 seconds
    const expiresAt = session?.expires_at; // Unix timestamp (seconds)
    const nowSecs = Math.floor(Date.now() / 1000);
    const isAboutToExpire = !session?.access_token || (expiresAt && expiresAt - nowSecs < 60);

    if (isAboutToExpire) {
      console.info('[api] Token missing or near-expiry — refreshing session…');
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr && refreshed?.session?.access_token) {
        session = refreshed.session;
      } else {
        console.warn('[api] Session refresh failed — request will be unauthenticated.', refreshErr?.message);
        return {};
      }
    }

    if (!session?.access_token) {
      console.warn('[api] No active session — request will be unauthenticated.');
      return {};
    }

    return { Authorization: `Bearer ${session.access_token}` };
  } catch (err) {
    console.warn('[api] Could not retrieve session:', err.message);
    return {};
  }
}

/**
 * Normalise Axios errors into a plain Error with a useful message.
 * Reads the backend standard JSON error body when available.
 */
function normaliseError(err) {
  if (err.response) {
    const body = err.response.data;

    // Backend standard envelope: { error: { message, code } }
    // body.error can be an object — must drill in, not pass the object directly
    // to new Error() which would produce "[object Object]".
    let message;
    if (typeof body === 'string') {
      message = body;
    } else if (body?.message && typeof body.message === 'string') {
      message = body.message;
    } else if (body?.error) {
      if (typeof body.error === 'string') {
        message = body.error;
      } else if (body.error?.message && typeof body.error.message === 'string') {
        // Standard envelope: { error: { message: '...', code: '...', errors?: [...] } }
        if (Array.isArray(body.error?.errors) && body.error.errors.length > 0) {
          const first = body.error.errors[0];
          const detail = first.message || first.msg;
          message = `${first.field || first.path ? (first.field || first.path) + ': ' : ''}${detail}`;
        } else {
          message = body.error.message;
        }
      } else {
        // Last resort — stringify so we NEVER produce "[object Object]"
        try {
          const s = JSON.stringify(body.error);
          message = s === '{}' ? null : s;
        } catch (_) { message = null; }
      }
    }
    if (!message) {
      message = `HTTP ${err.response.status}: ${err.response.statusText || 'Unknown error'}`;
    }

    const error = new Error(message);
    error.status = err.response.status;
    error.body = body;
    return error;
  }
  if (err.request) {
    const error = new Error('No response from backend — is the Express server running?');
    error.status = 0;
    return error;
  }
  if (err instanceof Error) {
    if (err.message === '[object Object]' || !err.message) {
      return new Error('Something went wrong. Please try again.');
    }
    return err;
  }
  return new Error('Something went wrong. Please try again.');
}

/** GET /api/<path> */
export async function apiGet(path, params = {}, config = {}) {
  const headers = await buildAuthHeaders();
  const cleanPath = normalizeApiPath(path);
  try {
    const response = await axios.get(`${BASE_URL}${cleanPath}`, {
      ...config,
      headers: { ...headers, ...(config.headers || {}) },
      params,
      timeout: config.timeout || 15000,
    });
    return response.data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/** POST /api/<path> */
export async function apiPost(path, body = {}, config = {}) {
  const headers = await buildAuthHeaders();
  const cleanPath = normalizeApiPath(path);
  try {
    const response = await axios.post(`${BASE_URL}${cleanPath}`, body, {
      ...config,
      headers: { ...headers, 'Content-Type': 'application/json', ...(config.headers || {}) },
      timeout: config.timeout || 45000,
    });
    return response.data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * POST /api/<path> with an extended timeout (3 min) for long-running server tasks
 * such as AGMARKNET ingestion that make many sequential external API calls.
 */
export async function apiPostLongRunning(path, body = {}, config = {}) {
  const headers = await buildAuthHeaders();
  const cleanPath = normalizeApiPath(path);
  try {
    const response = await axios.post(`${BASE_URL}${cleanPath}`, body, {
      ...config,
      headers: { ...headers, 'Content-Type': 'application/json', ...(config.headers || {}) },
      timeout: config.timeout || 180000, // 3 minutes
    });
    return response.data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/** PATCH /api/<path> */
export async function apiPatch(path, body = {}, config = {}) {
  const headers = await buildAuthHeaders();
  const cleanPath = normalizeApiPath(path);
  try {
    const response = await axios.patch(`${BASE_URL}${cleanPath}`, body, {
      ...config,
      headers: { ...headers, 'Content-Type': 'application/json', ...(config.headers || {}) },
      timeout: config.timeout || 15000,
    });
    return response.data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/** DELETE /api/<path> */
export async function apiDelete(path, config = {}) {
  const headers = await buildAuthHeaders();
  const cleanPath = normalizeApiPath(path);
  try {
    const response = await axios.delete(`${BASE_URL}${cleanPath}`, {
      ...config,
      headers: { ...headers, ...(config.headers || {}) },
      timeout: config.timeout || 15000,
    });
    return response.data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/** Download binary file (e.g. PDF) as browser file download */
export async function apiDownloadBlob(path, filename = 'download.pdf') {
  const headers = await buildAuthHeaders();
  const cleanPath = normalizeApiPath(path);
  try {
    const response = await axios.get(`${BASE_URL}${cleanPath}`, {
      headers,
      responseType: 'blob',
      timeout: 20000,
    });
    const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
    return true;
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * Dispatch notifications via backend (adminClient bypasses RLS) with Supabase direct fallback.
 */
export async function dispatchNotifications(notifs) {
  if (!notifs) return [];
  const payload = Array.isArray(notifs) ? notifs : [notifs];
  if (payload.length === 0) return [];

  try {
    const res = await apiPost('/notifications', payload);
    return res?.notifications || (res?.notification ? [res.notification] : []);
  } catch (err) {
    console.warn('[dispatchNotifications] Backend dispatch failed, trying Supabase direct insert fallback:', err);
    try {
      const { data, error } = await supabase.from('notifications').insert(payload).select();
      if (!error && data) return data;
    } catch (_) {}
    return [];
  }
}


