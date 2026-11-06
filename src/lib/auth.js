import { supabase } from './supabaseClient';

/**
 * Send Email OTP — works for both sign-in and sign-up (Supabase creates user if new)
 */
function extractAuthError(error, isSignUp = false) {
  if (!error) return 'An unknown error occurred during authentication.';
  if (typeof error === 'string') return error;

  const msg = error.message || error.error_description || error.msg || '';

  // User trying to sign in with an unregistered email
  if (
    msg.toLowerCase().includes('signups not allowed') ||
    msg.toLowerCase().includes('user not found') ||
    msg.toLowerCase().includes('not registered') ||
    msg.toLowerCase().includes('no user') ||
    msg.toLowerCase().includes('invalid user')
  ) {
    return 'User not registered. No account was found associated with this email address. Please switch to the "Sign Up" tab to register.';
  }

  // Already registered when signing up
  if (isSignUp && (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('user already exists'))) {
    return 'An account with this email already exists. Please switch to the "Sign In" tab to log in.';
  }

  if (msg && typeof msg === 'string' && msg.trim() && msg !== '{}' && msg !== '[object Object]') {
    return msg;
  }

  if (error.status === 500) {
    return 'Supabase Auth server returned 500. Check your SMTP settings in Supabase Dashboard (Username, Password/App Password, Host smtp.gmail.com, and Port 587).';
  }
  return error.name ? `${error.name}: Connection or server error (${error.status || 500})` : 'Authentication request failed.';
}

/**
 * Check if a user exists in public.users by email
 */
export async function checkUserExists(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();

  // Try RPC first (SECURITY DEFINER, works for anon & authenticated)
  try {
    const { data, error } = await supabase.rpc('check_user_exists', { check_email: cleanEmail });
    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch {
    /* fallback to select */
  }

  // Fallback to direct select on users table
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .ilike('email', cleanEmail)
      .maybeSingle();
    if (!error && data) {
      return true;
    }
  } catch {
    /* ignore */
  }

  return false;
}

export async function sendEmailOtp({ email, role = 'farmer', fullName, isSignUp = false }) {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Pre-validate account existence
  const exists = await checkUserExists(cleanEmail);

  if (!isSignUp && !exists) {
    throw new Error('User not registered. No account was found associated with this email address. Please switch to the "Sign Up" tab to register.');
  }

  if (isSignUp && exists) {
    throw new Error('An account with this email already exists. Please switch to the "Sign In" tab to log in.');
  }

  // 2. Dispatch OTP only if validation passes
  const { data, error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      shouldCreateUser: isSignUp, // false for Sign In, true for Sign Up
      data: {
        role,
        full_name: fullName || cleanEmail.split('@')[0],
      },
    },
  });
  if (error) {
    console.error('[auth] sendEmailOtp error:', error);
    throw new Error(extractAuthError(error, isSignUp));
  }
  return data;
}

/**
 * Verify 6-digit OTP entered by user
 */
export async function verifyEmailOtp({ email, token }) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) {
    console.error('[auth] verifyEmailOtp error:', error);
    throw new Error(extractAuthError(error));
  }
  return data;
}

/**
 * After OTP verification — create or fetch the user profile in public.users.
 *
 * @param {object} params
 * @param {string}  params.id        - Supabase auth user UUID
 * @param {string}  params.email     - User's email address
 * @param {string}  params.role      - Role selected at signup (ignored on sign-in)
 * @param {string}  params.fullName  - Display name (ignored on sign-in)
 * @param {boolean} params.isSignUp  - TRUE on sign-up, FALSE on sign-in
 *
 * CRITICAL: On sign-in (isSignUp=false), this function NEVER writes the role.
 * The role is always read back from the existing public.users row.
 * Passing the form's current dropdown value on sign-in was the root cause of
 * the role-clobber bug — every sign-in reset the role to the dropdown default.
 */
export async function upsertUserProfile({ id, email, role, fullName, isSignUp = false }) {
  // ---------- SIGN-IN PATH: read the existing profile, never write the role ----------
  if (!isSignUp) {
    try {
      const { data: existing } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (existing) return existing;
    } catch (e) {
      console.warn('[auth] Could not fetch existing profile on sign-in:', e.message);
    }
    // Profile not found during sign-in — unusual but possible if the row was
    // never created (e.g. manual DB delete). Fall through to create it.
    // Log a warning so this is never invisible.
    console.warn('[auth] No public.users row found for id', id, '— creating one on sign-in.');
  }

  // ---------- SIGN-UP PATH (or fallback row-creation for sign-in): write the role ----------
  // Try the secure SECURITY DEFINER RPC first.
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('register_user_profile', {
      user_id: id,
      user_email: email,
      user_role: role || 'farmer',
      user_full_name: fullName || email.split('@')[0],
    });
    if (!rpcErr && rpcRes) {
      if (rpcRes.success) {
        // Return the canonical user object from DB (either newly created or existing)
        return rpcRes.user;
      }
    }
  } catch {
    /* RPC unavailable — fall through to direct table insert */
  }

  // Fallback direct table insert (INSERT only; ignoreDuplicates=true to never
  // overwrite an existing row — role must never be clobbered here either).
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        id,
        email,
        role: role || 'farmer',
        full_name: fullName || email.split('@')[0],
        is_verified: false,
        preferred_language: 'en',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: true }   // ignoreDuplicates=true: never overwrite
    )
    .select()
    .maybeSingle();

  if (error) {
    console.warn('[auth] Profile upsert warning:', error.message);
  }
  return data;
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle({ role = 'farmer', fullName = '', mode = 'signin' } = {}) {
  try {
    localStorage.setItem('nm_oauth_intent', JSON.stringify({ role, fullName, mode, timestamp: Date.now() }));
  } catch {
    /* ignore storage errors */
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw new Error(`Google sign-in failed: ${error.message}`);
  return data;
}

/**
 * Sign out current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Sign out failed: ${error.message}`);
}

/**
 * Get current session + profile from public.users table
 */
export async function getCurrentUserProfile() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return profile || null;
}
