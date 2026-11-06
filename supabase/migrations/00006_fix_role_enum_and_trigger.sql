-- ============================================================================
-- Migration 00006 (v2 — fixes DROP COLUMN dependency error)
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
--
-- ERROR THAT PROMPTED THIS FIX:
--   ERROR: 2BP01: cannot drop column role of table users because other
--   objects depend on it
--   DETAIL: policy "Users and officers can view documents" on storage.objects
--           policy "Admin and service role read ML models" on storage.objects
--
-- COMPLETE FIX ORDER:
--   1. Drop all dependent storage policies and the get_current_user_role()
--      function (its return type references the old user_role enum).
--   2. Do the enum swap (user_role → canonical 6-value set).
--      Use CASCADE on DROP COLUMN to handle any remaining silent deps.
--   3. Recreate auth trigger (INSERT-only, DO NOTHING on conflict).
--   4. Recreate register_user_profile() RPC.
--   5. Recreate get_current_user_role() with the new return type.
--   6. Recreate all storage policies with canonical role values.
--   7. Recreate every table RLS policy that referenced old role enum values
--      (financial_officer → government, warehouse_manager → fpo, etc.).
--
-- CANONICAL ROLE SET:  farmer | fpo | processor | retailer | government | admin
-- LEGACY → CANONICAL:  buyer→retailer, warehouse_manager→fpo,
--                      logistics_partner→fpo, financial_officer→government,
--                      insurance_agent→government
-- ============================================================================

-- ============================================================================
-- STEP 1 — Remove the broken trigger
-- ============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user() CASCADE;

