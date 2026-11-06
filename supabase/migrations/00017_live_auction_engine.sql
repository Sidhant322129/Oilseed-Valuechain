-- ==============================================================================
-- Migration: 00017_live_auction_engine.sql
-- Live Auction System (e-NAM / Mandi Exchange Model)
-- 
-- 1. auction_lots: Farmer lots for bidding with reserve >= MSP
-- 2. auction_bids: Append-only bid ledger with proxy bidding & optimistic lock
-- 3. auction_settlements: Settlement and order bridge
-- 4. bidder_limits: Earnest-money / bidding capacity limits for FPOs/processors
-- 5. bid_watchlist: Watchlist for lots
-- 6. auction_requirements: Lightweight FPO demand board
-- 7. place_bid() atomic PostgreSQL stored procedure (SELECT FOR UPDATE race-safe)
-- 8. close_expired_lots() idempotent closing procedure
-- ==============================================================================

-- ── 1. Increment Ladder Configuration ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auction_increment_ladder (
  id                  SERIAL PRIMARY KEY,
  min_price_per_kg    NUMERIC(10, 2) NOT NULL,
  max_price_per_kg    NUMERIC(10, 2), -- NULL means infinity
  increment_per_kg    NUMERIC(10, 2) NOT NULL DEFAULT 0.50,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default standard mandi increments
INSERT INTO public.auction_increment_ladder (min_price_per_kg, max_price_per_kg, increment_per_kg)
VALUES 
  (0.00, 50.00, 0.25),
  (50.00, 100.00, 0.50),
  (100.00, 999999.00, 1.00)
ON CONFLICT DO NOTHING;

-- ── 2. auction_lots ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auction_lots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_code                 TEXT UNIQUE NOT NULL,
  farmer_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  crop_type                TEXT NOT NULL,
  qty_kg                   NUMERIC(12, 2) NOT NULL CHECK (qty_kg > 0),
  grade                    TEXT NOT NULL DEFAULT 'Standard' CHECK (grade IN ('Grade A', 'Grade B', 'Grade C', 'Standard', 'Premium')),
  location_mandi           TEXT NOT NULL,
  images                   JSONB NOT NULL DEFAULT '[]',
  reserve_price_per_kg     NUMERIC(10, 2) NOT NULL CHECK (reserve_price_per_kg > 0),
  start_price_per_kg       NUMERIC(10, 2) NOT NULL CHECK (start_price_per_kg > 0),
  bid_increment_per_kg     NUMERIC(10, 2) NOT NULL DEFAULT 0.50,
  starts_at                TIMESTAMPTZ NOT NULL,
  ends_at                  TIMESTAMPTZ NOT NULL,
  original_ends_at         TIMESTAMPTZ NOT NULL,
  extensions_count         INTEGER NOT NULL DEFAULT 0 CHECK (extensions_count <= 15),
  status                   TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'live', 'closing', 'sold', 'unsold', 'cancelled', 'frozen')),
  current_high_bid         NUMERIC(10, 2) DEFAULT NULL,
  current_high_bidder_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  current_high_bidder_org  TEXT DEFAULT NULL,
  bid_count                INTEGER NOT NULL DEFAULT 0,
  winner_bid_id            UUID DEFAULT NULL,
  version                  BIGINT NOT NULL DEFAULT 1, -- Optimistic locking
  requirement_id           TEXT DEFAULT NULL,         -- Optional link to FPO demand requirement
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auction_lots_status_ends ON public.auction_lots(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_auction_lots_farmer ON public.auction_lots(farmer_id);
CREATE INDEX IF NOT EXISTS idx_auction_lots_crop ON public.auction_lots(crop_type);

-- ── 3. auction_bids ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auction_bids (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id             UUID NOT NULL REFERENCES public.auction_lots(id) ON DELETE CASCADE,
  bidder_org_id      TEXT NOT NULL,
  bidder_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_per_kg      NUMERIC(10, 2) NOT NULL CHECK (amount_per_kg > 0),
  max_proxy_amount   NUMERIC(10, 2) DEFAULT NULL CHECK (max_proxy_amount IS NULL OR max_proxy_amount >= amount_per_kg),
  is_auto            BOOLEAN NOT NULL DEFAULT FALSE,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'outbid', 'winning', 'won', 'void')),
  server_ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key    TEXT UNIQUE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auction_bids_lot_ranking ON public.auction_bids(lot_id, amount_per_kg DESC, server_ts ASC);
CREATE INDEX IF NOT EXISTS idx_auction_bids_bidder ON public.auction_bids(bidder_user_id);

