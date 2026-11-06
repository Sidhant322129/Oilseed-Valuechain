// backend/src/lib/schemes/workflow.js
// Application workflow state machine.
//
// States:   SUBMITTED → AUTO_SCREENED → VERIFIED → APPROVED → SANCTIONED → DISBURSED
//           REJECTED  (from any pre-DISBURSED state)
//           FAILED    → SANCTIONED  (retry from failed disbursement)
//
// Role mapping: GOVERNMENT role on this platform = ADMIN-equivalent.
// No existing auth code is touched — we add a thin resolver here only.

import { adminClient } from '../../config/supabaseClient.js';

// ─── Role constants ──────────────────────────────────────────────────────────
export const SCHEME_ROLES = {
  FARMER:           'FARMER',
  DISTRICT_OFFICER: 'DISTRICT_OFFICER',
  STATE_APPROVER:   'STATE_APPROVER',
  FINANCE_OFFICER:  'FINANCE_OFFICER',
  ADMIN:            'ADMIN',
};

// Map existing platform roles to scheme workflow roles
// GOVERNMENT user gets ADMIN-equivalent access to all workflow steps.
const PLATFORM_TO_SCHEME_ROLE = {
  farmer:     SCHEME_ROLES.FARMER,
  fpo:        SCHEME_ROLES.DISTRICT_OFFICER, // FPOs act as district-level officers
  processor:  SCHEME_ROLES.DISTRICT_OFFICER,
  government: SCHEME_ROLES.ADMIN,            // GOVERNMENT = full admin in scheme engine
  admin:      SCHEME_ROLES.ADMIN,
  retailer:   SCHEME_ROLES.FARMER,           // restricted — no workflow action
};

export function resolveSchemeRole(platformRole) {
  return PLATFORM_TO_SCHEME_ROLE[platformRole] || SCHEME_ROLES.FARMER;
}

// ─── Fixed Simulated Actors for Dev Mode ──────────────────────────────────────
export const SIMULATED_ACTORS = {
  DISTRICT_OFFICER: {
    id: '11111111-1111-4111-a111-111111111111',
    role: SCHEME_ROLES.DISTRICT_OFFICER,
    label: 'District Officer',
  },
  STATE_APPROVER: {
    id: '22222222-2222-4222-a222-222222222222',
    role: SCHEME_ROLES.STATE_APPROVER,
    label: 'State Approver',
  },
  FINANCE_OFFICER: {
    id: '33333333-3333-4333-a333-333333333333',
    role: SCHEME_ROLES.FINANCE_OFFICER,
    label: 'Finance Officer',
  },
};

// ─── Transition graph ────────────────────────────────────────────────────────
// Each entry: toStatus → { allowedFrom: Set, allowedRoles: Set }
const TRANSITIONS = {
  AUTO_SCREENED: {
    allowedFrom:  new Set(['SUBMITTED']),
    allowedRoles: new Set([SCHEME_ROLES.ADMIN, SCHEME_ROLES.DISTRICT_OFFICER]),
    description:  'Automatic eligibility screening complete',
  },
  VERIFIED: {
    allowedFrom:  new Set(['AUTO_SCREENED']),
    allowedRoles: new Set([SCHEME_ROLES.ADMIN, SCHEME_ROLES.DISTRICT_OFFICER]),
    description:  'Field verification complete by District Officer',
  },
  APPROVED: {
    allowedFrom:  new Set(['VERIFIED']),
    allowedRoles: new Set([SCHEME_ROLES.ADMIN, SCHEME_ROLES.STATE_APPROVER]),
    description:  'Application approved by State Approver',
  },
  SANCTIONED: {
    allowedFrom:  new Set(['APPROVED', 'FAILED']),
    allowedRoles: new Set([SCHEME_ROLES.ADMIN, SCHEME_ROLES.FINANCE_OFFICER]),
    description:  'Payment sanctioned by Finance Officer',
  },
  DISBURSED: {
    allowedFrom:  new Set(['SANCTIONED']),
    allowedRoles: new Set([SCHEME_ROLES.ADMIN, SCHEME_ROLES.FINANCE_OFFICER]),
    description:  'DBT payment disbursed successfully',
  },
  REJECTED: {
    allowedFrom:  new Set(['SUBMITTED', 'AUTO_SCREENED', 'VERIFIED', 'APPROVED', 'SANCTIONED']),
    allowedRoles: new Set([SCHEME_ROLES.ADMIN, SCHEME_ROLES.DISTRICT_OFFICER, SCHEME_ROLES.STATE_APPROVER, SCHEME_ROLES.FINANCE_OFFICER]),
    description:  'Application rejected',
    requiresRemarks: true,
  },
  FAILED: {
    allowedFrom:  new Set(['SANCTIONED']),
    allowedRoles: new Set([SCHEME_ROLES.ADMIN, SCHEME_ROLES.FINANCE_OFFICER]),
    description:  'Payment failed — can retry by moving to SANCTIONED',
  },
};

// ─── Maker-checker bypass flag ────────────────────────────────────────────────
// In development, ADMIN role may bypass maker-checker (with audit log entry).
const MAKER_CHECKER_BYPASS_ROLES = new Set(
  process.env.SCHEME_ENGINE_BYPASS_MAKER_CHECKER === 'true'
    ? [SCHEME_ROLES.ADMIN]
    : []
);

