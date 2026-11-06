-- ============================================================================
-- Migration 00013: Scheme Engine (Additive Only)
-- Project: Sovereign Harvest — NMEO-OP AI Value Chain Platform
-- Branch: feature/scheme-engine
--
-- SAFETY: This migration is ADDITIVE ONLY.
--   • No existing tables, columns, indexes, constraints, or RLS policies are
--     altered, dropped, or renamed.
--   • New tables use the prefix "scheme_" or distinct names to avoid collisions.
--   • All existing queries return identical results after this migration.
--   • IF NOT EXISTS / ON CONFLICT DO NOTHING everywhere — idempotent.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- NOTE ON farmers.aadhaar_hash UNIQUE INDEX
-- ────────────────────────────────────────────────────────────────────────────
-- The existing farmers table already has `aadhaar_hash TEXT UNIQUE` declared
-- in the column definition (migration 00002). A separate unique index is
-- therefore NOT created here.
--
-- DUPLICATE ROW REPORT (read-only observation, no deletions made):
-- If "Kailash Choudhary" appears twice in the farmers/users tables it is
-- because two separate user_id UUIDs exist with similar names. Since
-- aadhaar_hash is UNIQUE, both rows must have different (or NULL) aadhaar_hash
-- values. The safe fix (pending approval) is:
--
--   -- Identify duplicates:
--   SELECT u.full_name, f.id, f.user_id, f.aadhaar_hash
--   FROM farmers f JOIN users u ON u.id = f.user_id
--   WHERE u.full_name ILIKE '%kailash%';
--
--   -- Once you confirm which row to keep, soft-delete the duplicate user by
--   -- setting their role to 'farmer' and clearing their aadhaar_hash:
--   UPDATE farmers SET aadhaar_hash = NULL WHERE id = '<duplicate-id>';
--
-- This migration does NOT touch those rows. Uniqueness for new records is
-- enforced at the application layer in disbursement.js.
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SCHEMES — Master catalogue of government benefit schemes
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.schemes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  description   TEXT,
  type          TEXT        NOT NULL CHECK (type IN ('SUBSIDY', 'MSP', 'DBT')),
  status        TEXT        NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED')),
  badge_label   TEXT,
  benefit_label TEXT,
  budget_total  NUMERIC     NOT NULL DEFAULT 0,
  budget_used   NUMERIC     NOT NULL DEFAULT 0
                            CHECK (budget_used >= 0),
  start_date    DATE,
  end_date      DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.schemes IS 'Master catalogue of government oilseed subsidy/MSP/DBT schemes (Scheme Engine)';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. SCHEME_VERSIONS — Versioned eligibility rules + benefit formulas
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scheme_versions (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id          UUID    NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  version            INT     NOT NULL,
  eligibility_rules  JSONB   NOT NULL,   -- { "all": [{field, op, value}] }
  benefit_formula    JSONB   NOT NULL,   -- { "type": "PER_HECTARE", "rate": 4000, "acre_to_ha": 0.4047 }
  documents_required TEXT[],
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scheme_id, version)
);

COMMENT ON TABLE public.scheme_versions IS 'Versioned eligibility rules and benefit formulae for each scheme';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. SCHEME_APPLICATIONS — Farmer applications to a scheme in a season
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scheme_applications (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id            UUID        NOT NULL REFERENCES public.schemes(id),
  scheme_version       INT         NOT NULL,
  farmer_id            UUID        NOT NULL REFERENCES public.farmers(id),
  season               TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'SUBMITTED'
                                   CHECK (status IN (
                                     'SUBMITTED', 'AUTO_SCREENED', 'VERIFIED',
                                     'APPROVED', 'SANCTIONED', 'DISBURSED',
                                     'REJECTED', 'FAILED'
                                   )),
  eligibility_snapshot JSONB,      -- snapshot of farmer data at time of application
  benefit_amount       NUMERIC,    -- computed server-side
  created_by           UUID,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scheme_id, farmer_id, season)
);