-- ============================================================================
-- STEP 2 — Drop everything that holds a reference to users.role or the
--           old user_role enum type BEFORE we touch the column.
--
--   a) get_current_user_role() — return type = old user_role enum
--      CASCADE automatically drops every RLS policy that CALLS this function,
--      so we don't need to enumerate them individually.
--   b) The two storage policies that do a direct subquery on users.role
--      (they don't use get_current_user_role(), so CASCADE above misses them).
-- ============================================================================

-- 2a. Drop the helper function — CASCADE drops every RLS policy that uses it
DROP FUNCTION IF EXISTS public.get_current_user_role() CASCADE;

-- 2b. Drop storage policies that directly subquery users.role
DROP POLICY IF EXISTS "Users and officers can view documents"    ON storage.objects;
DROP POLICY IF EXISTS "Admin and service role read ML models"    ON storage.objects;
DROP POLICY IF EXISTS "Admin upload ML models"                   ON storage.objects;

-- ============================================================================
-- STEP 3 — Swap the user_role enum
-- ============================================================================

-- 3a. New canonical enum (idempotent)
DO $$ BEGIN
    CREATE TYPE public.user_role_v2 AS ENUM (
        'farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3b. Staging column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role_text TEXT;

-- 3c. Map old → canonical values
UPDATE public.users SET role_text = CASE role::TEXT
    WHEN 'farmer'            THEN 'farmer'
    WHEN 'fpo'               THEN 'fpo'
    WHEN 'processor'         THEN 'processor'
    WHEN 'retailer'          THEN 'retailer'
    WHEN 'government'        THEN 'government'
    WHEN 'admin'             THEN 'admin'
    WHEN 'buyer'             THEN 'retailer'
    WHEN 'warehouse_manager' THEN 'fpo'
    WHEN 'logistics_partner' THEN 'fpo'
    WHEN 'financial_officer' THEN 'government'
    WHEN 'insurance_agent'   THEN 'government'
    ELSE                          'farmer'
END;

-- 3d. Drop old column — CASCADE to handle any remaining silent dependencies
ALTER TABLE public.users DROP COLUMN role CASCADE;

-- 3e. Add new column using the new enum
ALTER TABLE public.users
    ADD COLUMN role public.user_role_v2 NOT NULL DEFAULT 'farmer';

-- 3f. Populate from staging column
UPDATE public.users SET role = role_text::public.user_role_v2;

-- 3g. Drop staging column
ALTER TABLE public.users DROP COLUMN role_text;

-- 3h. Drop the old enum type (column is gone, it's safe now)
DROP TYPE IF EXISTS public.user_role CASCADE;

-- 3i. Rename new enum to the canonical name
ALTER TYPE public.user_role_v2 RENAME TO user_role;

-- Restore index
DROP INDEX IF EXISTS idx_users_role;
CREATE INDEX idx_users_role ON public.users(role);

-- ============================================================================
-- STEP 4 — Recreate register_user_profile() RPC (TEXT role param)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_user_profile(
    user_id        UUID,
    user_email     TEXT,
    user_role      TEXT,
    user_full_name TEXT
)
RETURNS JSONB AS $$
DECLARE
    existing_user  public.users%ROWTYPE;
    result_user    public.users%ROWTYPE;
    safe_role      public.user_role;
BEGIN
    BEGIN
        safe_role := user_role::public.user_role;
    EXCEPTION WHEN OTHERS THEN
        safe_role := 'farmer';
    END;

    SELECT * INTO existing_user
    FROM public.users
    WHERE id = user_id OR lower(email) = lower(trim(user_email));

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_exists', true,
            'user', row_to_json(existing_user)
        );
    END IF;

    INSERT INTO public.users (id, email, full_name, role, is_verified, created_at, updated_at)
    VALUES (
        user_id,
        lower(trim(user_email)),
        COALESCE(user_full_name, split_part(user_email, '@', 1)),
        safe_role, false, NOW(), NOW()
    )
    RETURNING * INTO result_user;

    RETURN jsonb_build_object('success', true, 'already_exists', false, 'user', row_to_json(result_user));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.register_user_profile(UUID, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

-- ============================================================================
-- STEP 5 — Recreate the auth trigger (INSERT-only, DO NOTHING on conflict)
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
    full_name := COALESCE(raw_meta->>'full_name', raw_meta->>'name', split_part(NEW.email, '@', 1));
    avatar    := COALESCE(raw_meta->>'avatar_url', raw_meta->>'picture', NULL);

    IF role_text IS NOT NULL AND role_text <> '' THEN
        BEGIN
            safe_role := role_text::public.user_role;
        EXCEPTION WHEN OTHERS THEN
            safe_role := 'farmer';
            RAISE LOG 'handle_new_auth_user: unrecognised role "%" for user %, defaulting to farmer', role_text, NEW.id;
        END;
    END IF;

    INSERT INTO public.users (id, email, full_name, avatar_url, role, is_verified, created_at, updated_at)
    VALUES (NEW.id, NEW.email, full_name, avatar, safe_role, (NEW.email_confirmed_at IS NOT NULL), NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- STEP 6 — Recreate helper functions with corrected return type
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role AS $$
    SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_farmer_id()
RETURNS UUID AS $$
    SELECT id FROM public.farmers WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_user_exists(check_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.users WHERE lower(email) = lower(trim(check_email)));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_user_exists(TEXT) TO anon, authenticated;

-- ============================================================================
-- STEP 7 — Recreate storage policies (canonical role values)
--
--   Old:  financial_officer, insurance_agent  → New: government
--   Old:  warehouse_manager                   → New: fpo
-- ============================================================================

-- documents bucket: government + admin can view all documents
DROP POLICY IF EXISTS "Users and officers can view documents" ON storage.objects;
CREATE POLICY "Users and officers can view documents"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'documents' AND (
        auth.uid() = owner OR
        auth.uid()::text = (storage.foldername(name))[1] OR
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
              AND users.role IN ('government', 'admin')
        )
    )
);

-- ml-models bucket: admin read
DROP POLICY IF EXISTS "Admin and service role read ML models" ON storage.objects;
CREATE POLICY "Admin and service role read ML models"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'ml-models' AND
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
);

-- ml-models bucket: admin upload
DROP POLICY IF EXISTS "Admin upload ML models" ON storage.objects;
CREATE POLICY "Admin upload ML models"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'ml-models' AND
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
);

