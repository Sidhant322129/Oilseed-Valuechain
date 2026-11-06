-- ============================================================================
-- Migration 00003: Indexes, Updated At Triggers & Auth User Hook
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
-- Week 1: System Design and Database Setup
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------

-- Users & Farmers
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_farmers_user_id ON public.farmers(user_id);
CREATE INDEX IF NOT EXISTS idx_farmers_district_state ON public.farmers(district, state);
CREATE INDEX IF NOT EXISTS idx_farmers_kyc_status ON public.farmers(kyc_status);

-- Land & Crops
CREATE INDEX IF NOT EXISTS idx_land_records_farmer_id ON public.land_records(farmer_id);
CREATE INDEX IF NOT EXISTS idx_crops_farmer_id ON public.crops(farmer_id);
CREATE INDEX IF NOT EXISTS idx_crops_land_id ON public.crops(land_id);
CREATE INDEX IF NOT EXISTS idx_crops_crop_type ON public.crops(crop_type);
CREATE INDEX IF NOT EXISTS idx_crops_season ON public.crops(season);
CREATE INDEX IF NOT EXISTS idx_crops_status ON public.crops(status);

-- Batches & Warehouses
CREATE INDEX IF NOT EXISTS idx_batches_crop_id ON public.batches(crop_id);
CREATE INDEX IF NOT EXISTS idx_batches_farmer_id ON public.batches(farmer_id);
CREATE INDEX IF NOT EXISTS idx_batches_warehouse_id ON public.batches(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_quality_grade ON public.batches(quality_grade);
CREATE INDEX IF NOT EXISTS idx_warehouses_district_state ON public.warehouses(district, state);
CREATE INDEX IF NOT EXISTS idx_warehouses_manager_id ON public.warehouses(manager_id);

-- Orders & Logistics
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON public.orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_logistics_order_id ON public.logistics(order_id);
CREATE INDEX IF NOT EXISTS idx_logistics_transporter_id ON public.logistics(transporter_id);
CREATE INDEX IF NOT EXISTS idx_logistics_status ON public.logistics(status);

-- Market Price History & Weather Logs
CREATE INDEX IF NOT EXISTS idx_price_history_crop_date ON public.price_history(crop_type, price_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_mandi ON public.price_history(mandi_name, state);
CREATE INDEX IF NOT EXISTS idx_weather_logs_district ON public.weather_logs(district, state, recorded_at DESC);

-- Pest Reports, Loans, Insurance & Notifications
CREATE INDEX IF NOT EXISTS idx_pest_reports_farmer_id ON public.pest_reports(farmer_id);
CREATE INDEX IF NOT EXISTS idx_pest_reports_crop_id ON public.pest_reports(crop_id);
CREATE INDEX IF NOT EXISTS idx_pest_reports_status ON public.pest_reports(status);
CREATE INDEX IF NOT EXISTS idx_loan_applications_farmer_id ON public.loan_applications(farmer_id);
CREATE INDEX IF NOT EXISTS idx_loan_applications_status ON public.loan_applications(status);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_farmer_id ON public.insurance_claims(farmer_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON public.insurance_claims(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id, is_read, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. AUTOMATIC UPDATED_AT TRIGGER FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables that contain updated_at
DROP TRIGGER IF EXISTS tr_users_updated_at ON public.users;
CREATE TRIGGER tr_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_farmers_updated_at ON public.farmers;
CREATE TRIGGER tr_farmers_updated_at
    BEFORE UPDATE ON public.farmers
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_land_records_updated_at ON public.land_records;
CREATE TRIGGER tr_land_records_updated_at
    BEFORE UPDATE ON public.land_records
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_crops_updated_at ON public.crops;
CREATE TRIGGER tr_crops_updated_at
    BEFORE UPDATE ON public.crops
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_warehouses_updated_at ON public.warehouses;
CREATE TRIGGER tr_warehouses_updated_at
    BEFORE UPDATE ON public.warehouses
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_batches_updated_at ON public.batches;
CREATE TRIGGER tr_batches_updated_at
    BEFORE UPDATE ON public.batches
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_orders_updated_at ON public.orders;
CREATE TRIGGER tr_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_logistics_updated_at ON public.logistics;
CREATE TRIGGER tr_logistics_updated_at
    BEFORE UPDATE ON public.logistics
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_pest_reports_updated_at ON public.pest_reports;
CREATE TRIGGER tr_pest_reports_updated_at
    BEFORE UPDATE ON public.pest_reports
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_loan_applications_updated_at ON public.loan_applications;
CREATE TRIGGER tr_loan_applications_updated_at
    BEFORE UPDATE ON public.loan_applications
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_insurance_claims_updated_at ON public.insurance_claims;
CREATE TRIGGER tr_insurance_claims_updated_at
    BEFORE UPDATE ON public.insurance_claims
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 3. SUPABASE AUTH USER CREATION HOOK (Email OTP & Google OAuth)
-- ----------------------------------------------------------------------------
-- Automatically creates a public.users row whenever a user signs up via Auth
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    raw_user_meta JSONB := NEW.raw_user_meta_data;
    assigned_role user_role := 'farmer';
    user_full_name TEXT;
    user_avatar TEXT;
BEGIN
    -- Extract full name from Google metadata or custom metadata, fallback to email prefix
    user_full_name := COALESCE(
        raw_user_meta->>'full_name',
        raw_user_meta->>'name',
        split_part(NEW.email, '@', 1)
    );

    -- Extract avatar URL from Google OAuth if available
    user_avatar := COALESCE(
        raw_user_meta->>'avatar_url',
        raw_user_meta->>'picture',
        NULL
    );

    -- Extract role if specified during signup
    IF raw_user_meta->>'role' IS NOT NULL THEN
        BEGIN
            assigned_role := (raw_user_meta->>'role')::user_role;
        EXCEPTION WHEN OTHERS THEN
            assigned_role := 'farmer';
        END;
    END IF;

    -- Insert or update public user profile
    INSERT INTO public.users (
        id,
        email,
        full_name,
        phone_number,
        role,
        avatar_url,
        is_verified,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        user_full_name,
        NEW.phone,
        assigned_role,
        user_avatar,
        (NEW.email_confirmed_at IS NOT NULL),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
        avatar_url = COALESCE(public.users.avatar_url, EXCLUDED.avatar_url),
        is_verified = (NEW.email_confirmed_at IS NOT NULL),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute upon auth.users creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
