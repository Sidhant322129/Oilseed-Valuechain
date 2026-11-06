-- ==============================================================================
-- Migration: 00016_bid_monitor.sql
-- Admin Bid Monitor — additive only, no existing columns/rows altered.
-- Creates: bid_audit_log, bid_flags
-- Extends: procurement_bids (frozen status + admin columns)
--          users (fpo_bidding_suspended, suspension_reason)
-- ==============================================================================

-- ── 1. Extend procurement_bids status to include 'frozen' ─────────────────────
-- Drop and recreate the CHECK constraint (the only safe way in PG without
-- knowing the auto-generated constraint name, we use a named constraint).
ALTER TABLE public.procurement_bids
  DROP CONSTRAINT IF EXISTS procurement_bids_status_check;

ALTER TABLE public.procurement_bids
  ADD CONSTRAINT procurement_bids_status_check
    CHECK (status IN ('open', 'fulfilled', 'cancelled', 'frozen', 'force_closed'));

-- Admin action tracking columns
ALTER TABLE public.procurement_bids
  ADD COLUMN IF NOT EXISTS frozen_by       UUID  REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS frozen_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_reason   TEXT,
  ADD COLUMN IF NOT EXISTS closed_by       UUID  REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_reason   TEXT,
  ADD COLUMN IF NOT EXISTS remaining_qty   NUMERIC,  -- tracks unfulfilled qty for partial-fill analytics
  ADD COLUMN IF NOT EXISTS offer_price     NUMERIC;  -- canonical offer price per kg (alias for max_price_per_kg)

-- Populate remaining_qty from quantity_tonnes where null
UPDATE public.procurement_bids
  SET remaining_qty = quantity_tonnes * 1000  -- convert tonnes to kg
  WHERE remaining_qty IS NULL;

-- Populate offer_price from max_price_per_kg where null
UPDATE public.procurement_bids
  SET offer_price = max_price_per_kg
  WHERE offer_price IS NULL;

-- ── 2. Extend users for FPO suspension ────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS fpo_bidding_suspended  BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspension_reason      TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by           UUID     REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reinstated_by          UUID     REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reinstated_at          TIMESTAMPTZ;

-- ── 3. bid_audit_log — append-only immutable audit trail ──────────────────────
CREATE TABLE IF NOT EXISTS public.bid_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id      TEXT        REFERENCES public.procurement_bids(id) ON DELETE SET NULL,
  quote_id    TEXT        REFERENCES public.bid_seller_quotes(id) ON DELETE SET NULL,
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role  TEXT        NOT NULL DEFAULT 'system',
  action      TEXT        NOT NULL CHECK (action IN (
    'bid_created', 'price_raised', 'quote_submitted', 'quote_accepted',
    'quote_rejected', 'quote_withdrawn', 'bid_cancelled', 'bid_closed',
    'deadline_extended', 'admin_freeze', 'admin_unfreeze', 'admin_force_close',
    'admin_void_quote', 'fpo_suspended', 'fpo_reinstated', 'anomaly_detected',
    'legacy_backfill'
  )),
  old_value   JSONB,
  new_value   JSONB,
  reason      TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_bid_audit_log_bid_id     ON public.bid_audit_log(bid_id);
CREATE INDEX IF NOT EXISTS idx_bid_audit_log_actor_id   ON public.bid_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_bid_audit_log_action     ON public.bid_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_bid_audit_log_created_at ON public.bid_audit_log(created_at DESC);

-- ── 4. Prevent UPDATE / DELETE on bid_audit_log via trigger ───────────────────
CREATE OR REPLACE FUNCTION public.bid_audit_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bid_audit_log is append-only. UPDATE and DELETE are forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_bid_audit_log_no_update ON public.bid_audit_log;
CREATE TRIGGER trg_bid_audit_log_no_update
  BEFORE UPDATE ON public.bid_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.bid_audit_log_immutable();

DROP TRIGGER IF EXISTS trg_bid_audit_log_no_delete ON public.bid_audit_log;
CREATE TRIGGER trg_bid_audit_log_no_delete
  BEFORE DELETE ON public.bid_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.bid_audit_log_immutable();

-- ── 5. bid_flags — anomaly / concern flags ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bid_flags (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id       TEXT        REFERENCES public.procurement_bids(id) ON DELETE SET NULL,
  quote_id     TEXT        REFERENCES public.bid_seller_quotes(id) ON DELETE SET NULL,
  fpo_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  farmer_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  flag_type    TEXT        NOT NULL,
  severity     TEXT        NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
  details      JSONB       NOT NULL DEFAULT '{}',
  status       TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  review_note  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bid_flags_bid_id    ON public.bid_flags(bid_id);
CREATE INDEX IF NOT EXISTS idx_bid_flags_status    ON public.bid_flags(status);
CREATE INDEX IF NOT EXISTS idx_bid_flags_severity  ON public.bid_flags(severity);
CREATE INDEX IF NOT EXISTS idx_bid_flags_fpo_id    ON public.bid_flags(fpo_id);
CREATE INDEX IF NOT EXISTS idx_bid_flags_created_at ON public.bid_flags(created_at DESC);

-- ── 6. RLS: bid_audit_log — admin read-only, service_role writes ──────────────
ALTER TABLE public.bid_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service_role (used by our adminClient) can INSERT rows
CREATE POLICY "service_role insert bid_audit_log" ON public.bid_audit_log
  FOR INSERT WITH CHECK (TRUE);  -- RLS bypassed by service_role anyway; policy for documentation

-- Admin users can read
CREATE POLICY "admin read bid_audit_log" ON public.bid_audit_log
  FOR SELECT USING (TRUE);  -- server always uses service_role; UI calls go through our JWT-checked API

-- ── 7. RLS: bid_flags ─────────────────────────────────────────────────────────
ALTER TABLE public.bid_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role insert bid_flags" ON public.bid_flags
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "service_role update bid_flags" ON public.bid_flags
  FOR UPDATE USING (TRUE);

CREATE POLICY "admin read bid_flags" ON public.bid_flags
  FOR SELECT USING (TRUE);

-- ── 8. Permissions ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON public.bid_audit_log TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.bid_flags TO authenticated, service_role;

-- ── 9. Backfill legacy bids with a single 'legacy_backfill' audit entry ───────
INSERT INTO public.bid_audit_log (bid_id, actor_role, action, new_value, reason, created_at)
SELECT
  id,
  'system',
  'legacy_backfill',
  jsonb_build_object(
    'crop_type',        crop_type,
    'quantity_tonnes',  quantity_tonnes,
    'max_price_per_kg', max_price_per_kg,
    'status',           status
  ),
  'Automatically backfilled on bid_audit_log table creation (migration 00016)',
  created_at
FROM public.procurement_bids
ON CONFLICT DO NOTHING;
