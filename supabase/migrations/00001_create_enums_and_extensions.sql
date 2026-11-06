-- ============================================================================
-- Migration 00001: Extensions & Custom Enums
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
-- Week 1: System Design and Database Setup
-- ============================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 2. Custom Enumerated Types

-- User Role Types across the Oilseed Value Chain
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'farmer',
        'fpo',
        'processor',
        'retailer',
        'government',
        'admin'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- KYC Verification Status
DO $$ BEGIN
    CREATE TYPE kyc_status_enum AS ENUM (
        'pending',
        'verified',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Soil Types common in Indian Oilseed regions
DO $$ BEGIN
    CREATE TYPE soil_type_enum AS ENUM (
        'black_soil',
        'alluvial_soil',
        'red_soil',
        'sandy_loam',
        'clay_loam',
        'laterite_soil'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Irrigation Sources
DO $$ BEGIN
    CREATE TYPE irrigation_type_enum AS ENUM (
        'drip_irrigation',
        'sprinkler',
        'canal_water',
        'borewell',
        'rainfed',
        'flood_furrow'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Major Indian Oilseed Crops
DO $$ BEGIN
    CREATE TYPE oilseed_crop_enum AS ENUM (
        'mustard',
        'groundnut',
        'soybean',
        'sunflower',
        'sesame',
        'safflower',
        'castor',
        'niger'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Cropping Seasons
DO $$ BEGIN
    CREATE TYPE crop_season_enum AS ENUM (
        'kharif',
        'rabi',
        'zaid'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Crop Growth Lifecycle Status
DO $$ BEGIN
    CREATE TYPE crop_status_enum AS ENUM (
        'sown',
        'vegetative',
        'flowering',
        'pod_formation',
        'mature',
        'harvested',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Quality Grading
DO $$ BEGIN
    CREATE TYPE quality_grade_enum AS ENUM (
        'pending_testing',
        'grade_a_premium',
        'grade_b_standard',
        'grade_c_fair',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Harvested Batch Status
DO $$ BEGIN
    CREATE TYPE batch_status_enum AS ENUM (
        'harvested',
        'quality_tested',
        'in_warehouse',
        'listed_for_sale',
        'sold',
        'dispatched'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Payment Status
DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM (
        'pending',
        'escrow_funded',
        'paid',
        'refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Order Fulfillment Status
DO $$ BEGIN
    CREATE TYPE order_status_enum AS ENUM (
        'placed',
        'confirmed',
        'processing',
        'in_transit',
        'delivered',
        'completed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Logistics & Dispatch Status
DO $$ BEGIN
    CREATE TYPE logistics_status_enum AS ENUM (
        'assigned',
        'pickup_scheduled',
        'in_transit',
        'delayed',
        'out_for_delivery',
        'delivered',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Pest & Disease Severity Level
DO $$ BEGIN
    CREATE TYPE severity_level_enum AS ENUM (
        'low',
        'medium',
        'high',
        'critical'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Pest Report Diagnostic Status
DO $$ BEGIN
    CREATE TYPE pest_report_status_enum AS ENUM (
        'open',
        'verified',
        'treatment_in_progress',
        'resolved'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Loan Purpose Categories
DO $$ BEGIN
    CREATE TYPE loan_purpose_enum AS ENUM (
        'seeds_and_fertilizers',
        'farm_machinery_equipment',
        'irrigation_infrastructure',
        'warehouse_receipt_advance',
        'land_development',
        'working_capital'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Loan Application Lifecycle
DO $$ BEGIN
    CREATE TYPE loan_status_enum AS ENUM (
        'draft',
        'submitted',
        'under_review',
        'approved',
        'rejected',
        'disbursed',
        'repaid',
        'defaulted'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Insurance Cause of Loss
DO $$ BEGIN
    CREATE TYPE loss_cause_enum AS ENUM (
        'drought',
        'excess_rainfall_flood',
        'unseasonal_rain',
        'pest_infestation',
        'hailstorm',
        'fire_lightning',
        'cyclone_storm'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Insurance Claim Lifecycle
DO $$ BEGIN
    CREATE TYPE claim_status_enum AS ENUM (
        'submitted',
        'under_investigation',
        'field_assessed',
        'approved',
        'rejected',
        'settled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Notification Categories & Priorities
DO $$ BEGIN
    CREATE TYPE notification_category_enum AS ENUM (
        'order',
        'weather_alert',
        'pest_alert',
        'mandi_price',
        'loan',
        'insurance',
        'system'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_priority_enum AS ENUM (
        'low',
        'normal',
        'high',
        'urgent'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
