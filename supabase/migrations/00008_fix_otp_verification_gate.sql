-- ============================================================================
-- Migration 00008: Fix OTP Verification Gate — Close Auth Bypass
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
--
-- BUG BEING FIXED:
--   A user could bypass OTP verification by refreshing the page after the OTP
--   was sent but before it was verified. Three root causes:
--
--   1. TRIGGER FIRES TOO EARLY:
--      The on_auth_user_created trigger (migration 00006) watches
--      AFTER INSERT ON auth.users only. Supabase creates the auth.users row
--      the instant signInWithOtp() is called — not when the OTP is verified.
--      This means public.users gets a row (is_verified=false) immediately on
--      OTP send. The trigger then NEVER fires again when email_confirmed_at
--      is set (OTP verified), so is_verified stays false forever for email-OTP
--      users even after they successfully verify.
--
--   2. TRIGGER USES ON CONFLICT DO NOTHING:
--      Even if the trigger fired on UPDATE, it would skip the upsert entirely
--      because the row already exists from the INSERT fire — the is_verified
--      column would never get updated.
--
--   3. check_user_exists() COUNTS UNVERIFIED ROWS:
--      After a user requests OTP but never verifies, the public.users stub
--      row makes check_user_exists() return true. On their next visit,
--      sendEmailOtp(isSignUp=true) throws "already exists" — blocking
--      re-registration even though they never actually verified.
--
-- FIX STRATEGY:
--   A. Re-add UPDATE OF email_confirmed_at to the trigger so it fires when
--      Supabase sets email_confirmed_at on successful OTP verification.
--   B. Change ON CONFLICT DO NOTHING → DO UPDATE SET is_verified, updated_at
--      so the flag flips to true when the trigger fires on email confirmation.
--      Role, full_name, and email are intentionally NOT updated here — we
--      never clobber data that was explicitly set by the user.
--   C. Update check_user_exists() to only count rows with is_verified = true,
--      so unverified stubs don't block re-registration attempts.
--   D. Provide a non-destructive audit query for existing unverified accounts.
--
-- GOOGLE OAUTH: Unaffected. Google users have email_confirmed_at set
--   immediately by Supabase on OAuth callback — they are always verified.
--
-- DOES NOT CHANGE: OTP send flow, Google OAuth flow, error messages,
--   signup/login separation, rate limiting, any UI, any other migration.
-- ============================================================================

-- ============================================================================
-- STEP A — Replace handle_new_auth_user with a version that correctly
--           updates is_verified on email confirmation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    raw_meta  JSONB            := NEW.raw_user_meta_data;
    role_text TEXT             := raw_meta->>'role';
    safe_role public.user_role := 'farmer';
    full_name TEXT;
    avatar    TEXT;
BEGIN
    full_name := COALESCE(
        raw_meta->>'full_name',
        raw_meta->>'name',
        split_part(NEW.email, '@', 1)
    );
    avatar := COALESCE(
        raw_meta->>'avatar_url',
        raw_meta->>'picture',
        NULL
    );

    IF role_text IS NOT NULL AND role_text <> '' THEN
        BEGIN
            safe_role := role_text::public.user_role;
        EXCEPTION WHEN OTHERS THEN
            safe_role := 'farmer';
            RAISE LOG
                'handle_new_auth_user: unrecognised role "%" for user %, defaulting to farmer',
                role_text, NEW.id;
        END;
    END IF;

    INSERT INTO public.users (
        id,
        email,
        full_name,
        avatar_url,
        role,
        is_verified,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        full_name,
        avatar,
        safe_role,
        (NEW.email_confirmed_at IS NOT NULL),  -- false on OTP send, true on OTP verify
        NOW(),
        NOW()
    )
    -- ─────────────────────────────────────────────────────────────────────────
    -- KEY FIX (was: ON CONFLICT (id) DO NOTHING)
    --
    -- We MUST update is_verified when this trigger fires on the UPDATE
    -- caused by OTP verification (email_confirmed_at being set).
    -- We intentionally do NOT update: role, full_name, email, avatar_url —
    -- those were set by the user explicitly and must never be overwritten here.
    -- ─────────────────────────────────────────────────────────────────────────
    ON CONFLICT (id) DO UPDATE SET
        is_verified = (NEW.email_confirmed_at IS NOT NULL),
        updated_at  = NOW()
    WHERE
        -- Only update if the verification status actually changed.
        -- Avoids unnecessary writes on unrelated auth.users UPDATE events.
        public.users.is_verified IS DISTINCT FROM (NEW.email_confirmed_at IS NOT NULL);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP B — Recreate the trigger to also fire on email_confirmed_at changes