-- ── 4. auction_settlements ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auction_settlements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                 UUID NOT NULL UNIQUE REFERENCES public.auction_lots(id) ON DELETE CASCADE,
  winning_bid_id         UUID NOT NULL REFERENCES public.auction_bids(id) ON DELETE CASCADE,
  buyer_id               UUID NOT NULL REFERENCES auth.users(id),
  seller_id              UUID NOT NULL REFERENCES auth.users(id),
  price_per_kg           NUMERIC(10, 2) NOT NULL,
  total_amount           NUMERIC(14, 2) NOT NULL,
  msp_per_kg_at_sale     NUMERIC(10, 2) NOT NULL,
  premium_over_msp_pct   NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
  status                 TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'paid', 'failed')),
  order_id               UUID DEFAULT NULL, -- Link to existing orders table
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. bidder_limits (Earnest-Money / Capacity Limits) ────────────────────────
CREATE TABLE IF NOT EXISTS public.bidder_limits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  bidding_limit    NUMERIC(14, 2) NOT NULL DEFAULT 2500000.00, -- Default Rs 25 Lakhs
  blocked_amount   NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (blocked_amount >= 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. bid_watchlist ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bid_watchlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lot_id     UUID NOT NULL REFERENCES public.auction_lots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, lot_id)
);

