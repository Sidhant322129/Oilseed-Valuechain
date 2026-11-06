// backend/src/lib/schemes/disbursement.js
// Idempotent disbursement engine.
//
// Safety guarantees:
//   1. Application must be SANCTIONED before disburse is called.
//   2. Benefit amount is RECOMPUTED server-side — client value is ignored.
//   3. Budget check, idempotency, budget increment, status transition,
//      history and audit are all done inside ONE Postgres transaction via
//      the disburse_application RPC (migration 00015).
//   4. Idempotency key = `${application_id}:v1` — duplicate requests return
//      the existing disbursement record instead of paying twice.
//   5. amount must be > 0; zero-amount schemes are rejected at this stage.

import { adminClient } from '../../config/supabaseClient.js';
import { evaluateEligibility, buildFarmerSnapshot } from './eligibility.js';
import { computeBenefit } from './benefit.js';
import { resolveSchemeRole } from './workflow.js';
import { mockPfmsAdapter } from './adapters/pfms.js';

/**
 * Disburse benefit for a single application.
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.actorId       - platform user UUID
 * @param {string} params.platformRole  - platform role string
 * @returns {{ ok: boolean, disbursement?: object, error?: string, code?: string }}
 */
export async function disburseBenefit({
  applicationId,
  actorId,
  platformRole,
  schemeRoleOverride = null,
  isSimulated = false,
  realUserId = null,
}) {
  const schemeRole = schemeRoleOverride || resolveSchemeRole(platformRole);

  // ── 1. Fetch application ──────────────────────────────────────────────────
  const { data: app, error: appErr } = await adminClient
    .from('scheme_applications')
    .select('id, status, farmer_id, scheme_id, scheme_version, benefit_amount, season')
    .eq('id', applicationId)
    .maybeSingle();

  if (appErr || !app) {
    return { ok: false, error: 'Application not found.', code: 'NOT_FOUND' };
  }

  if (app.status !== 'SANCTIONED') {
    return {
      ok: false,
      error: `Application must be in SANCTIONED status to disburse. Current status: ${app.status}.`,
      code: 'INVALID_STATUS',
    };
  }

  // ── 2. Idempotency pre-check (fast path before recomputing) ──────────────
  const idempotencyKey = `${applicationId}:v1`;
  const { data: existing } = await adminClient
    .from('scheme_disbursements')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'SUCCESS') {
      return { ok: true, disbursement: existing, alreadyDisbursed: true };
    }
    if (existing.status === 'PENDING') {
      return { ok: false, error: 'Disbursement already pending. Please wait.', code: 'DISBURSEMENT_PENDING' };
    }
    // FAILED → fall through (RPC will delete the old record and retry)
  }

  // ── 3. Recompute benefit server-side ──────────────────────────────────────
  const { data: farmer, error: fErr } = await adminClient
    .from('farmers')
    .select('id, kyc_status, total_land_area_acres, bank_account_number, bank_ifsc_code, state, district, village')
    .eq('id', app.farmer_id)
    .maybeSingle();

  if (fErr || !farmer) {
    return { ok: false, error: 'Farmer record not found.', code: 'NOT_FOUND' };
  }

  const { data: crops } = await adminClient
    .from('crops')
    .select('crop_type')
    .eq('farmer_id', app.farmer_id)
    .order('created_at', { ascending: false })
    .limit(1);

  const { data: schemeVersion } = await adminClient
    .from('scheme_versions')
    .select('eligibility_rules, benefit_formula')
    .eq('scheme_id', app.scheme_id)
    .eq('version', app.scheme_version)
    .maybeSingle();

  if (!schemeVersion) {
    return { ok: false, error: 'Scheme version not found.', code: 'NOT_FOUND' };
  }

  const snapshot = buildFarmerSnapshot(farmer, crops || []);

  // Re-verify eligibility at disbursement time (KYC could have changed)
  const eligResult = evaluateEligibility(snapshot, schemeVersion.eligibility_rules);
  if (!eligResult.eligible) {
    const failedRules = eligResult.results.filter(r => !r.passed).map(r => r.message).join('; ');
    return { ok: false, error: `Farmer is no longer eligible: ${failedRules}`, code: 'INELIGIBLE' };
  }

  const { amount } = computeBenefit(schemeVersion.benefit_formula, snapshot);

  // ── 4. Amount guard ───────────────────────────────────────────────────────
  if (amount <= 0) {
    return {
      ok: false,
      error: 'Benefit amount computed as zero. Non-monetary schemes (in-kind/MSP) are not disbursed via DBT. Update the scheme formula or use the appropriate fulfilment channel.',
      code: 'ZERO_AMOUNT',
    };
  }

  // ── 5. Call mock payment adapter (outside DB transaction) ─────────────────
  let txnRef = null;
  let paymentSuccess = false;
  let paymentError = null;

  try {
    const payResult = await mockPfmsAdapter({ amount, farmerId: app.farmer_id, applicationId });
    txnRef = payResult.txn_ref;
    paymentSuccess = payResult.success;
    if (!paymentSuccess) paymentError = payResult.error || 'Payment gateway returned failure.';
  } catch (err) {
    paymentError = err.message || 'Payment gateway error.';
  }

  // ── 6. Atomic DB transaction via RPC ─────────────────────────────────────
  //    Budget check, disbursement record, budget increment, status transition,
  //    history and audit all happen in one Postgres transaction.
  const { data: rpcResult, error: rpcErr } = await adminClient.rpc('disburse_application', {
    p_application_id:  applicationId,
    p_actor_id:        actorId,
    p_actor_role:      schemeRole,
    p_amount:          amount,
    p_txn_ref:         txnRef,
    p_payment_success: paymentSuccess,
    p_payment_error:   paymentError,
    p_is_simulated:    isSimulated,
    p_real_user_id:    realUserId,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcErr) {
    return { ok: false, error: rpcErr.message, code: 'DB_ERROR' };
  }

  if (!rpcResult.ok) {
    return { ok: false, error: rpcResult.error, code: rpcResult.code };
  }

  if (!paymentSuccess) {
    return { ok: false, error: paymentError, code: 'PAYMENT_FAILED', disbursementId: rpcResult.disbursement_id };
  }

  return {
    ok: true,
    disbursementId:      rpcResult.disbursement_id,
    disbursementStatus:  rpcResult.disbursement_status,
    applicationStatus:   rpcResult.application_status,
    amount:              rpcResult.amount,
    txnRef:              rpcResult.txn_ref,
  };
}

/**
 * Bulk disburse — processes each application independently and returns per-item results.
 * Never stops on individual failures.
 */
export async function bulkDisburseBenefit({
  applicationIds,
  actorId,
  platformRole,
  schemeRoleOverride = null,
  isSimulated = false,
  realUserId = null,
}) {
  const results = [];
  for (const applicationId of applicationIds) {
    const result = await disburseBenefit({
      applicationId,
      actorId,
      platformRole,
      schemeRoleOverride,
      isSimulated,
      realUserId,
    });
    results.push({ applicationId, ...result });
  }
  return results;
}


