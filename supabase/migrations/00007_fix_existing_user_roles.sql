-- ============================================================================
-- Migration 00007: One-Time Fix for Existing Corrupted User Roles
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
--
-- CONTEXT:
--   The role-routing bug was active from the first signup. Every user who
--   signed up before migration 00006 was applied may have:
--     (a) Had their role reset to 'farmer' by the broken trigger on OTP confirm,
--     (b) Had their role overwritten to 'farmer' by upsertUserProfile on sign-in,
--     (c) Had their role silently defaulted to 'farmer' by DashboardRouter.
--
-- RECOVERY STRATEGY:
--   The most reliable source of the originally intended role is
--   auth.users.raw_user_meta_data->>'role', set by the frontend during signInWithOtp.
--   If that metadata field is non-null and maps to a canonical role, we restore it.
--   If it is null or unmappable, the row cannot be auto-fixed and is flagged.
--
-- This migration is READ-THEN-WRITE safe: it only updates rows whose
-- public.users.role is 'farmer' AND whose auth metadata suggests a different role.
-- Users who genuinely selected 'farmer' are not touched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART A: Auto-fix rows where role can be recovered from auth metadata
-- ----------------------------------------------------------------------------
UPDATE public.users u
SET
    role = mapped.canonical_role::public.user_role,
    updated_at = NOW()
FROM (
    SELECT
        au.id AS user_id,
        CASE (au.raw_user_meta_data->>'role')
            WHEN 'farmer'            THEN 'farmer'
            WHEN 'fpo'               THEN 'fpo'
            WHEN 'processor'         THEN 'processor'
            WHEN 'retailer'          THEN 'retailer'
            WHEN 'government'        THEN 'government'
            WHEN 'admin'             THEN 'admin'
            -- Legacy values → canonical mapping
            WHEN 'buyer'             THEN 'retailer'
            WHEN 'warehouse_manager' THEN 'fpo'
            WHEN 'logistics_partner' THEN 'fpo'
            WHEN 'financial_officer' THEN 'government'
            WHEN 'insurance_agent'   THEN 'government'
            ELSE NULL  -- NULL means cannot auto-fix
        END AS canonical_role
    FROM auth.users au
    JOIN public.users pu ON pu.id = au.id
    WHERE
        -- Only target rows currently stuck at 'farmer' that aren't actually farmers
        pu.role = 'farmer'
        -- Only where the metadata role is explicitly non-farmer (i.e., the user didn't pick farmer)
        AND au.raw_user_meta_data->>'role' IS NOT NULL
        AND au.raw_user_meta_data->>'role' <> 'farmer'
) AS mapped
WHERE
    u.id = mapped.user_id
    AND mapped.canonical_role IS NOT NULL;   -- Skip unmappable rows (handled in Part B)

-- ----------------------------------------------------------------------------
-- PART B: Identify rows that CANNOT be auto-fixed — require manual correction
--
--   These are users where:
--   - public.users.role = 'farmer' (suspected default, not actual selection)
--   - auth.users.raw_user_meta_data->>'role' is NULL or was also defaulted
--
--   A platform admin must contact these users and ask them to confirm their role.
--   Use the admin dashboard or a direct DB query to update their role once confirmed.
--
--   Query to find these accounts (run in Supabase SQL Editor):
-- ----------------------------------------------------------------------------

-- This view surfaces the affected accounts for visibility (non-destructive)
CREATE OR REPLACE VIEW public.role_recovery_needed AS
SELECT
    pu.id,
    pu.email,
    pu.full_name,
    pu.role     AS current_role,
    pu.created_at,
    au.raw_user_meta_data->>'role'  AS metadata_role,
    au.raw_user_meta_data->>'full_name' AS metadata_name,
    au.last_sign_in_at
FROM public.users pu
JOIN auth.users au ON au.id = pu.id
WHERE
    pu.role = 'farmer'
    AND (
        au.raw_user_meta_data->>'role' IS NULL
        OR au.raw_user_meta_data->>'role' = 'farmer'
        -- Exclude genuine farmers: they have a corresponding row in public.farmers
        -- (A real farmer would have completed farmer profile onboarding)
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.farmers f WHERE f.user_id = pu.id
    );

COMMENT ON VIEW public.role_recovery_needed IS
    'Accounts whose role defaulted to farmer due to the role-routing bug and '
    'cannot be auto-corrected because auth metadata is also null/farmer. '
    'Platform admin must manually verify the intended role with these users.';

GRANT SELECT ON public.role_recovery_needed TO service_role;

-- ----------------------------------------------------------------------------
-- PART C: Verification query — run after applying this migration
--
--   SELECT role, COUNT(*) FROM public.users GROUP BY role ORDER BY role;
--
--   Expected: Only the 6 canonical values should appear.
--   Any role NOT in (farmer, fpo, processor, retailer, government, admin) is a bug.
-- ----------------------------------------------------------------------------

-- Inline verification assertion (raises if unexpected roles remain)
DO $$
DECLARE
    bad_count INT;
BEGIN
    SELECT COUNT(*) INTO bad_count
    FROM public.users
    WHERE role::TEXT NOT IN ('farmer', 'fpo', 'processor', 'retailer', 'government', 'admin');

    IF bad_count > 0 THEN
        RAISE WARNING 'migration 00007: % user(s) still have non-canonical roles. Check public.role_recovery_needed.', bad_count;
    ELSE
        RAISE NOTICE 'migration 00007: All user roles are canonical. Migration successful.';
    END IF;
END $$;