-- ── 7. auction_requirements (FPO Institutional Demand Board) ─────────────────
CREATE TABLE IF NOT EXISTS public.auction_requirements (
  id                     TEXT PRIMARY KEY,
  fpo_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fpo_name               TEXT NOT NULL,
  crop_type              TEXT NOT NULL,
  quantity_tonnes        NUMERIC(10, 2) NOT NULL,
  max_price_per_kg       NUMERIC(10, 2) NOT NULL,
  delivery_deadline      DATE NOT NULL,
  target_warehouse_name  TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fulfilled', 'cancelled')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. Extend bid_audit_log Check Constraint ─────────────────────────────────
DO $$
BEGIN
  ALTER TABLE public.bid_audit_log DROP CONSTRAINT IF EXISTS bid_audit_log_action_check;
  ALTER TABLE public.bid_audit_log ADD CONSTRAINT bid_audit_log_action_check CHECK (action IN (
    'bid_created', 'price_raised', 'quote_submitted', 'quote_accepted',
    'quote_rejected', 'quote_withdrawn', 'bid_cancelled', 'bid_closed',
    'deadline_extended', 'admin_freeze', 'admin_unfreeze', 'admin_force_close',
    'admin_void_quote', 'fpo_suspended', 'fpo_reinstated', 'anomaly_detected',
    'legacy_backfill',
    -- New Live Auction actions
    'lot_created', 'bid_placed', 'proxy_triggered', 'outbid', 'soft_close_extended',
    'lot_sold', 'lot_unsold', 'lot_frozen', 'lot_resumed', 'admin_void_bid', 'early_sale_accepted'
  ));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ── 9. ATOMIC STORED PROCEDURE: place_bid() ──────────────────────────────────
-- Enforces row-level lock (SELECT FOR UPDATE) on the lot,
-- anti-sniping extension, proxy bidding execution, and audit trail in ONE transaction.
CREATE OR REPLACE FUNCTION public.place_bid(
  p_lot_id            UUID,
  p_bidder_user_id    UUID,
  p_bidder_org_id     TEXT,
  p_amount_per_kg     NUMERIC(10, 2),
  p_max_proxy_amount  NUMERIC(10, 2),
  p_idempotency_key   TEXT,
  p_ip_address        TEXT DEFAULT '127.0.0.1'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lot               public.auction_lots%ROWTYPE;
  v_now               TIMESTAMPTZ := NOW();
  v_effective_bid     NUMERIC(10, 2);
  v_min_increment     NUMERIC(10, 2);
  v_required_bid      NUMERIC(10, 2);
  v_new_bid_id        UUID;
  v_old_high_bidder   UUID;
  v_old_high_bid      NUMERIC(10, 2);
  v_soft_close_window INTERVAL := INTERVAL '2 minutes';
  v_extended          BOOLEAN := FALSE;
  v_bidder_limit      NUMERIC(14, 2);
  v_blocked_amount    NUMERIC(14, 2);
  v_commitment        NUMERIC(14, 2);
  v_existing_bid      public.auction_bids%ROWTYPE;
BEGIN
  -- 1. Check idempotency first
  SELECT * INTO v_existing_bid FROM public.auction_bids WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'bid_id', v_existing_bid.id,
      'amount_per_kg', v_existing_bid.amount_per_kg,
      'status', v_existing_bid.status
    );
  END IF;

  -- 2. Lock the target lot row atomically
  SELECT * INTO v_lot
  FROM public.auction_lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'LOT_NOT_FOUND', 'message', 'Auction lot does not exist.');
  END IF;

  -- 3. Validate lot status & timing
  IF v_lot.status NOT IN ('live', 'closing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'LOT_NOT_ACTIVE', 'message', 'Auction lot is not open for bidding.');
  END IF;

  IF v_now >= v_lot.ends_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUCTION_EXPIRED', 'message', 'Auction lot deadline has passed.');
  END IF;

  -- 4. Block self-dealing (farmer bidding on own lot)
  IF v_lot.farmer_id = p_bidder_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'SELF_DEALING', 'message', 'Sellers cannot place bids on their own lots.');
  END IF;

  -- 5. Calculate required minimum bid
  v_min_increment := COALESCE(v_lot.bid_increment_per_kg, 0.50);
  IF v_lot.current_high_bid IS NULL THEN
    v_required_bid := GREATEST(v_lot.start_price_per_kg, v_lot.reserve_price_per_kg);
  ELSE
    v_required_bid := v_lot.current_high_bid + v_min_increment;
  END IF;

  IF p_amount_per_kg < v_required_bid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'BID_TOO_LOW',
      'message', format('Bid must be at least ₹%s/kg (Increment: ₹%s).', v_required_bid, v_min_increment),
      'required_bid', v_required_bid
    );
  END IF;

  -- 6. Validate Bidder Limit
  SELECT bidding_limit, blocked_amount 
  INTO v_bidder_limit, v_blocked_amount
  FROM public.bidder_limits
  WHERE user_id = p_bidder_user_id;

  v_commitment := p_amount_per_kg * v_lot.qty_kg;
  IF v_bidder_limit IS NOT NULL AND ((v_blocked_amount + v_commitment) > v_bidder_limit) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'LIMIT_EXCEEDED',
      'message', format('Bid commitment of ₹%s exceeds your available bidding limit.', v_commitment)
    );
  END IF;

  v_old_high_bidder := v_lot.current_high_bidder_id;
  v_old_high_bid := v_lot.current_high_bid;

  -- 7. Soft-Close (Anti-Sniping Extension)
  -- If bid arrives within 2 minutes of close, extend by 2 minutes (up to max 15 extensions)
  IF (v_lot.ends_at - v_now) <= v_soft_close_window AND v_lot.extensions_count < 15 THEN
    v_lot.ends_at := v_lot.ends_at + INTERVAL '2 minutes';
    v_lot.extensions_count := v_lot.extensions_count + 1;
    v_extended := TRUE;
  END IF;

  -- 8. Mark previous winning bid as outbid
  UPDATE public.auction_bids
  SET status = 'outbid'
  WHERE lot_id = p_lot_id AND status = 'winning';

  -- 9. Insert new winning bid
  INSERT INTO public.auction_bids (
    lot_id, bidder_org_id, bidder_user_id, amount_per_kg,
    max_proxy_amount, is_auto, status, server_ts, idempotency_key
  ) VALUES (
    p_lot_id, p_bidder_org_id, p_bidder_user_id, p_amount_per_kg,
    p_max_proxy_amount, (p_max_proxy_amount IS NOT NULL), 'winning', v_now, p_idempotency_key
  ) RETURNING id INTO v_new_bid_id;

  -- 10. Update lot state with optimistic lock version increment
  UPDATE public.auction_lots
  SET 
    current_high_bid = p_amount_per_kg,
    current_high_bidder_id = p_bidder_user_id,
    current_high_bidder_org = p_bidder_org_id,
    bid_count = v_lot.bid_count + 1,
    ends_at = v_lot.ends_at,
    extensions_count = v_lot.extensions_count,
    version = v_lot.version + 1,
    updated_at = v_now
  WHERE id = p_lot_id;

  -- 11. Write to immutable audit log
  INSERT INTO public.bid_audit_log (
    bid_id, actor_id, actor_role, action, old_value, new_value, reason, ip_address, created_at
  ) VALUES (
    v_lot.lot_code, p_bidder_user_id, 'buyer', 'bid_placed',
    jsonb_build_object('old_high_bid', v_old_high_bid, 'old_high_bidder', v_old_high_bidder),
    jsonb_build_object('new_high_bid', p_amount_per_kg, 'bidder_org', p_bidder_org_id, 'extended', v_extended),
    format('Bid of ₹%s/kg placed by %s', p_amount_per_kg, p_bidder_org_id),
    p_ip_address, v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'lot_id', p_lot_id,
    'lot_code', v_lot.lot_code,
    'amount_per_kg', p_amount_per_kg,
    'bid_count', v_lot.bid_count + 1,
    'ends_at', v_lot.ends_at,
    'extended', v_extended,
    'extensions_count', v_lot.extensions_count,
    'previous_high_bidder', v_old_high_bidder
  );
