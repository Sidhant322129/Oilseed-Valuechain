-- ============================================================================
-- Migration 00005: Row Level Security (RLS) Policies
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
-- Week 1: System Design and Database Setup
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENABLE RLS ON ALL 14 TABLES
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

-- ----------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS FOR RLS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
    SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_farmer_id()
RETURNS UUID AS $$
    SELECT id FROM public.farmers WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3. POLICIES PER TABLE
-- ----------------------------------------------------------------------------

-- 1. USERS
DROP POLICY IF EXISTS "Public can view basic profiles" ON public.users;
CREATE POLICY "Public can view basic profiles"
    ON public.users FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- 2. FARMERS
DROP POLICY IF EXISTS "Anyone authenticated can view farmers" ON public.farmers;
CREATE POLICY "Anyone authenticated can view farmers"
    ON public.farmers FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Farmers can insert their profile" ON public.farmers;
CREATE POLICY "Farmers can insert their profile"
    ON public.farmers FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Farmers can update own profile" ON public.farmers;
CREATE POLICY "Farmers can update own profile"
    ON public.farmers FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

-- 3. LAND RECORDS
DROP POLICY IF EXISTS "Farmers and officers view land records" ON public.land_records;
CREATE POLICY "Farmers and officers view land records"
    ON public.land_records FOR SELECT
    TO authenticated
    USING (
        farmer_id = public.get_current_farmer_id() OR
        public.get_current_user_role() IN ('admin', 'government')
    );

DROP POLICY IF EXISTS "Farmers manage their land records" ON public.land_records;
CREATE POLICY "Farmers manage their land records"
    ON public.land_records FOR ALL
    TO authenticated
    USING (farmer_id = public.get_current_farmer_id())
    WITH CHECK (farmer_id = public.get_current_farmer_id());

-- 4. CROPS
DROP POLICY IF EXISTS "View crops" ON public.crops;
CREATE POLICY "View crops"
    ON public.crops FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Farmers manage their crops" ON public.crops;
CREATE POLICY "Farmers manage their crops"
    ON public.crops FOR ALL
    TO authenticated
    USING (farmer_id = public.get_current_farmer_id())
    WITH CHECK (farmer_id = public.get_current_farmer_id());

-- 5. BATCHES
DROP POLICY IF EXISTS "View batches" ON public.batches;
CREATE POLICY "View batches"
    ON public.batches FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Farmers manage their batches" ON public.batches;
CREATE POLICY "Farmers manage their batches"
    ON public.batches FOR ALL
    TO authenticated
    USING (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() IN ('fpo', 'processor', 'admin'))
    WITH CHECK (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() IN ('fpo', 'processor', 'admin'));

-- 6. ORDERS
DROP POLICY IF EXISTS "Buyers and sellers view orders" ON public.orders;
CREATE POLICY "Buyers and sellers view orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        buyer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.batches b
            WHERE b.id = orders.batch_id AND b.farmer_id = public.get_current_farmer_id()
        ) OR
        public.get_current_user_role() IN ('admin', 'fpo')
    );

DROP POLICY IF EXISTS "Buyers can create orders" ON public.orders;
CREATE POLICY "Buyers can create orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "Buyers and sellers update orders" ON public.orders;
CREATE POLICY "Buyers and sellers update orders"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (
        buyer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.batches b
            WHERE b.id = orders.batch_id AND b.farmer_id = public.get_current_farmer_id()
        ) OR
        public.get_current_user_role() = 'admin'
    );

-- 7. WAREHOUSES
DROP POLICY IF EXISTS "Anyone can view warehouses" ON public.warehouses;
CREATE POLICY "Anyone can view warehouses"
    ON public.warehouses FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Managers and admins update warehouses" ON public.warehouses;
CREATE POLICY "Managers and admins update warehouses"
    ON public.warehouses FOR ALL
    TO authenticated
    USING (manager_id = auth.uid() OR public.get_current_user_role() = 'admin')
    WITH CHECK (manager_id = auth.uid() OR public.get_current_user_role() = 'admin');