-- ============================================================================
-- STEP 8 — Recreate all RLS policies that referenced old role enum values.
--
--   These were dropped by CASCADE in Step 2a (because they called
--   get_current_user_role() whose return type was the old enum).
--   We recreate them here with canonical role values.
-- ============================================================================

-- ── public.users ─────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view basic profiles" ON public.users;
CREATE POLICY "Public can view basic profiles"
    ON public.users FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
    ON public.users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE TO authenticated
    USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── public.farmers ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone authenticated can view farmers" ON public.farmers;
CREATE POLICY "Anyone authenticated can view farmers"
    ON public.farmers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Farmers can insert their profile" ON public.farmers;
CREATE POLICY "Farmers can insert their profile"
    ON public.farmers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Farmers can update own profile" ON public.farmers;
CREATE POLICY "Farmers can update own profile"
    ON public.farmers FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ── public.land_records ──────────────────────────────────────────────────────
-- financial_officer + insurance_agent → government
DROP POLICY IF EXISTS "Farmers and officers view land records" ON public.land_records;
CREATE POLICY "Farmers and officers view land records"
    ON public.land_records FOR SELECT TO authenticated
    USING (
        farmer_id = public.get_current_farmer_id() OR
        public.get_current_user_role() IN ('admin', 'government')
    );

DROP POLICY IF EXISTS "Farmers manage their land records" ON public.land_records;
CREATE POLICY "Farmers manage their land records"
    ON public.land_records FOR ALL TO authenticated
    USING (farmer_id = public.get_current_farmer_id())
    WITH CHECK (farmer_id = public.get_current_farmer_id());

-- ── public.crops ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "View crops" ON public.crops;
CREATE POLICY "View crops"
    ON public.crops FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Farmers manage their crops" ON public.crops;
CREATE POLICY "Farmers manage their crops"
    ON public.crops FOR ALL TO authenticated
    USING (farmer_id = public.get_current_farmer_id())
    WITH CHECK (farmer_id = public.get_current_farmer_id());

-- ── public.batches ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "View batches" ON public.batches;
CREATE POLICY "View batches"
    ON public.batches FOR SELECT TO authenticated USING (true);

-- warehouse_manager → fpo
DROP POLICY IF EXISTS "Farmers manage their batches" ON public.batches;
CREATE POLICY "Farmers manage their batches"
    ON public.batches FOR ALL TO authenticated
    USING (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() IN ('fpo', 'admin'))
    WITH CHECK (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() IN ('fpo', 'admin'));

-- ── public.orders ────────────────────────────────────────────────────────────
-- logistics_partner → fpo
DROP POLICY IF EXISTS "Buyers and sellers view orders" ON public.orders;
CREATE POLICY "Buyers and sellers view orders"
    ON public.orders FOR SELECT TO authenticated
    USING (
        buyer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.batches b
            WHERE b.id = orders.batch_id AND b.farmer_id = public.get_current_farmer_id()
        ) OR
        public.get_current_user_role() IN ('admin', 'fpo')
    );

DROP POLICY IF EXISTS "Buyers can create orders" ON public.orders;
CREATE POLICY "Buyers can create orders"
    ON public.orders FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "Buyers and sellers update orders" ON public.orders;
CREATE POLICY "Buyers and sellers update orders"
    ON public.orders FOR UPDATE TO authenticated
    USING (
        buyer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.batches b
            WHERE b.id = orders.batch_id AND b.farmer_id = public.get_current_farmer_id()
        ) OR
        public.get_current_user_role() = 'admin'
    );

-- ── public.warehouses ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view warehouses" ON public.warehouses;
CREATE POLICY "Anyone can view warehouses"
    ON public.warehouses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers and admins update warehouses" ON public.warehouses;
CREATE POLICY "Managers and admins update warehouses"
    ON public.warehouses FOR ALL TO authenticated
    USING (manager_id = auth.uid() OR public.get_current_user_role() = 'admin')
    WITH CHECK (manager_id = auth.uid() OR public.get_current_user_role() = 'admin');

