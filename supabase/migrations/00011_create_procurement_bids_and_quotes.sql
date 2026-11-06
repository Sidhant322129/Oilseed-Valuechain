-- ==============================================================================
-- Migration: 00011_create_procurement_bids_and_quotes.sql
-- Description: Creates procurement_bids and bid_seller_quotes tables for FPO
--              collective procurement and farmer quote workflow.
-- ==============================================================================

-- 1. Create procurement_bids table
CREATE TABLE IF NOT EXISTS public.procurement_bids (
    id TEXT PRIMARY KEY,
    fpo_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    crop_type TEXT NOT NULL,
    quantity_tonnes NUMERIC NOT NULL,
    max_price_per_kg NUMERIC NOT NULL,
    delivery_deadline DATE NOT NULL,
    target_warehouse_id UUID NULL,
    target_warehouse_name TEXT NULL,
    notes TEXT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fulfilled', 'cancelled')),
    created_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for procurement_bids
CREATE INDEX IF NOT EXISTS idx_procurement_bids_status ON public.procurement_bids(status);
CREATE INDEX IF NOT EXISTS idx_procurement_bids_created_at ON public.procurement_bids(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_bids_fpo ON public.procurement_bids(fpo_id);

-- 2. Create bid_seller_quotes table
CREATE TABLE IF NOT EXISTS public.bid_seller_quotes (
    id TEXT PRIMARY KEY,
    bid_id TEXT NOT NULL REFERENCES public.procurement_bids(id) ON DELETE CASCADE,
    crop_type TEXT NOT NULL,
    farmer_id UUID NULL,
    farmer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    farmer_name TEXT NULL,
    quantity_kg NUMERIC NOT NULL,
    price_per_kg NUMERIC NOT NULL,
    delivery_date DATE NULL,
    notes TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for bid_seller_quotes
CREATE INDEX IF NOT EXISTS idx_bid_seller_quotes_bid_id ON public.bid_seller_quotes(bid_id);
CREATE INDEX IF NOT EXISTS idx_bid_seller_quotes_farmer_user ON public.bid_seller_quotes(farmer_user_id);
CREATE INDEX IF NOT EXISTS idx_bid_seller_quotes_status ON public.bid_seller_quotes(status);

-- 3. Row Level Security (RLS)
ALTER TABLE public.procurement_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_seller_quotes ENABLE ROW LEVEL SECURITY;

-- Read policies (Open to authenticated & anon for marketplace visibility)
CREATE POLICY "Allow read procurement_bids" ON public.procurement_bids
    FOR SELECT USING (true);

CREATE POLICY "Allow read bid_seller_quotes" ON public.bid_seller_quotes
    FOR SELECT USING (true);

-- Write policies (Allow authenticated users and service role)
CREATE POLICY "Allow insert procurement_bids" ON public.procurement_bids
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update procurement_bids" ON public.procurement_bids
    FOR UPDATE USING (true);

CREATE POLICY "Allow delete procurement_bids" ON public.procurement_bids
    FOR DELETE USING (true);

CREATE POLICY "Allow insert bid_seller_quotes" ON public.bid_seller_quotes
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update bid_seller_quotes" ON public.bid_seller_quotes
    FOR UPDATE USING (true);

CREATE POLICY "Allow delete bid_seller_quotes" ON public.bid_seller_quotes
    FOR DELETE USING (true);

-- Permissions
GRANT ALL ON public.procurement_bids TO authenticated, anon, service_role;
GRANT ALL ON public.bid_seller_quotes TO authenticated, anon, service_role;