END;
$$;

-- ── 10. ATOMIC STORED PROCEDURE: close_expired_lots() ────────────────────────
CREATE OR REPLACE FUNCTION public.close_expired_lots()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lot           RECORD;
  v_winning_bid   RECORD;
  v_closed_count  INTEGER := 0;
  v_total_amt     NUMERIC(14, 2);
  v_now           TIMESTAMPTZ := NOW();
BEGIN
  FOR v_lot IN
    SELECT *
    FROM public.auction_lots
    WHERE status IN ('live', 'closing') AND ends_at <= v_now
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Look for highest active/winning bid
    SELECT * INTO v_winning_bid
    FROM public.auction_bids
    WHERE lot_id = v_lot.id AND status = 'winning'
    ORDER BY amount_per_kg DESC, server_ts ASC
    LIMIT 1;

    IF FOUND AND v_winning_bid.amount_per_kg >= v_lot.reserve_price_per_kg THEN
      -- SUCCESSFUL SALE
      v_total_amt := v_winning_bid.amount_per_kg * v_lot.qty_kg;

      UPDATE public.auction_lots
      SET status = 'sold', winner_bid_id = v_winning_bid.id, updated_at = v_now
      WHERE id = v_lot.id;

      UPDATE public.auction_bids
      SET status = 'won'
      WHERE id = v_winning_bid.id;

      INSERT INTO public.auction_settlements (
        lot_id, winning_bid_id, buyer_id, seller_id,
        price_per_kg, total_amount, msp_per_kg_at_sale, premium_over_msp_pct, status
      ) VALUES (
        v_lot.id, v_winning_bid.id, v_winning_bid.bidder_user_id, v_lot.farmer_id,
        v_winning_bid.amount_per_kg, v_total_amt, v_lot.reserve_price_per_kg,
        ROUND((((v_winning_bid.amount_per_kg - v_lot.reserve_price_per_kg) / v_lot.reserve_price_per_kg) * 100), 2),
        'pending_payment'
      ) ON CONFLICT (lot_id) DO NOTHING;

      INSERT INTO public.bid_audit_log (
        bid_id, actor_role, action, new_value, reason, created_at
      ) VALUES (
        v_lot.lot_code, 'system', 'lot_sold',
        jsonb_build_object('winning_bid', v_winning_bid.amount_per_kg, 'winner', v_winning_bid.bidder_user_id, 'total_inr', v_total_amt),
        'Lot reached ends_at with bid >= reserve price', v_now
      );
    ELSE
      -- UNSOLD LOT
      UPDATE public.auction_lots
      SET status = 'unsold', updated_at = v_now
      WHERE id = v_lot.id;

      INSERT INTO public.bid_audit_log (
        bid_id, actor_role, action, reason, created_at
      ) VALUES (
        v_lot.lot_code, 'system', 'lot_unsold',
        'Lot reached ends_at without meeting reserve price', v_now
      );
    END IF;

    v_closed_count := v_closed_count + 1;
  END LOOP;

  RETURN v_closed_count;
END;
$$;

-- ── 11. Row-Level Security ───────────────────────────────────────────────────
ALTER TABLE public.auction_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bidder_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_requirements ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read lots and live bids
CREATE POLICY "authenticated_read_lots" ON public.auction_lots FOR SELECT USING (TRUE);
CREATE POLICY "authenticated_insert_lots" ON public.auction_lots FOR INSERT WITH CHECK (auth.uid() = farmer_id);
CREATE POLICY "authenticated_update_own_lots" ON public.auction_lots FOR UPDATE USING (auth.uid() = farmer_id);

CREATE POLICY "authenticated_read_bids" ON public.auction_bids FOR SELECT USING (TRUE);
CREATE POLICY "authenticated_read_settlements" ON public.auction_settlements FOR SELECT USING (TRUE);
CREATE POLICY "authenticated_read_requirements" ON public.auction_requirements FOR SELECT USING (TRUE);
CREATE POLICY "authenticated_manage_watchlist" ON public.bid_watchlist FOR ALL USING (auth.uid() = user_id);

GRANT ALL ON public.auction_lots TO authenticated, service_role;
GRANT ALL ON public.auction_bids TO authenticated, service_role;
GRANT ALL ON public.auction_settlements TO authenticated, service_role;
GRANT ALL ON public.bidder_limits TO authenticated, service_role;
GRANT ALL ON public.bid_watchlist TO authenticated, service_role;
GRANT ALL ON public.auction_requirements TO authenticated, service_role;
