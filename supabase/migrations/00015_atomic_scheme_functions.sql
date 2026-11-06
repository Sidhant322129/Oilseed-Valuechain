-- ============================================================================
-- Migration 00015: Atomic Scheme Engine Functions
-- Project: Sovereign Harvest — NMEO-OP AI Value Chain Platform
--
-- SAFETY: Purely ADDITIVE.  No existing tables, columns, policies, triggers,
--   or functions are altered or dropped.  All new functions use CREATE OR REPLACE.
--   Idempotent: safe to run multiple times.
-- ============================================================================

-- ============================================================================
-- 1. increment_scheme_budget_used
--    Atomically increments budget_used on the schemes row with a row-level
--    lock so concurrent disbursements cannot race.
--    Returns the new budget_used value or raises on overspend.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.increment_scheme_budget_used(
  p_scheme_id  UUID,
  p_amount     NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_budget_total  NUMERIC;
  v_budget_used   NUMERIC;
  v_new_used      NUMERIC;
BEGIN
  SELECT budget_total, budget_used
    INTO v_budget_total, v_budget_used
    FROM public.schemes
   WHERE id = p_scheme_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCHEME_NOT_FOUND: scheme % does not exist', p_scheme_id;
  END IF;

  v_new_used := v_budget_used + p_amount;

  IF v_new_used > v_budget_total THEN
    RAISE EXCEPTION 'BUDGET_EXHAUSTED: incrementing by % would exceed budget (used=%, total=%)',
      p_amount, v_budget_used, v_budget_total;
  END IF;

  UPDATE public.schemes
     SET budget_used = v_new_used
   WHERE id = p_scheme_id;

  RETURN v_new_used;
END;
$$;

COMMENT ON FUNCTION public.increment_scheme_budget_used(UUID, NUMERIC) IS
  'Atomically increments budget_used with a row lock; raises BUDGET_EXHAUSTED if overspent.';


-- ============================================================================
-- 2. create_application_atomic
--    Inserts scheme_applications + initial scheme_application_history +
--    scheme_audit_logs in a single transaction.
--    All three writes succeed or the whole thing rolls back.
--
--    Returns the new application row as JSONB.
--    Raises unique_violation (23505) so Node.js can return 409.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_application_atomic(
  p_scheme_id            UUID,
  p_scheme_version       INT,
  p_farmer_id            UUID,
  p_season               TEXT,
  p_eligibility_snapshot JSONB,
  p_benefit_amount       NUMERIC,
  p_created_by           UUID,
  p_actor_role           TEXT,
  p_is_simulated         BOOLEAN DEFAULT FALSE,
  p_real_user_id         UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app         public.scheme_applications;
  v_remarks     TEXT;
  v_after_json  JSONB;
BEGIN
  INSERT INTO public.scheme_applications (
    scheme_id,
    scheme_version,
    farmer_id,
    season,
    status,
    eligibility_snapshot,
    benefit_amount,
    created_by
  ) VALUES (
    p_scheme_id,
    p_scheme_version,
    p_farmer_id,
    p_season,
    'SUBMITTED',
    p_eligibility_snapshot,
    p_benefit_amount,
    p_created_by
  )
  RETURNING * INTO v_app;

  v_remarks := CASE
    WHEN p_is_simulated THEN 'Application submitted [SIMULATED: ' || p_actor_role || ']'
    ELSE 'Application submitted'
  END;

  INSERT INTO public.scheme_application_history (
    application_id,
    from_status,
    to_status,
    actor_id,
    actor_role,
    remarks
  ) VALUES (
    v_app.id,
    NULL,
    'SUBMITTED',
    p_created_by,
    p_actor_role,
    v_remarks
  );

  v_after_json := jsonb_build_object(
    'scheme_id',      p_scheme_id,
    'farmer_id',      p_farmer_id,
    'season',         p_season,
    'benefit_amount', p_benefit_amount
  );

  IF p_is_simulated THEN
    v_after_json := v_after_json
      || jsonb_build_object(
           'is_simulated',  TRUE,
           'simulated_by',  COALESCE(p_real_user_id, p_created_by)
         );
  END IF;

  INSERT INTO public.scheme_audit_logs (
    actor_id,
    actor_role,
    action,
    entity,
    entity_id,
    after
  ) VALUES (
    p_created_by,
    p_actor_role,
    'APPLICATION_CREATED',
    'scheme_applications',
    v_app.id,
    v_after_json
  );

  RETURN to_jsonb(v_app);

EXCEPTION
  WHEN unique_violation THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.create_application_atomic(UUID,INT,UUID,TEXT,JSONB,NUMERIC,UUID,TEXT,BOOLEAN,UUID) IS
  'Atomically inserts scheme_applications + history + audit log in one transaction.';


-- ============================================================================
-- 3. disburse_application
--    Full atomic disbursement in one transaction.
--    Node.js calls the payment adapter first, then passes the result here.
--    Returns JSONB: { ok, disbursement_id, disbursement_status,
--                     application_status, amount, txn_ref, code, error }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.disburse_application(
  p_application_id  UUID,
  p_actor_id        UUID,
  p_actor_role      TEXT,
  p_amount          NUMERIC,
  p_txn_ref         TEXT,
  p_payment_success BOOLEAN,
  p_payment_error   TEXT    DEFAULT NULL,
  p_is_simulated    BOOLEAN DEFAULT FALSE,
  p_real_user_id    UUID    DEFAULT NULL,
  p_idempotency_key TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app             public.scheme_applications;
  v_existing_disb   public.scheme_disbursements;
  v_disb            public.scheme_disbursements;
  v_idem_key        TEXT;
  v_final_status    TEXT;
  v_app_next_status TEXT;
  v_remarks         TEXT;
  v_after_json      JSONB;
  v_budget_total    NUMERIC;
  v_budget_used     NUMERIC;
BEGIN
  v_idem_key := COALESCE(p_idempotency_key, p_application_id::TEXT || ':v1');

  -- a. Lock application row
  SELECT * INTO v_app
    FROM public.scheme_applications
   WHERE id = p_application_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'NOT_FOUND',
      'error', 'Application not found.');
  END IF;

  -- b. Status guard
  IF v_app.status <> 'SANCTIONED' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'INVALID_STATUS',
      'error', 'Application must be SANCTIONED to disburse. Current: ' || v_app.status);
  END IF;

  -- c. Idempotency check
  SELECT * INTO v_existing_disb
    FROM public.scheme_disbursements
   WHERE idempotency_key = v_idem_key;

  IF FOUND THEN
    IF v_existing_disb.status = 'SUCCESS' THEN
      RETURN jsonb_build_object(
        'ok', TRUE,
        'code', 'ALREADY_DISBURSED',
        'disbursement_id', v_existing_disb.id,
        'application_status', v_app.status
      );
    END IF;
    IF v_existing_disb.status = 'PENDING' THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'DISBURSEMENT_PENDING',
        'error', 'Disbursement already pending. Please wait.');
    END IF;
    -- FAILED -> allow retry
    DELETE FROM public.scheme_disbursements WHERE id = v_existing_disb.id;
  END IF;

  -- d. Budget check (only if payment will succeed and amount > 0)
  IF p_amount > 0 AND p_payment_success THEN
    SELECT budget_total, budget_used
      INTO v_budget_total, v_budget_used
      FROM public.schemes
     WHERE id = v_app.scheme_id
       FOR UPDATE;

    IF (v_budget_total - v_budget_used) < p_amount THEN
      RETURN jsonb_build_object(
        'ok', FALSE,
        'code', 'BUDGET_EXHAUSTED',
        'error', 'Insufficient scheme budget. Available: ' ||
          (v_budget_total - v_budget_used)::TEXT || ', Required: ' || p_amount::TEXT
      );
    END IF;
  END IF;

  -- e. Insert disbursement as PENDING
  INSERT INTO public.scheme_disbursements (
    application_id,
    amount,
    idempotency_key,
    status
  ) VALUES (
    p_application_id,
    p_amount,
    v_idem_key,
    'PENDING'
  )
  RETURNING * INTO v_disb;

  -- f. Update to final status
  v_final_status := CASE WHEN p_payment_success THEN 'SUCCESS' ELSE 'FAILED' END;

  UPDATE public.scheme_disbursements
     SET status  = v_final_status,
         txn_ref = p_txn_ref
   WHERE id = v_disb.id
   RETURNING * INTO v_disb;

  -- g. Increment budget_used on SUCCESS
  IF p_payment_success AND p_amount > 0 THEN
    UPDATE public.schemes
       SET budget_used = budget_used + p_amount
     WHERE id = v_app.scheme_id;
  END IF;

  -- h. Update application status
  v_app_next_status := CASE WHEN p_payment_success THEN 'DISBURSED' ELSE 'FAILED' END;

  UPDATE public.scheme_applications
     SET status     = v_app_next_status,
         updated_at = NOW()
   WHERE id = p_application_id;

  -- i. History row
  v_remarks := CASE
    WHEN p_payment_success THEN
      'DBT disbursed. Txn Ref: ' || COALESCE(p_txn_ref, 'N/A')
      || '. Amount: ' || p_amount::TEXT
      || CASE WHEN p_is_simulated THEN ' [SIMULATED: ' || p_actor_role || ']' ELSE '' END
    ELSE
      COALESCE(p_payment_error, 'Payment failed.')
      || CASE WHEN p_is_simulated THEN ' [SIMULATED: ' || p_actor_role || ']' ELSE '' END
  END;

  INSERT INTO public.scheme_application_history (
    application_id,
    from_status,
    to_status,
    actor_id,
    actor_role,
    remarks
  ) VALUES (
    p_application_id,
    'SANCTIONED',
    v_app_next_status,
    p_actor_id,
    p_actor_role,
    v_remarks
  );

  -- j. Audit log
  v_after_json := jsonb_build_object(
    'status',  v_final_status,
    'txn_ref', p_txn_ref,
    'amount',  p_amount
  );

  IF p_is_simulated THEN
    v_after_json := v_after_json
      || jsonb_build_object(
           'is_simulated', TRUE,
           'simulated_by', COALESCE(p_real_user_id, p_actor_id)
         );
  END IF;

  INSERT INTO public.scheme_audit_logs (
    actor_id,
    actor_role,
    action,
    entity,
    entity_id,
    before,
    after
  ) VALUES (
    p_actor_id,
    p_actor_role,
    'DISBURSEMENT:' || v_final_status,
    'scheme_disbursements',
    v_disb.id,
    jsonb_build_object('status', 'PENDING'),
    v_after_json
  );

  RETURN jsonb_build_object(
    'ok',                  TRUE,
    'disbursement_id',     v_disb.id,
    'disbursement_status', v_final_status,
    'application_status',  v_app_next_status,
    'amount',              p_amount,
    'txn_ref',             p_txn_ref
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok',    FALSE,
      'code',  'DB_ERROR',
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.disburse_application(UUID,UUID,TEXT,NUMERIC,TEXT,BOOLEAN,TEXT,BOOLEAN,UUID,TEXT) IS
  'Fully atomic disbursement: row locks, budget guard, idempotency, history + audit in one transaction.';


-- ============================================================================
-- 4. UPDATE SEED DATA — normalize benefit formulas for demo schemes.
--    Only touches rows where the old placeholder formula is still in place.
-- ============================================================================

-- NMEO-OP v1: FIXED rate=0 -> PER_HECTARE rate=2500
UPDATE public.scheme_versions sv
   SET benefit_formula = '{"type":"PER_HECTARE","rate":2500,"acre_to_ha":0.4047,"description":"Seed subsidy proxy: Rs 2,500 per hectare"}'::jsonb
  FROM public.schemes s
 WHERE sv.scheme_id = s.id
   AND s.code = 'NMEO-OP'
   AND sv.version = 1
   AND sv.benefit_formula->>'type' = 'FIXED'
   AND (sv.benefit_formula->>'rate')::numeric = 0;

-- PM-AASHA v1: MSP_QUANTITY -> PER_HECTARE rate=6000
UPDATE public.scheme_versions sv
   SET benefit_formula = '{"type":"PER_HECTARE","rate":6000,"acre_to_ha":0.4047,"description":"MSP supplement proxy: Rs 6,000 per hectare"}'::jsonb
  FROM public.schemes s
 WHERE sv.scheme_id = s.id
   AND s.code = 'PM-AASHA'
   AND sv.version = 1
   AND sv.benefit_formula->>'type' = 'MSP_QUANTITY';

-- AIF v1: FIXED rate=0 -> FIXED rate=5000 (if scheme exists)
UPDATE public.scheme_versions sv
   SET benefit_formula = '{"type":"FIXED","rate":5000,"description":"Agri Infrastructure Fund: Rs 5,000 fixed grant"}'::jsonb
  FROM public.schemes s
 WHERE sv.scheme_id = s.id
   AND s.code = 'AIF'
   AND sv.version = 1
   AND (sv.benefit_formula->>'rate')::numeric = 0;
