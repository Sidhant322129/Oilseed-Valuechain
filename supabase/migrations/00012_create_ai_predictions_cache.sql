-- ============================================================================
-- Migration 00012: Create AI Predictions Cache Table
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
-- Week 5: Price Prediction & Demand-Supply Forecasting Cache
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_type TEXT NOT NULL CHECK (prediction_type IN ('price', 'demand')),
    crop_type oilseed_crop_enum NOT NULL,
    region TEXT NOT NULL DEFAULT 'all',
    forecast_horizon TEXT NOT NULL, -- e.g. '7d', '14d', '30d', '1m', '3m', '6m'
    predictions JSONB NOT NULL,
    model_version TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '6 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ai_predictions_lookup 
    ON public.ai_predictions(prediction_type, crop_type, region, forecast_horizon);

CREATE INDEX IF NOT EXISTS idx_ai_predictions_expires 
    ON public.ai_predictions(expires_at);

COMMENT ON TABLE public.ai_predictions IS 'Cached inference output from the Flask AI microservice for rapid dashboard telemetry and reduced compute load';

-- ── Row Level Security (RLS) ────────────────────────────────────────────────
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;

-- Allow public read access to cached forecasts so dashboard viewers can see trends
DROP POLICY IF EXISTS "Public read ai predictions" ON public.ai_predictions;
CREATE POLICY "Public read ai predictions" 
    ON public.ai_predictions 
    FOR SELECT 
    TO authenticated, anon 
    USING (true);

-- Allow service role / backend server full management of predictions cache
DROP POLICY IF EXISTS "Service role manage ai predictions" ON public.ai_predictions;
CREATE POLICY "Service role manage ai predictions" 
    ON public.ai_predictions 
    FOR ALL 
    TO service_role 
    USING (true)
    WITH CHECK (true);