-- ── public.logistics ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Logistics tracking viewable by parties" ON public.logistics;
CREATE POLICY "Logistics tracking viewable by parties"
    ON public.logistics FOR SELECT TO authenticated
    USING (
        transporter_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = logistics.order_id AND (
                o.buyer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.batches b
                    WHERE b.id = o.batch_id AND b.farmer_id = public.get_current_farmer_id()
                )
            )
        ) OR
        public.get_current_user_role() = 'admin'
    );

DROP POLICY IF EXISTS "Transporters update logistics" ON public.logistics;
CREATE POLICY "Transporters update logistics"
    ON public.logistics FOR ALL TO authenticated
    USING (transporter_id = auth.uid() OR public.get_current_user_role() = 'admin')
    WITH CHECK (transporter_id = auth.uid() OR public.get_current_user_role() = 'admin');

-- ── public.price_history ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read price history" ON public.price_history;
CREATE POLICY "Public read price history"
    ON public.price_history FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Admin manage price history" ON public.price_history;
CREATE POLICY "Admin manage price history"
    ON public.price_history FOR ALL TO authenticated
    USING (public.get_current_user_role() = 'admin')
    WITH CHECK (public.get_current_user_role() = 'admin');

-- ── public.weather_logs ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read weather logs" ON public.weather_logs;
CREATE POLICY "Public read weather logs"
    ON public.weather_logs FOR SELECT TO authenticated, anon USING (true);

-- ── public.pest_reports ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Farmers view their pest reports" ON public.pest_reports;
CREATE POLICY "Farmers view their pest reports"
    ON public.pest_reports FOR SELECT TO authenticated
    USING (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Farmers create pest reports" ON public.pest_reports;
CREATE POLICY "Farmers create pest reports"
    ON public.pest_reports FOR INSERT TO authenticated
    WITH CHECK (farmer_id = public.get_current_farmer_id());

-- ── public.loan_applications ─────────────────────────────────────────────────
-- financial_officer → government
DROP POLICY IF EXISTS "Farmers and officers view loan applications" ON public.loan_applications;
CREATE POLICY "Farmers and officers view loan applications"
    ON public.loan_applications FOR SELECT TO authenticated
    USING (
        farmer_id = public.get_current_farmer_id() OR
        lender_id = auth.uid() OR
        public.get_current_user_role() IN ('government', 'admin')
    );

DROP POLICY IF EXISTS "Farmers insert loan applications" ON public.loan_applications;
CREATE POLICY "Farmers insert loan applications"
    ON public.loan_applications FOR INSERT TO authenticated
    WITH CHECK (farmer_id = public.get_current_farmer_id());

DROP POLICY IF EXISTS "Officers update loan applications" ON public.loan_applications;
CREATE POLICY "Officers update loan applications"
    ON public.loan_applications FOR UPDATE TO authenticated
    USING (
        farmer_id = public.get_current_farmer_id() OR
        lender_id = auth.uid() OR
        public.get_current_user_role() IN ('government', 'admin')
    );

-- ── public.insurance_claims ──────────────────────────────────────────────────
-- insurance_agent → government
DROP POLICY IF EXISTS "Farmers and agents view insurance claims" ON public.insurance_claims;
CREATE POLICY "Farmers and agents view insurance claims"
    ON public.insurance_claims FOR SELECT TO authenticated
    USING (
        farmer_id = public.get_current_farmer_id() OR
        surveyor_id = auth.uid() OR
        public.get_current_user_role() IN ('government', 'admin')
    );

DROP POLICY IF EXISTS "Farmers file insurance claims" ON public.insurance_claims;
CREATE POLICY "Farmers file insurance claims"
    ON public.insurance_claims FOR INSERT TO authenticated
    WITH CHECK (farmer_id = public.get_current_farmer_id());

DROP POLICY IF EXISTS "Agents update claims" ON public.insurance_claims;
CREATE POLICY "Agents update claims"
    ON public.insurance_claims FOR UPDATE TO authenticated
    USING (
        surveyor_id = auth.uid() OR
        public.get_current_user_role() IN ('government', 'admin')
    );

-- ── public.notifications ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
    ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
    ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
