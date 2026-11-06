-- ============================================================================
-- Migration 00014: Scheme Catalog (Additive Only)
-- Project: Sovereign Harvest — NMEO-OP AI Value Chain Platform
-- Branch: feature/scheme-catalog
--
-- SAFETY: This migration is ADDITIVE ONLY.
--   • Creates scheme_catalog and scheme_catalog_sync_runs
--   • Enables RLS (authenticated read, service-role write)
--   • Seeds 12 farmer-relevant national schemes (names only, pending verification)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scheme_catalog (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_key        TEXT        UNIQUE NOT NULL,       -- provider id or slug, used for de-duplication
  name                TEXT        NOT NULL,
  ministry            TEXT,
  level               TEXT,                              -- CENTRAL | STATE | UNKNOWN
  state               TEXT,
  category            TEXT,
  tags                TEXT[],
  description         TEXT,
  eligibility_text    TEXT,
  benefits_text       TEXT,
  application_process TEXT,
  documents_text      TEXT,
  official_url        TEXT,
  source              TEXT        NOT NULL DEFAULT 'MANUAL',   -- MANUAL | APISETU
  raw                 JSONB,                               -- original provider payload, for traceability
  status              TEXT        NOT NULL DEFAULT 'UNVERIFIED'
                                  CHECK (status IN ('UNVERIFIED','VERIFIED','ARCHIVED')),
  last_verified_at    TIMESTAMPTZ,
  is_farmer_relevant  BOOLEAN     DEFAULT false,
  promoted_scheme_id  UUID        REFERENCES public.schemes(id),
  synced_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheme_catalog_category ON public.scheme_catalog (category);
CREATE INDEX IF NOT EXISTS idx_scheme_catalog_state    ON public.scheme_catalog (state);
CREATE INDEX IF NOT EXISTS idx_scheme_catalog_search   ON public.scheme_catalog USING gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')));

CREATE TABLE IF NOT EXISTS public.scheme_catalog_sync_runs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    TEXT        NOT NULL,
  started_at  TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT        NOT NULL,                    -- RUNNING | SUCCESS | FAILED | NOT_CONFIGURED
  fetched     INT         DEFAULT 0,
  inserted    INT         DEFAULT 0,
  updated     INT         DEFAULT 0,
  error       TEXT
);

-- Row-Level Security
ALTER TABLE public.scheme_catalog           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_catalog_sync_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scheme_catalog' AND policyname = 'scheme_catalog_read_authenticated'
  ) THEN
    CREATE POLICY "scheme_catalog_read_authenticated"
      ON public.scheme_catalog FOR SELECT
      TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scheme_catalog_sync_runs' AND policyname = 'scheme_catalog_sync_runs_read_authenticated'
  ) THEN
    CREATE POLICY "scheme_catalog_sync_runs_read_authenticated"
      ON public.scheme_catalog_sync_runs FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SEED DATA — 12 National Farmer-Relevant Schemes (Names only, Unverified)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.scheme_catalog (
  external_key, name, ministry, level, category, tags, description, source, status, is_farmer_relevant, official_url
) VALUES
  (
    'pm-kisan',
    'PM-KISAN (Pradhan Mantri Kisan Samman Nidhi)',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Direct Benefit Transfer',
    ARRAY['farmer', 'kisan', 'income-support', 'dbt'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'pmfby',
    'PMFBY (Pradhan Mantri Fasal Bima Yojana)',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Crop Insurance',
    ARRAY['insurance', 'crop-loss', 'risk-mitigation'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'kisan-credit-card',
    'Kisan Credit Card (KCC)',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Agricultural Credit',
    ARRAY['credit', 'loan', 'short-term', 'kcc'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'nmeo-oilseeds',
    'NMEO-Oilseeds (National Mission on Edible Oils - Oilseeds)',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Seed & Value Chain Subsidy',
    ARRAY['oilseed', 'mustard', 'soybean', 'groundnut', 'seed-hub'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'pm-aasha',
    'PM-AASHA (Pradhan Mantri Annadata Aay SanraksHan Abhiyan)',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Price Support & Procurement',
    ARRAY['msp', 'procurement', 'pss', 'pdps'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'nfsm',
    'NFSM (National Food Security Mission)',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Productivity & Modernization',
    ARRAY['food-security', 'seeds', 'fertiliser', 'farm-mechanization'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'soil-health-card',
    'Soil Health Card Scheme',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Soil & Inputs',
    ARRAY['soil', 'soil-testing', 'nutrients', 'fertility'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'pm-kusum',
    'PM-KUSUM (Pradhan Mantri Kisan Urja Suraksha evam Utthaan Mahabhiyan)',
    'Ministry of New and Renewable Energy',
    'CENTRAL',
    'Solar & Irrigation',
    ARRAY['solar', 'irrigation', 'pumps', 'renewable-energy'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'pmksy',
    'PMKSY (Pradhan Mantri Krishi Sinchayee Yojana)',
    'Ministry of Jal Shakti',
    'CENTRAL',
    'Irrigation & Water Conservation',
    ARRAY['irrigation', 'water-conservation', 'micro-irrigation', 'per-drop-more-crop'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'aif',
    'Agriculture Infrastructure Fund (AIF)',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Infrastructure & Post-Harvest',
    ARRAY['post-harvest', 'cold-storage', 'warehouse', 'infrastructure'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'rkvy',
    'RKVY (Rashtriya Krishi Vikas Yojana)',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Farm Development & Innovation',
    ARRAY['agri-business', 'value-chain', 'holistic-development'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  ),
  (
    'e-nam',
    'e-NAM (National Agriculture Market)',
    'Ministry of Agriculture and Farmers Welfare',
    'CENTRAL',
    'Digital Market Access',
    ARRAY['mandi', 'e-market', 'price-discovery', 'transparent-auction'],
    'Pending verification',
    'MANUAL',
    'UNVERIFIED',
    true,
    NULL
  )
ON CONFLICT (external_key) DO NOTHING;