-- 8. LOGISTICS
DROP POLICY IF EXISTS "Logistics tracking viewable by parties" ON public.logistics;
CREATE POLICY "Logistics tracking viewable by parties"
    ON public.logistics FOR SELECT
    TO authenticated
    USING (
        transporter_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = logistics.order_id AND (
                o.buyer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.batches b
                    WHERE b.id = o.batch_id AND b.farmer_id = public.get_current_farmer_id()
                )
            )
        ) OR
        public.get_current_user_role() = 'admin'
    );

DROP POLICY IF EXISTS "Transporters update logistics" ON public.logistics;
CREATE POLICY "Transporters update logistics"
    ON public.logistics FOR ALL
    TO authenticated
    USING (transporter_id = auth.uid() OR public.get_current_user_role() = 'admin')
    WITH CHECK (transporter_id = auth.uid() OR public.get_current_user_role() = 'admin');

-- 9. PRICE HISTORY
DROP POLICY IF EXISTS "Public read price history" ON public.price_history;
CREATE POLICY "Public read price history"
    ON public.price_history FOR SELECT
    TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Admin manage price history" ON public.price_history;
CREATE POLICY "Admin manage price history"
    ON public.price_history FOR ALL
    TO authenticated
    USING (public.get_current_user_role() = 'admin')
    WITH CHECK (public.get_current_user_role() = 'admin');

-- 10. WEATHER LOGS
DROP POLICY IF EXISTS "Public read weather logs" ON public.weather_logs;
CREATE POLICY "Public read weather logs"
    ON public.weather_logs FOR SELECT
    TO authenticated, anon
    USING (true);

-- 11. PEST REPORTS
DROP POLICY IF EXISTS "Farmers view their pest reports" ON public.pest_reports;
CREATE POLICY "Farmers view their pest reports"
    ON public.pest_reports FOR SELECT
    TO authenticated
    USING (farmer_id = public.get_current_farmer_id() OR public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Farmers create pest reports" ON public.pest_reports;
CREATE POLICY "Farmers create pest reports"
    ON public.pest_reports FOR INSERT
    TO authenticated
    WITH CHECK (farmer_id = public.get_current_farmer_id());

-- 12. LOAN APPLICATIONS
DROP POLICY IF EXISTS "Farmers and officers view loan applications" ON public.loan_applications;
CREATE POLICY "Farmers and officers view loan applications"
    ON public.loan_applications FOR SELECT
    TO authenticated
    USING (
        farmer_id = public.get_current_farmer_id() OR
        lender_id = auth.uid() OR
        public.get_current_user_role() IN ('government', 'admin')
    );

DROP POLICY IF EXISTS "Farmers insert loan applications" ON public.loan_applications;
CREATE POLICY "Farmers insert loan applications"
    ON public.loan_applications FOR INSERT
    TO authenticated
    WITH CHECK (farmer_id = public.get_current_farmer_id());

DROP POLICY IF EXISTS "Officers update loan applications" ON public.loan_applications;
CREATE POLICY "Officers update loan applications"
    ON public.loan_applications FOR UPDATE
    TO authenticated
    USING (
        farmer_id = public.get_current_farmer_id() OR
        lender_id = auth.uid() OR
        public.get_current_user_role() IN ('government', 'admin')
    );

-- 13. INSURANCE CLAIMS
DROP POLICY IF EXISTS "Farmers and agents view insurance claims" ON public.insurance_claims;
CREATE POLICY "Farmers and agents view insurance claims"
    ON public.insurance_claims FOR SELECT
    TO authenticated
    USING (
        farmer_id = public.get_current_farmer_id() OR
        surveyor_id = auth.uid() OR
        public.get_current_user_role() IN ('government', 'admin')
    );

DROP POLICY IF EXISTS "Farmers file insurance claims" ON public.insurance_claims;
CREATE POLICY "Farmers file insurance claims"
    ON public.insurance_claims FOR INSERT
    TO authenticated
    WITH CHECK (farmer_id = public.get_current_farmer_id());

DROP POLICY IF EXISTS "Agents update claims" ON public.insurance_claims;
CREATE POLICY "Agents update claims"
    ON public.insurance_claims FOR UPDATE
    TO authenticated
    USING (
        surveyor_id = auth.uid() OR
        public.get_current_user_role() IN ('government', 'admin')
    );

-- 14. NOTIFICATIONS
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());