COMMENT ON TABLE public.scheme_applications IS 'Farmer benefit applications with eligibility snapshot and workflow status';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. SCHEME_APPLICATION_HISTORY — Immutable audit trail of status transitions
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scheme_application_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID        NOT NULL REFERENCES public.scheme_applications(id),
  from_status    TEXT,
  to_status      TEXT        NOT NULL,
  actor_id       UUID,
  actor_role     TEXT,
  remarks        TEXT,
  at             TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.scheme_application_history IS 'Append-only status transition history for scheme applications';

-- ════════════════════════════════════════════════════════════════════════════
-- 5. SCHEME_DISBURSEMENTS — Idempotent payment records
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scheme_disbursements (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID    UNIQUE NOT NULL REFERENCES public.scheme_applications(id),
  amount           NUMERIC NOT NULL CHECK (amount >= 0),
  idempotency_key  TEXT    UNIQUE NOT NULL,
  txn_ref          TEXT,
  status           TEXT    NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.scheme_disbursements IS 'Idempotent DBT disbursement records — one row per application';

-- ════════════════════════════════════════════════════════════════════════════
-- 6. SCHEME_AUDIT_LOGS — Append-only governance log
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scheme_audit_logs (
  id         BIGSERIAL   PRIMARY KEY,
  actor_id   UUID,
  actor_role TEXT,
  action     TEXT        NOT NULL,
  entity     TEXT,
  entity_id  UUID,
  before     JSONB,
  after      JSONB,
  at         TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.scheme_audit_logs IS 'Append-only governance audit log for the scheme engine';

-- Block UPDATE and DELETE on audit log — it is write-once
CREATE OR REPLACE FUNCTION public.scheme_audit_logs_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'scheme_audit_logs is append-only: % operations are not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheme_audit_immutable ON public.scheme_audit_logs;
CREATE TRIGGER trg_scheme_audit_immutable
  BEFORE UPDATE OR DELETE ON public.scheme_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.scheme_audit_logs_immutable();

-- ════════════════════════════════════════════════════════════════════════════
-- 7. INDEXES
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_scheme_apps_farmer    ON public.scheme_applications(farmer_id);
CREATE INDEX IF NOT EXISTS idx_scheme_apps_scheme    ON public.scheme_applications(scheme_id);
CREATE INDEX IF NOT EXISTS idx_scheme_apps_status    ON public.scheme_applications(status);
CREATE INDEX IF NOT EXISTS idx_scheme_hist_app       ON public.scheme_application_history(application_id);
CREATE INDEX IF NOT EXISTS idx_scheme_audit_entity   ON public.scheme_audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_scheme_audit_actor    ON public.scheme_audit_logs(actor_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. ROW-LEVEL SECURITY (new tables only)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.schemes                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_versions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_applications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_application_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_disbursements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_audit_logs           ENABLE ROW LEVEL SECURITY;

-- Service-role bypass (backend uses service key — bypasses RLS automatically)
-- Public read on schemes and versions (all authenticated users can browse catalogue)
CREATE POLICY IF NOT EXISTS "schemes_read_authenticated"
  ON public.schemes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "scheme_versions_read_authenticated"
  ON public.scheme_versions FOR SELECT
  TO authenticated USING (true);

-- Farmers can see their own applications only
CREATE POLICY IF NOT EXISTS "scheme_apps_farmer_self"
  ON public.scheme_applications FOR SELECT
  TO authenticated
  USING (
    farmer_id IN (
      SELECT id FROM public.farmers WHERE user_id = auth.uid()
    )
  );

-- History is readable by farmer (own) — government/admin bypass via service key
CREATE POLICY IF NOT EXISTS "scheme_hist_farmer_self"
  ON public.scheme_application_history FOR SELECT
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM public.scheme_applications
      WHERE farmer_id IN (
        SELECT id FROM public.farmers WHERE user_id = auth.uid()
      )
    )
  );

-- Disbursements: farmer sees own
CREATE POLICY IF NOT EXISTS "scheme_disb_farmer_self"
  ON public.scheme_disbursements FOR SELECT
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM public.scheme_applications
      WHERE farmer_id IN (
        SELECT id FROM public.farmers WHERE user_id = auth.uid()
      )
    )
  );

-- Audit logs: no direct client read (backend service key only)
-- (No SELECT policy means anon/authenticated cannot read — service key bypasses)