--
-- Migration 00006 had: AFTER INSERT ON auth.users
-- This fires when the OTP is SENT — correct, creates the stub row.
-- But it never fires when email_confirmed_at is SET (OTP verification).
-- Adding UPDATE OF email_confirmed_at makes it fire on both events.
-- ============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- NOTE: COMMENT ON TRIGGER on_auth_user_created ON auth.users is intentionally
-- omitted — Supabase does not grant ownership of auth.users to the migration
-- role, so this DDL would fail with "must be owner of relation users".
-- The trigger itself (CREATE TRIGGER above) is unaffected.


-- ============================================================================
-- STEP C — Fix check_user_exists() to exclude unverified stub accounts
--
-- Before this fix: any user who requested an OTP but never verified it would
-- have a public.users row with is_verified=false. check_user_exists() would
-- return true for their email, blocking re-registration with a misleading
-- "already exists" error — even though they never successfully signed up.
--
-- After this fix: only verified accounts count as "existing". Unverified
-- stubs are invisible to the signup duplicate-check, allowing the user to
-- cleanly restart the signup flow.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_user_exists(check_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.users
        WHERE lower(email) = lower(trim(check_email))
          AND is_verified = true   -- KEY FIX: unverified stubs don't block re-registration
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_user_exists(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.check_user_exists(TEXT) IS
    'Returns true only if a VERIFIED account exists for the given email. '
    'Unverified stub rows (OTP requested but never verified) return false, '
    'allowing the user to cleanly restart the signup flow. Fixed in 00008.';

-- ============================================================================
-- STEP D — Backfill: update is_verified for any existing accounts that
--           actually completed email verification but still have
--           is_verified = false (because the trigger previously used
--           DO NOTHING and never got a chance to set the flag).
--
-- This is a one-time idempotent backfill. It ONLY sets is_verified = true
-- for rows where:
--   - auth.users.email_confirmed_at IS NOT NULL  (Supabase confirmed the email)
--   - public.users.is_verified = false           (flag was not updated due to bug)
-- ============================================================================
UPDATE public.users pu
SET
    is_verified = true,
    updated_at  = NOW()
FROM auth.users au
WHERE
    au.id = pu.id
    AND au.email_confirmed_at IS NOT NULL   -- Supabase confirmed the email
    AND pu.is_verified = false;             -- but the flag was never updated

-- Log how many rows were fixed
DO $$
DECLARE
    fixed_count INT;
BEGIN
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    IF fixed_count > 0 THEN
        RAISE NOTICE
            'migration 00008 backfill: set is_verified=true for % account(s) that had '
            'email_confirmed_at set but is_verified=false due to the DO NOTHING trigger bug.',
            fixed_count;
    ELSE
        RAISE NOTICE
            'migration 00008 backfill: no accounts needed is_verified correction.';
    END IF;
END $$;

-- ============================================================================
-- STEP E — Audit query: list existing unverified accounts
--
-- DO NOT DELETE AUTOMATICALLY. Run this in Supabase SQL Editor to review
-- accounts that are unconfirmed in auth.users and have never successfully
-- verified their OTP. The platform admin must decide manually whether to:
--   (a) Delete the auth.users + public.users rows (if the user never returned)
--   (b) Contact the user and ask them to re-verify
--   (c) Leave them — they are harmless after this migration (is_verified=false
--       blocks all backend access, and the frontend now force-signs them out)
-- ============================================================================

-- Non-destructive view: accounts that are still unverified in auth.users
CREATE OR REPLACE VIEW public.unverified_accounts AS
SELECT
    pu.id,
    pu.email,
    pu.full_name,
    pu.role,
    pu.is_verified          AS public_is_verified,
    au.email_confirmed_at,
    au.created_at           AS auth_created_at,
    au.last_sign_in_at,
    au.raw_user_meta_data->>'role' AS intended_role
FROM public.users pu
JOIN auth.users au ON au.id = pu.id
WHERE
    au.email_confirmed_at IS NULL
ORDER BY au.created_at DESC;

COMMENT ON VIEW public.unverified_accounts IS
    'Non-destructive audit view. Lists accounts that have a public.users row '
    'but have never completed OTP verification (email_confirmed_at IS NULL). '
    'These were created by the OTP bypass bug. Do NOT auto-delete — review '
    'manually and decide whether to delete or ask users to re-verify. '
    'After migration 00008, these accounts cannot log in (backend rejects '
    'is_verified=false with 401, frontend force-signs them out on refresh).';

GRANT SELECT ON public.unverified_accounts TO service_role;

-- Final verification
DO $$
DECLARE
    unverified_count INT;
BEGIN
    SELECT COUNT(*) INTO unverified_count
    FROM public.users
    WHERE is_verified = false;

    RAISE NOTICE
        'migration 00008 complete. % account(s) remain with is_verified=false '
        '(OTP never completed). These are now fully blocked from access. '
        'Run: SELECT * FROM public.unverified_accounts; to review them.',
        unverified_count;
END $$;
