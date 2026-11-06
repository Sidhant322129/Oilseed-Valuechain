-- ============================================================================
-- FIX AUTH TRIGGER & RLS POLICIES FOR CONTROLLED GOOGLE OAUTH & EMAIL OTP
-- Description:
-- 1. Disables the unconditional auto-insert trigger on auth.users so that
--    unregistered users attempting "Sign In" are NOT automatically created in public.users.
-- 2. Provides a secure check_user_exists(check_email) RPC for both anon and authenticated users.
-- 3. Ensures authenticated users can INSERT and UPDATE their own public.users record during Sign Up.
-- 4. Provides a secure SECURITY DEFINER helper function for atomic profile creation.
-- ============================================================================

-- 1. Remove automatic insert trigger from auth.users (gives app full control of Sign Up vs Sign In)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();

-- 2. Ensure RLS is active on public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. Ensure proper SELECT, INSERT, and UPDATE policies
DROP POLICY IF EXISTS "Public can view basic profiles" ON public.users;
CREATE POLICY "Public can view basic profiles"
    ON public.users FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- 4. Check if user exists by email (Accessible to anon and authenticated)
CREATE OR REPLACE FUNCTION public.check_user_exists(check_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users WHERE lower(email) = lower(trim(check_email))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_user_exists(TEXT) TO anon, authenticated;

-- 5. Secure RPC function for creating/registering a user profile
CREATE OR REPLACE FUNCTION public.register_user_profile(
    user_id UUID,
    user_email TEXT,
    user_role public.user_role,
    user_full_name TEXT
)
RETURNS JSONB AS $$
DECLARE
    existing_user public.users%ROWTYPE;
    result_user public.users%ROWTYPE;
BEGIN
    SELECT * INTO existing_user FROM public.users WHERE id = user_id OR lower(email) = lower(trim(user_email));
    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'USER_ALREADY_EXISTS', 'user', row_to_json(existing_user));
    END IF;

    INSERT INTO public.users (
        id, email, full_name, role, is_verified, created_at, updated_at
    )
    VALUES (
        user_id, lower(trim(user_email)), COALESCE(user_full_name, split_part(user_email, '@', 1)),
        user_role, false, NOW(), NOW()
    )
    RETURNING * INTO result_user;

    RETURN jsonb_build_object('success', true, 'user', row_to_json(result_user));
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.register_user_profile(UUID, TEXT, public.user_role, TEXT) TO authenticated, service_role;