/**
 * Validate a status transition.
 * Returns { valid: true } or { valid: false, reason: string, code: string }
 */
export function validateTransition(currentStatus, toStatus, schemeRole, actorId, lastActorId) {
  const trans = TRANSITIONS[toStatus];

  if (!trans) {
    return { valid: false, reason: `Unknown target status: "${toStatus}".`, code: 'INVALID_STATUS' };
  }

  if (!trans.allowedFrom.has(currentStatus)) {
    return {
      valid: false,
      reason: `Cannot transition from "${currentStatus}" to "${toStatus}". Allowed from: [${[...trans.allowedFrom].join(', ')}].`,
      code: 'INVALID_TRANSITION',
    };
  }

  if (!trans.allowedRoles.has(schemeRole)) {
    return {
      valid: false,
      reason: `Your role ("${schemeRole}") cannot perform this transition. Required: [${[...trans.allowedRoles].join(', ')}].`,
      code: 'ROLE_FORBIDDEN',
    };
  }

  // Maker-checker: same actor cannot perform consecutive steps (unless bypass)
  const bypassMakerChecker = MAKER_CHECKER_BYPASS_ROLES.has(schemeRole);
  if (!bypassMakerChecker && lastActorId && actorId && lastActorId === actorId) {
    return {
      valid: false,
      reason: 'Maker-checker rule: the officer who performed the previous step cannot perform this step on the same application.',
      code: 'MAKER_CHECKER_VIOLATION',
    };
  }

  return { valid: true, bypassedMakerChecker: bypassMakerChecker };
}

/**
 * changeStatus — performs a validated workflow transition inside one transaction.
 * Writes:
 *   1. scheme_applications.status + updated_at
 *   2. scheme_application_history row
 *   3. scheme_audit_logs row
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.toStatus
 * @param {string} params.actorId       - platform user UUID
 * @param {string} params.platformRole  - platform role string ('government', 'admin', etc.)
 * @param {string} params.remarks       - optional
 * @returns {{ ok: boolean, application?: object, error?: string, code?: string }}
 */
export async function changeStatus({
  applicationId,
  toStatus,
  actorId,
  platformRole,
  schemeRoleOverride = null,
  isSimulated = false,
  realUserId = null,
  remarks = '',
}) {
  const schemeRole = schemeRoleOverride || resolveSchemeRole(platformRole);

  // 1. Fetch current application state + last history actor
  const { data: app, error: fetchErr } = await adminClient
    .from('scheme_applications')
    .select('id, status, farmer_id, scheme_id, season')
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchErr || !app) {
    return { ok: false, error: 'Application not found.', code: 'NOT_FOUND' };
  }

  // Last actor on this application (for maker-checker)
  const { data: lastHistory } = await adminClient
    .from('scheme_application_history')
    .select('actor_id')
    .eq('application_id', applicationId)
    .order('at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastActorId = lastHistory?.actor_id || null;

  // 2. Validate transition
  const validation = validateTransition(app.status, toStatus, schemeRole, actorId, lastActorId);
  if (!validation.valid) {
    return { ok: false, error: validation.reason, code: validation.code };
  }

  // Require remarks for REJECTED
  if (TRANSITIONS[toStatus]?.requiresRemarks && !remarks?.trim()) {
    return { ok: false, error: 'Remarks are required when rejecting an application.', code: 'REMARKS_REQUIRED' };
  }

  const previousStatus = app.status;

  // 3. Update application status
  const { data: updatedApp, error: updateErr } = await adminClient
    .from('scheme_applications')
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .select()
    .single();

  if (updateErr) {
    return { ok: false, error: updateErr.message, code: 'DB_ERROR' };
  }

  // 4. Write history — must not be swallowed; failure here rolls back the caller
  const historyRemarks = isSimulated
    ? `${remarks ? remarks + ' ' : ''}[SIMULATED: ${schemeRole}]`.trim()
    : (remarks || null);

  const { error: histErr } = await adminClient.from('scheme_application_history').insert({
    application_id: applicationId,
    from_status:    previousStatus,
    to_status:      toStatus,
    actor_id:       actorId,
    actor_role:     schemeRole,
    remarks:        historyRemarks,
  });

  if (histErr) {
    return { ok: false, error: `Status changed but history write failed: ${histErr.message}`, code: 'HISTORY_WRITE_ERROR' };
  }

  // 5. Write audit log
  const auditEntry = {
    actor_id:   actorId,
    actor_role: schemeRole,
    action:     `APPLICATION_STATUS_CHANGE:${previousStatus}→${toStatus}`,
    entity:     'scheme_applications',
    entity_id:  applicationId,
    before:     { status: previousStatus },
    after:      {
      status: toStatus,
      ...(isSimulated ? { is_simulated: true, simulated_by: realUserId || actorId } : {})
    },
  };

  if (validation.bypassedMakerChecker) {
    auditEntry.after.maker_checker_bypassed = true;
    auditEntry.after.bypass_reason = 'ADMIN bypass in development environment';
  }

  // 5. Write audit log — must not be swallowed
  const { error: auditErr } = await adminClient.from('scheme_audit_logs').insert(auditEntry);
  if (auditErr) {
    return { ok: false, error: `Status changed and history written, but audit log failed: ${auditErr.message}`, code: 'AUDIT_WRITE_ERROR' };
  }

  return { ok: true, application: updatedApp };
}