-- ════════════════════════════════════════════════════════════════════════════
-- 9. SEED DATA — Idempotent (ON CONFLICT DO NOTHING)
--    Mirrors the 3 hard-coded cards in renderSchemes() exactly
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.schemes
  (code, name, description, type, status, badge_label, benefit_label, budget_total, budget_used, start_date, end_date)
VALUES
  (
    'NMEO-OP',
    'National Mission on Edible Oils - Oilseeds',
    'Special seed hubs, breeder seed production, and cluster demonstrations across targeted oilseed districts.',
    'SUBSIDY', 'ACTIVE',
    'Active Mission', '100% Seed Subsidy',
    500000000, 0,
    '2024-04-01', '2027-03-31'
  ),
  (
    'PM-AASHA',
    'PM Annadata Aay SanraksHan Abhiyan',
    'Price Support Scheme (PSS) guaranteeing procurement at MSP for verified mustard, soyabean, and groundnut batches.',
    'MSP', 'ACTIVE',
    'MSP Active', 'MSP Floor Guarantee',
    300000000, 0,
    '2024-04-01', '2027-03-31'
  ),
  (
    'NFSM-OIL',
    'National Food Security Mission - Oilseeds',
    'Direct benefit transfer for micro-irrigation equipment, plant protection chemicals, and soil ameliorants.',
    'DBT', 'ACTIVE',
    'Grant Linked', '₹4,000 / ha DBT',
    200000000, 0,
    '2024-04-01', '2027-03-31'
  )
ON CONFLICT (code) DO NOTHING;

-- Seed version 1 for each scheme (eligibility rules as JSONB)
INSERT INTO public.scheme_versions (scheme_id, version, eligibility_rules, benefit_formula, documents_required)
SELECT
  s.id,
  1,
  CASE s.code
    WHEN 'NMEO-OP' THEN
      '{"all": [
        {"field": "kyc_status", "op": "==", "value": "verified", "label": "KYC must be verified"},
        {"field": "total_land_area_acres", "op": ">", "value": 0, "label": "Must have registered land area"},
        {"field": "primary_crop", "op": "in", "value": ["mustard","soybean","groundnut","sunflower","sesame","safflower"], "label": "Must grow a covered oilseed crop"}
      ]}'::jsonb
    WHEN 'PM-AASHA' THEN
      '{"all": [
        {"field": "kyc_status", "op": "==", "value": "verified", "label": "KYC must be verified"},
        {"field": "primary_crop", "op": "in", "value": ["mustard","soybean","groundnut"], "label": "Must grow mustard, soybean, or groundnut"},
        {"field": "bank_verified", "op": "==", "value": true, "label": "Bank account must be verified"}
      ]}'::jsonb
    WHEN 'NFSM-OIL' THEN
      '{"all": [
        {"field": "kyc_status", "op": "==", "value": "verified", "label": "KYC must be verified"},
        {"field": "total_land_area_acres", "op": ">", "value": 0, "label": "Must have registered land area"},
        {"field": "bank_verified", "op": "==", "value": true, "label": "Bank account must be verified"}
      ]}'::jsonb
  END,
  CASE s.code
    WHEN 'NMEO-OP'  THEN '{"type": "FIXED", "rate": 0, "description": "100% seed subsidy — non-monetary in-kind benefit"}'::jsonb
    WHEN 'PM-AASHA' THEN '{"type": "MSP_QUANTITY", "rate": 0, "description": "Procurement at MSP — rate varies by crop and season"}'::jsonb
    WHEN 'NFSM-OIL' THEN '{"type": "PER_HECTARE", "rate": 4000, "acre_to_ha": 0.4047, "description": "₹4,000 per hectare DBT grant"}'::jsonb
  END,
  CASE s.code
    WHEN 'NMEO-OP'  THEN ARRAY['aadhaar_card', 'land_record', 'crop_registration']
    WHEN 'PM-AASHA' THEN ARRAY['aadhaar_card', 'land_record', 'bank_passbook', 'crop_registration']
    WHEN 'NFSM-OIL' THEN ARRAY['aadhaar_card', 'land_record', 'bank_passbook']
  END
FROM public.schemes s
WHERE s.code IN ('NMEO-OP', 'PM-AASHA', 'NFSM-OIL')
ON CONFLICT (scheme_id, version) DO NOTHING;
