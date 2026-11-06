-- ============================================================================
-- MASTER SCHEMA SCRIPT: Week 1 Complete Setup
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
-- Instructions: Run this entire script in your Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: EXTENSIONS & ENUMS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE kyc_status_enum AS ENUM ('pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE soil_type_enum AS ENUM (
        'black_soil', 'alluvial_soil', 'red_soil', 'sandy_loam', 'clay_loam', 'laterite_soil'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE irrigation_type_enum AS ENUM (
        'drip_irrigation', 'sprinkler', 'canal_water', 'borewell', 'rainfed', 'flood_furrow'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE oilseed_crop_enum AS ENUM (
        'mustard', 'groundnut', 'soybean', 'sunflower', 'sesame', 'safflower', 'castor', 'niger'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE crop_season_enum AS ENUM ('kharif', 'rabi', 'zaid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE crop_status_enum AS ENUM (
        'sown', 'vegetative', 'flowering', 'pod_formation', 'mature', 'harvested', 'failed'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE quality_grade_enum AS ENUM (
        'pending_testing', 'grade_a_premium', 'grade_b_standard', 'grade_c_fair', 'rejected'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE batch_status_enum AS ENUM (
        'harvested', 'quality_tested', 'in_warehouse', 'listed_for_sale', 'sold', 'dispatched'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('pending', 'escrow_funded', 'paid', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE order_status_enum AS ENUM (
        'placed', 'confirmed', 'processing', 'in_transit', 'delivered', 'completed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE logistics_status_enum AS ENUM (
        'assigned', 'pickup_scheduled', 'in_transit', 'delayed', 'out_for_delivery', 'delivered', 'failed'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE severity_level_enum AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE pest_report_status_enum AS ENUM ('open', 'verified', 'treatment_in_progress', 'resolved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE loan_purpose_enum AS ENUM (
        'seeds_and_fertilizers', 'farm_machinery_equipment', 'irrigation_infrastructure',
        'warehouse_receipt_advance', 'land_development', 'working_capital'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE loan_status_enum AS ENUM (
        'draft', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'repaid', 'defaulted'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE loss_cause_enum AS ENUM (
        'drought', 'excess_rainfall_flood', 'unseasonal_rain', 'pest_infestation',
        'hailstorm', 'fire_lightning', 'cyclone_storm'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE claim_status_enum AS ENUM (
        'submitted', 'under_investigation', 'field_assessed', 'approved', 'rejected', 'settled'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE notification_category_enum AS ENUM (
        'order', 'weather_alert', 'pest_alert', 'mandi_price', 'loan', 'insurance', 'system'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE notification_priority_enum AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ----------------------------------------------------------------------------
-- SECTION 2: ALL 14 TABLES
-- ----------------------------------------------------------------------------

-- 1. USERS
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    role user_role NOT NULL DEFAULT 'farmer',
    avatar_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    preferred_language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. FARMERS
CREATE TABLE IF NOT EXISTS public.farmers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    aadhaar_hash TEXT UNIQUE,
    kyc_status kyc_status_enum NOT NULL DEFAULT 'pending',
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    taluka_tehsil TEXT,
    village TEXT NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    bank_name TEXT,
    bank_account_number TEXT,
    bank_ifsc_code TEXT,
    upi_id TEXT,
    fpo_membership_name TEXT,
    total_land_area_acres NUMERIC(10,2) DEFAULT 0.00 CHECK (total_land_area_acres >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. LAND_RECORDS
CREATE TABLE IF NOT EXISTS public.land_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    survey_number TEXT NOT NULL,
    khasra_dag_number TEXT,
    area_acres NUMERIC(10,2) NOT NULL CHECK (area_acres > 0),
    soil_type soil_type_enum NOT NULL DEFAULT 'black_soil',
    soil_ph NUMERIC(4,2),
    irrigation_type irrigation_type_enum NOT NULL DEFAULT 'rainfed',
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    geo_boundary JSONB,
    title_deed_doc_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CROPS
CREATE TABLE IF NOT EXISTS public.crops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    land_id UUID REFERENCES public.land_records(id) ON DELETE SET NULL,
    crop_type oilseed_crop_enum NOT NULL,
    variety TEXT NOT NULL,
    season crop_season_enum NOT NULL,
    sowing_date DATE NOT NULL,
    expected_harvest_date DATE NOT NULL,
    actual_harvest_date DATE,
    acreage_allocated NUMERIC(10,2) NOT NULL CHECK (acreage_allocated > 0),
    estimated_yield_quintals NUMERIC(10,2) CHECK (estimated_yield_quintals >= 0),
    actual_yield_quintals NUMERIC(10,2) CHECK (actual_yield_quintals >= 0),
    status crop_status_enum NOT NULL DEFAULT 'sown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. WAREHOUSES
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    license_number TEXT,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    address TEXT NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    total_capacity_tonnes NUMERIC(10,2) NOT NULL CHECK (total_capacity_tonnes > 0),
    available_capacity_tonnes NUMERIC(10,2) NOT NULL CHECK (available_capacity_tonnes >= 0),
    has_cold_storage BOOLEAN DEFAULT FALSE,
    has_moisture_control BOOLEAN DEFAULT TRUE,
    storage_rate_per_tonne_month NUMERIC(10,2) DEFAULT 0.00,
    contact_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. BATCHES
CREATE TABLE IF NOT EXISTS public.batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_id UUID NOT NULL REFERENCES public.crops(id) ON DELETE CASCADE,
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    batch_code TEXT UNIQUE NOT NULL,
    quantity_kg NUMERIC(12,2) NOT NULL CHECK (quantity_kg > 0),
    quality_grade quality_grade_enum NOT NULL DEFAULT 'pending_testing',
    moisture_pct NUMERIC(5,2) CHECK (moisture_pct >= 0 AND moisture_pct <= 100),
    oil_content_pct NUMERIC(5,2) CHECK (oil_content_pct >= 0 AND oil_content_pct <= 100),
    foreign_matter_pct NUMERIC(5,2) CHECK (foreign_matter_pct >= 0 AND foreign_matter_pct <= 100),
    harvest_date DATE NOT NULL,
    status batch_status_enum NOT NULL DEFAULT 'harvested',
    base_ask_price_per_kg NUMERIC(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
    quantity_kg NUMERIC(12,2) NOT NULL CHECK (quantity_kg > 0),
    unit_price_per_kg NUMERIC(10,2) NOT NULL CHECK (unit_price_per_kg > 0),
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
    payment_status payment_status_enum NOT NULL DEFAULT 'pending',
    order_status order_status_enum NOT NULL DEFAULT 'placed',
    delivery_address TEXT NOT NULL,
    delivery_pincode VARCHAR(10) NOT NULL,
    payment_reference TEXT,
    escrow_release_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. LOGISTICS
CREATE TABLE IF NOT EXISTS public.logistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    transporter_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    tracking_number TEXT UNIQUE NOT NULL,
    carrier_company_name TEXT NOT NULL,
    vehicle_number TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    driver_phone TEXT NOT NULL,
    pickup_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    pickup_address TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    dispatch_time TIMESTAMPTZ,
    estimated_delivery_time TIMESTAMPTZ,
    actual_delivery_time TIMESTAMPTZ,
    current_latitude NUMERIC(10,7),
    current_longitude NUMERIC(10,7),
    status logistics_status_enum NOT NULL DEFAULT 'assigned',
    status_updates_history JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. PRICE_HISTORY
CREATE TABLE IF NOT EXISTS public.price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_type oilseed_crop_enum NOT NULL,
    variety TEXT,
    mandi_name TEXT NOT NULL,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    modal_price_per_quintal NUMERIC(10,2) NOT NULL CHECK (modal_price_per_quintal > 0),
    min_price_per_quintal NUMERIC(10,2) NOT NULL CHECK (min_price_per_quintal > 0),
    max_price_per_quintal NUMERIC(10,2) NOT NULL CHECK (max_price_per_quintal >= min_price_per_quintal),
    arrival_quantity_tonnes NUMERIC(10,2) DEFAULT 0.00,
    price_date DATE NOT NULL,
    source TEXT DEFAULT 'Agmarknet/Govt API',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. WEATHER_LOGS
CREATE TABLE IF NOT EXISTS public.weather_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    district TEXT NOT NULL,
    state TEXT NOT NULL,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    temperature_c NUMERIC(5,2) NOT NULL,
    humidity_pct NUMERIC(5,2) NOT NULL CHECK (humidity_pct >= 0 AND humidity_pct <= 100),
    rainfall_mm NUMERIC(6,2) NOT NULL DEFAULT 0.00 CHECK (rainfall_mm >= 0),
    wind_speed_kmh NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (wind_speed_kmh >= 0),
    weather_condition TEXT NOT NULL,
    forecast_json JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. PEST_REPORTS
CREATE TABLE IF NOT EXISTS public.pest_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    crop_id UUID REFERENCES public.crops(id) ON DELETE SET NULL,
    image_url TEXT NOT NULL,
    detected_pest_or_disease TEXT NOT NULL,
    ai_confidence_score NUMERIC(5,4) CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 1.0),
    severity_level severity_level_enum NOT NULL DEFAULT 'medium',
    recommended_treatment TEXT NOT NULL,
    organic_remedy TEXT,
    chemical_remedy TEXT,
    expert_verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    expert_notes TEXT,
    status pest_report_status_enum NOT NULL DEFAULT 'open',
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. LOAN_APPLICATIONS
CREATE TABLE IF NOT EXISTS public.loan_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_number TEXT UNIQUE NOT NULL,
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    lender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    institution_name TEXT,
    amount_requested NUMERIC(12,2) NOT NULL CHECK (amount_requested > 0),
    approved_amount NUMERIC(12,2) CHECK (approved_amount >= 0),
    interest_rate_annual NUMERIC(5,2) CHECK (interest_rate_annual >= 0),
    tenure_months INT NOT NULL CHECK (tenure_months > 0),
    purpose loan_purpose_enum NOT NULL,
    ai_credit_score INT CHECK (ai_credit_score >= 300 AND ai_credit_score <= 900),
    status loan_status_enum NOT NULL DEFAULT 'draft',
    supporting_documents JSONB DEFAULT '[]'::JSONB,
    disbursed_at TIMESTAMPTZ,
    repayment_schedule JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. INSURANCE_CLAIMS
CREATE TABLE IF NOT EXISTS public.insurance_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_number TEXT UNIQUE NOT NULL,
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    crop_id UUID NOT NULL REFERENCES public.crops(id) ON DELETE CASCADE,
    policy_number TEXT NOT NULL,
    insurance_provider TEXT NOT NULL,
    claim_amount NUMERIC(12,2) NOT NULL CHECK (claim_amount > 0),
    settled_amount NUMERIC(12,2) CHECK (settled_amount >= 0),
    cause_of_loss loss_cause_enum NOT NULL,
    loss_percentage NUMERIC(5,2) NOT NULL CHECK (loss_percentage > 0 AND loss_percentage <= 100),
    damage_evidence_urls JSONB DEFAULT '[]'::JSONB,
    satellite_loss_index NUMERIC(5,2),
    surveyor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    surveyor_notes TEXT,
    status claim_status_enum NOT NULL DEFAULT 'submitted',
    claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
    settled_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category notification_category_enum NOT NULL DEFAULT 'system',
    priority notification_priority_enum NOT NULL DEFAULT 'normal',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    action_url TEXT,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- SECTION 3: INDEXES & TRIGGERS
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_farmers_user_id ON public.farmers(user_id);
CREATE INDEX IF NOT EXISTS idx_farmers_district_state ON public.farmers(district, state);
CREATE INDEX IF NOT EXISTS idx_farmers_kyc_status ON public.farmers(kyc_status);
CREATE INDEX IF NOT EXISTS idx_land_records_farmer_id ON public.land_records(farmer_id);
CREATE INDEX IF NOT EXISTS idx_crops_farmer_id ON public.crops(farmer_id);
CREATE INDEX IF NOT EXISTS idx_crops_land_id ON public.crops(land_id);
CREATE INDEX IF NOT EXISTS idx_crops_crop_type ON public.crops(crop_type);
CREATE INDEX IF NOT EXISTS idx_crops_season ON public.crops(season);
CREATE INDEX IF NOT EXISTS idx_batches_crop_id ON public.batches(crop_id);
CREATE INDEX IF NOT EXISTS idx_batches_farmer_id ON public.batches(farmer_id);
CREATE INDEX IF NOT EXISTS idx_batches_warehouse_id ON public.batches(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches(status);
CREATE INDEX IF NOT EXISTS idx_warehouses_district_state ON public.warehouses(district, state);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON public.orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_logistics_order_id ON public.logistics(order_id);
CREATE INDEX IF NOT EXISTS idx_price_history_crop_date ON public.price_history(crop_type, price_date DESC);
CREATE INDEX IF NOT EXISTS idx_weather_logs_district ON public.weather_logs(district, state, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_pest_reports_farmer_id ON public.pest_reports(farmer_id);
CREATE INDEX IF NOT EXISTS idx_loan_applications_farmer_id ON public.loan_applications(farmer_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_farmer_id ON public.insurance_claims(farmer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id, is_read, created_at DESC);

-- Automatic updated_at Function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_users_updated_at ON public.users;
CREATE TRIGGER tr_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_farmers_updated_at ON public.farmers;
CREATE TRIGGER tr_farmers_updated_at BEFORE UPDATE ON public.farmers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_land_records_updated_at ON public.land_records;
CREATE TRIGGER tr_land_records_updated_at BEFORE UPDATE ON public.land_records FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_crops_updated_at ON public.crops;
CREATE TRIGGER tr_crops_updated_at BEFORE UPDATE ON public.crops FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_warehouses_updated_at ON public.warehouses;
CREATE TRIGGER tr_warehouses_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_batches_updated_at ON public.batches;
CREATE TRIGGER tr_batches_updated_at BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_orders_updated_at ON public.orders;
CREATE TRIGGER tr_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_logistics_updated_at ON public.logistics;
CREATE TRIGGER tr_logistics_updated_at BEFORE UPDATE ON public.logistics FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_pest_reports_updated_at ON public.pest_reports;
CREATE TRIGGER tr_pest_reports_updated_at BEFORE UPDATE ON public.pest_reports FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_loan_applications_updated_at ON public.loan_applications;
CREATE TRIGGER tr_loan_applications_updated_at BEFORE UPDATE ON public.loan_applications FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_insurance_claims_updated_at ON public.insurance_claims;
CREATE TRIGGER tr_insurance_claims_updated_at BEFORE UPDATE ON public.insurance_claims FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Supabase Auth Auto Profile Trigger
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    raw_user_meta JSONB := NEW.raw_user_meta_data;
    assigned_role user_role := 'farmer';
    user_full_name TEXT;
    user_avatar TEXT;
BEGIN
    user_full_name := COALESCE(
        raw_user_meta->>'full_name',
        raw_user_meta->>'name',
        split_part(NEW.email, '@', 1)
    );

    user_avatar := COALESCE(
        raw_user_meta->>'avatar_url',
        raw_user_meta->>'picture',
        NULL
    );

    IF raw_user_meta->>'role' IS NOT NULL THEN
        BEGIN
            assigned_role := (raw_user_meta->>'role')::user_role;
        EXCEPTION WHEN OTHERS THEN
            assigned_role := 'farmer';
        END;
    END IF;

    INSERT INTO public.users (
        id, email, full_name, phone_number, role, avatar_url, is_verified, created_at, updated_at
    )
    VALUES (
        NEW.id, NEW.email, user_full_name, NEW.phone, assigned_role, user_avatar,
        (NEW.email_confirmed_at IS NOT NULL), NOW(), NOW()
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- SECTION 4: STORAGE BUCKETS
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('crop-images', 'crop-images', true, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
    ('documents', 'documents', false, 26214400, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
    ('ml-models', 'ml-models', false, 524288000, ARRAY['application/octet-stream', 'application/x-zip-compressed', 'application/zip', 'application/x-tar'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Policies
DROP POLICY IF EXISTS "Public read access for crop images" ON storage.objects;
CREATE POLICY "Public read access for crop images" ON storage.objects FOR SELECT USING (bucket_id = 'crop-images');

DROP POLICY IF EXISTS "Authenticated users can upload crop images" ON storage.objects;
CREATE POLICY "Authenticated users can upload crop images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'crop-images');

DROP POLICY IF EXISTS "Users can update their own crop images" ON storage.objects;
CREATE POLICY "Users can update their own crop images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'crop-images' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete their own crop images" ON storage.objects;
CREATE POLICY "Users can delete their own crop images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'crop-images' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users and officers can view documents" ON storage.objects;
CREATE POLICY "Users and officers can view documents" ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'documents' AND (
        auth.uid() = owner OR
        EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('government', 'admin'))
    )
);

DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "Admin and service role read ML models" ON storage.objects;
CREATE POLICY "Admin and service role read ML models" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ml-models' AND EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- ----------------------------------------------------------------------------
-- SECTION 5: ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.land_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pest_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
    SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_farmer_id()
RETURNS UUID AS $$
    SELECT id FROM public.farmers WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Users
DROP POLICY IF EXISTS "Public can view basic profiles" ON public.users;
CREATE POLICY "Public can view basic profiles" ON public.users FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Farmers
DROP POLICY IF EXISTS "Anyone authenticated can view farmers" ON public.farmers;
CREATE POLICY "Anyone authenticated can view farmers" ON public.farmers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Farmers can insert their profile" ON public.farmers;
CREATE POLICY "Farmers can insert their profile" ON public.farmers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Farmers can update own profile" ON public.farmers;
CREATE POLICY "Farmers can update own profile" ON public.farmers FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Land Records
DROP POLICY IF EXISTS "Farmers and officers view land records" ON public.land_records;
CREATE POLICY "Farmers and officers view land records" ON public.land_records FOR SELECT TO authenticated
USING (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() IN ('admin', 'government'));

DROP POLICY IF EXISTS "Farmers manage their land records" ON public.land_records;
CREATE POLICY "Farmers manage their land records" ON public.land_records FOR ALL TO authenticated
USING (farmer_id = public.get_current_farmer_id()) WITH CHECK (farmer_id = public.get_current_farmer_id());

-- Crops
DROP POLICY IF EXISTS "View crops" ON public.crops;
CREATE POLICY "View crops" ON public.crops FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Farmers manage their crops" ON public.crops;
CREATE POLICY "Farmers manage their crops" ON public.crops FOR ALL TO authenticated
USING (farmer_id = public.get_current_farmer_id()) WITH CHECK (farmer_id = public.get_current_farmer_id());

-- Batches
DROP POLICY IF EXISTS "View batches" ON public.batches;
CREATE POLICY "View batches" ON public.batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Farmers manage their batches" ON public.batches;
CREATE POLICY "Farmers manage their batches" ON public.batches FOR ALL TO authenticated
USING (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() IN ('fpo', 'processor', 'admin'))
WITH CHECK (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() IN ('fpo', 'processor', 'admin'));

-- Orders
DROP POLICY IF EXISTS "Buyers and sellers view orders" ON public.orders;
CREATE POLICY "Buyers and sellers view orders" ON public.orders FOR SELECT TO authenticated
USING (
    buyer_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.batches b WHERE b.id = orders.batch_id AND b.farmer_id = public.get_current_farmer_id()) OR
    public.get_current_user_role() IN ('admin', 'fpo')
);

DROP POLICY IF EXISTS "Buyers can create orders" ON public.orders;
CREATE POLICY "Buyers can create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "Buyers and sellers update orders" ON public.orders;
CREATE POLICY "Buyers and sellers update orders" ON public.orders FOR UPDATE TO authenticated
USING (
    buyer_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.batches b WHERE b.id = orders.batch_id AND b.farmer_id = public.get_current_farmer_id()) OR
    public.get_current_user_role() = 'admin'
);

-- Warehouses
DROP POLICY IF EXISTS "Anyone can view warehouses" ON public.warehouses;
CREATE POLICY "Anyone can view warehouses" ON public.warehouses FOR SELECT TO authenticated USING (true);

-- Logistics
DROP POLICY IF EXISTS "Logistics tracking viewable by parties" ON public.logistics;
CREATE POLICY "Logistics tracking viewable by parties" ON public.logistics FOR SELECT TO authenticated
USING (
    transporter_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.orders o WHERE o.id = logistics.order_id AND (
            o.buyer_id = auth.uid() OR
            EXISTS (SELECT 1 FROM public.batches b WHERE b.id = o.batch_id AND b.farmer_id = public.get_current_farmer_id())
        )
    ) OR
    public.get_current_user_role() = 'admin'
);

-- Price History & Weather Logs (Public read)
DROP POLICY IF EXISTS "Public read price history" ON public.price_history;
CREATE POLICY "Public read price history" ON public.price_history FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Public read weather logs" ON public.weather_logs;
CREATE POLICY "Public read weather logs" ON public.weather_logs FOR SELECT TO authenticated, anon USING (true);

-- Pest Reports
DROP POLICY IF EXISTS "Farmers view their pest reports" ON public.pest_reports;
CREATE POLICY "Farmers view their pest reports" ON public.pest_reports FOR SELECT TO authenticated
USING (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Farmers create pest reports" ON public.pest_reports;
CREATE POLICY "Farmers create pest reports" ON public.pest_reports FOR INSERT TO authenticated
WITH CHECK (farmer_id = public.get_current_farmer_id());

-- Loans
DROP POLICY IF EXISTS "Farmers and officers view loan applications" ON public.loan_applications;
CREATE POLICY "Farmers and officers view loan applications" ON public.loan_applications FOR SELECT TO authenticated
USING (
    farmer_id = public.get_current_farmer_id() OR
    lender_id = auth.uid() OR
    public.get_current_user_role() IN ('government', 'admin')
);

DROP POLICY IF EXISTS "Farmers insert loan applications" ON public.loan_applications;
CREATE POLICY "Farmers insert loan applications" ON public.loan_applications FOR INSERT TO authenticated
WITH CHECK (farmer_id = public.get_current_farmer_id());

-- Insurance Claims
DROP POLICY IF EXISTS "Farmers and agents view insurance claims" ON public.insurance_claims;
CREATE POLICY "Farmers and agents view insurance claims" ON public.insurance_claims FOR SELECT TO authenticated
USING (
    farmer_id = public.get_current_farmer_id() OR
    surveyor_id = auth.uid() OR
    public.get_current_user_role() IN ('government', 'admin')
);

DROP POLICY IF EXISTS "Farmers file insurance claims" ON public.insurance_claims;
CREATE POLICY "Farmers file insurance claims" ON public.insurance_claims FOR INSERT TO authenticated
WITH CHECK (farmer_id = public.get_current_farmer_id());

-- Notifications
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
