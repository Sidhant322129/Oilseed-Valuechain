-- ============================================================================
-- Migration 00002: Create All 14 Database Tables
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
-- Week 1: System Design and Database Setup
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USERS (Profiles extending Supabase Auth)
-- ----------------------------------------------------------------------------
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

COMMENT ON TABLE public.users IS 'Platform user profiles extending Supabase auth.users with RBAC';

-- ----------------------------------------------------------------------------
-- 2. FARMERS (Extended Farmer Profile & KYC)
-- ----------------------------------------------------------------------------
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
    fpo_membership_name TEXT, -- Farmer Producer Organization
    total_land_area_acres NUMERIC(10,2) DEFAULT 0.00 CHECK (total_land_area_acres >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.farmers IS 'Farmer demographic, regional, and banking credentials';

-- ----------------------------------------------------------------------------
-- 3. LAND_RECORDS (Geo-spatial Farmland Holdings)
-- ----------------------------------------------------------------------------
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
    geo_boundary JSONB, -- GeoJSON representation of plot perimeter
    title_deed_doc_url TEXT, -- Path in 'documents' private bucket
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.land_records IS 'Farmland parcels with GPS coordinates, soil metrics, and deeds';

-- ----------------------------------------------------------------------------
-- 4. CROPS (Cultivation Cycles & Growth Stages)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    land_id UUID REFERENCES public.land_records(id) ON DELETE SET NULL,
    crop_type oilseed_crop_enum NOT NULL,
    variety TEXT NOT NULL, -- e.g., 'Girnar-4', 'Pusa Mustard-30', 'JS-335'
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

COMMENT ON TABLE public.crops IS 'Active and historical oilseed crop cultivation cycles';

-- ----------------------------------------------------------------------------
-- 5. WAREHOUSES (Agrilogistics Storage Hubs)
-- ----------------------------------------------------------------------------
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

COMMENT ON TABLE public.warehouses IS 'Certified storage infrastructure for oilseed produce preservation';

-- ----------------------------------------------------------------------------
-- 6. BATCHES (Harvested Produce Lots & Quality Grading)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_id UUID NOT NULL REFERENCES public.crops(id) ON DELETE CASCADE,
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    batch_code TEXT UNIQUE NOT NULL, -- e.g., 'BATCH-MUSTARD-2026-001'
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

COMMENT ON TABLE public.batches IS 'Traceable lots of harvested oilseed with chemical lab assay metrics';

-- ----------------------------------------------------------------------------
-- 7. ORDERS (Marketplace Commerce & Escrow Transactions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL, -- e.g., 'ORD-2026-0001'
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

COMMENT ON TABLE public.orders IS 'Direct mill & buyer procurement orders backed by escrow settlement';

-- ----------------------------------------------------------------------------
-- 8. LOGISTICS (Dispatch & Real-Time Fleet Tracking)
-- ----------------------------------------------------------------------------
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

COMMENT ON TABLE public.logistics IS 'Inter-state agrilogistics, dispatch telemetry, and proof-of-delivery';

-- ----------------------------------------------------------------------------
-- 9. PRICE_HISTORY (Mandi & APMC Market Benchmark Intelligence)
-- ----------------------------------------------------------------------------
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

COMMENT ON TABLE public.price_history IS 'Daily historical market prices across Indian APMC mandis for AI forecasting';

-- ----------------------------------------------------------------------------
-- 10. WEATHER_LOGS (Microclimate Telemetry & Forecasts)
-- ----------------------------------------------------------------------------
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
    forecast_json JSONB, -- 7-day predictive weather trajectory
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.weather_logs IS 'Regional meteorological observations powering yield forecasting';

-- ----------------------------------------------------------------------------
-- 11. PEST_REPORTS (Computer Vision Diagnostics & Advisory)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pest_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    crop_id UUID REFERENCES public.crops(id) ON DELETE SET NULL,
    image_url TEXT NOT NULL, -- Stored in 'crop-images' bucket
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

COMMENT ON TABLE public.pest_reports IS 'AI image diagnostic results, severity ratings, and agronomist treatments';

-- ----------------------------------------------------------------------------
-- 12. LOAN_APPLICATIONS (AI Credit Scoring & Agri-Financing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_number TEXT UNIQUE NOT NULL, -- e.g., 'LOAN-2026-0001'
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
    supporting_documents JSONB DEFAULT '[]'::JSONB, -- Paths in 'documents' bucket
    disbursed_at TIMESTAMPTZ,
    repayment_schedule JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.loan_applications IS 'Agrifinance loan applications with AI underwriting and repayment tracking';

-- ----------------------------------------------------------------------------
-- 13. INSURANCE_CLAIMS (Parametric & Field Loss Settlement)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.insurance_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_number TEXT UNIQUE NOT NULL, -- e.g., 'CLM-PMFBY-2026-001'
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    crop_id UUID NOT NULL REFERENCES public.crops(id) ON DELETE CASCADE,
    policy_number TEXT NOT NULL,
    insurance_provider TEXT NOT NULL,
    claim_amount NUMERIC(12,2) NOT NULL CHECK (claim_amount > 0),
    settled_amount NUMERIC(12,2) CHECK (settled_amount >= 0),
    cause_of_loss loss_cause_enum NOT NULL,
    loss_percentage NUMERIC(5,2) NOT NULL CHECK (loss_percentage > 0 AND loss_percentage <= 100),
    damage_evidence_urls JSONB DEFAULT '[]'::JSONB, -- Photos & docs URLs
    satellite_loss_index NUMERIC(5,2), -- Remote sensing NDVI loss metric
    surveyor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    surveyor_notes TEXT,
    status claim_status_enum NOT NULL DEFAULT 'submitted',
    claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
    settled_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.insurance_claims IS 'Crop loss insurance claims backed by satellite index and field surveys';

-- ----------------------------------------------------------------------------
-- 14. NOTIFICATIONS (Real-time Omnichannel Alerts)
-- ----------------------------------------------------------------------------
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

COMMENT ON TABLE public.notifications IS 'Targeted notifications for weather alerts, prices, orders, and loans';
