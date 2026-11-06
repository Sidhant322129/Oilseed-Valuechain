// src/utils/getErrorMessage.js
// Safely extracts a human-readable string from ANY error shape.
// Strictly guarantees that "[object Object]" is NEVER returned.
//
// Handles:
//   - Error instance         -> clean message / checks body & response
//   - Axios error (4xx/5xx) -> body.error.message / body.message / validation errors array
//   - Supabase PostgREST    -> err.message / details / hint
//   - Plain string          -> returned if valid
//   - null / undefined      -> friendly fallback
//   - Unknown object        -> JSON.stringify with guard against empty / object strings
//
// USAGE:
//   import { getErrorMessage } from '@/utils/getErrorMessage';
//   catch (err) { setMsg({ type: 'error', text: getErrorMessage(err) }); }

const FALLBACK = 'Something went wrong. Please try again.';

function isObject(val) {
  return val !== null && typeof val === 'object';
}

function cleanString(str) {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (!trimmed || trimmed === '[object Object]' || trimmed === '{}' || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }
  return trimmed;
}

export function getErrorMessage(err) {
  if (!err) return FALLBACK;

  // 1. Plain string
  if (typeof err === 'string') {
    return cleanString(err) || FALLBACK;
  }

  // 2. Check Axios / HTTP response body first (even if err is an instance of Error)
  // Backend standard shapes:
  //   { error: { message: '...', code: '...', errors: [...] } }
  //   { message: '...' }
  //   { error: '...' }
  const resData = err.response?.data || err.body;
  if (resData) {
    if (typeof resData === 'string') {
      const clean = cleanString(resData);
      if (clean) return clean;
    } else if (isObject(resData)) {
      // resData.error.errors (e.g. express-validator array: [{ field, message }])
      const valErrors = resData.error?.errors || resData.errors;
      if (Array.isArray(valErrors) && valErrors.length > 0) {
        const first = valErrors[0];
        const detail = typeof first === 'string' ? first : (first.message || first.msg);
        const field = first.field || first.path;
        if (cleanString(detail)) {
          return field ? `${field}: ${detail}` : detail;
        }
      }

      // resData.error.message (standard backend envelope)
      if (cleanString(resData.error?.message)) {
        return cleanString(resData.error.message);
      }

      // resData.error as a direct string
      if (cleanString(resData.error)) {
        return cleanString(resData.error);
      }

      // resData.message
      if (cleanString(resData.message)) {
        return cleanString(resData.message);
      }

      // Other common error fields
      if (cleanString(resData.msg)) return cleanString(resData.msg);
      if (cleanString(resData.details)) return cleanString(resData.details);
      if (cleanString(resData.error_description)) return cleanString(resData.error_description);
    }
  }

  // 3. Supabase / PostgREST error properties
  if (cleanString(err.error_description)) return cleanString(err.error_description);
  if (cleanString(err.details)) return cleanString(err.details);
  if (cleanString(err.hint)) return cleanString(err.hint);
  if (cleanString(err.msg)) return cleanString(err.msg);

  // 4. err.message (from Error instance or plain object)
  if (cleanString(err.message)) {
    return cleanString(err.message);
  }

  // If err.message was an object (some third-party libraries attach nested objects to .message)
  if (isObject(err.message)) {
    if (cleanString(err.message.message)) return cleanString(err.message.message);
    try {
      const s = JSON.stringify(err.message);
      const clean = cleanString(s);
      if (clean) return clean;
    } catch (_) {}
  }

  // 5. HTTP status hint — Supabase returns 500 when email provider/SMTP is not configured
  if (err.status === 500 || err.statusCode === 500) {
    return 'Server returned error (500). Check Supabase / backend configuration.';
  }

  // 6. JSON stringify if it's an object with custom properties
  if (isObject(err)) {
    try {
      const s = JSON.stringify(err);
      const clean = cleanString(s);
      if (clean) return clean;
    } catch (_) {}
  }

  return FALLBACK;
}

export default getErrorMessage;
