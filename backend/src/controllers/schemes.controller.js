// backend/src/controllers/schemes.controller.js
// Scheme Engine API controllers — all scheme and application endpoints.
// SAFETY: No existing controller or route is modified.

import { adminClient } from '../config/supabaseClient.js';
import { createError } from '../middleware/errorHandler.js';
import { evaluateEligibility, buildFarmerSnapshot } from '../lib/schemes/eligibility.js';
import { computeBenefit } from '../lib/schemes/benefit.js';
import { changeStatus, resolveSchemeRole, SIMULATED_ACTORS } from '../lib/schemes/workflow.js';
import { disburseBenefit, bulkDisburseBenefit } from '../lib/schemes/disbursement.js';

function extractActor(req) {
  let actorId = req.user.id;
  let platformRole = req.user.role;
  let schemeRoleOverride = null;
  let isSimulated = false;

  // Simulation header honored ONLY in development / non-production environment
  if (process.env.NODE_ENV !== 'production') {
    const simRole = req.headers['x-simulate-scheme-role'];
    if (simRole && SIMULATED_ACTORS[simRole]) {
      const sim = SIMULATED_ACTORS[simRole];
      actorId = sim.id;
      schemeRoleOverride = sim.role;
      isSimulated = true;
    }
  }

  return { actorId, platformRole, schemeRoleOverride, isSimulated, realUserId: req.user.id };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchSchemeWithVersion(schemeId) {
  const [schemeRes, versionRes] = await Promise.all([
    adminClient.from('schemes').select('*').eq('id', schemeId).maybeSingle(),
    adminClient.from('scheme_versions').select('*').eq('scheme_id', schemeId).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { scheme: schemeRes.data, version: versionRes.data };
}

async function fetchFarmerWithCrops(farmerId) {
  const [farmerRes, cropsRes] = await Promise.all([
    adminClient.from('farmers').select('id, kyc_status, total_land_area_acres, bank_account_number, bank_ifsc_code, state, district, village, aadhaar_hash').eq('id', farmerId).maybeSingle(),
    adminClient.from('crops').select('crop_type').eq('farmer_id', farmerId).order('created_at', { ascending: false }).limit(1),
  ]);
  return { farmer: farmerRes.data, crops: cropsRes.data || [] };
}

function liveCounts(applications) {
  const counts = { eligible: 0, applied: 0, verified: 0, approved: 0, disbursed: 0 };
  for (const app of applications) {
    counts.applied++;
    if (app.status === 'AUTO_SCREENED' || app.status === 'VERIFIED') counts.verified++;
    if (app.status === 'APPROVED' || app.status === 'SANCTIONED') counts.approved++;
    if (app.status === 'DISBURSED') counts.disbursed++;
  }
  return counts;
}

const STATUS_NEXT_STEP = {
  SUBMITTED:     { required_role: 'DISTRICT_OFFICER', required_role_label: 'District Officer' },
  AUTO_SCREENED: { required_role: 'DISTRICT_OFFICER', required_role_label: 'District Officer' },
  VERIFIED:      { required_role: 'STATE_APPROVER',   required_role_label: 'State Approver' },
  APPROVED:      { required_role: 'FINANCE_OFFICER',  required_role_label: 'Finance Officer' },
  SANCTIONED:    { required_role: 'FINANCE_OFFICER',  required_role_label: 'Finance Officer' },
};

// ════════════════════════════════════════════════════════════════════════════
// GET /api/schemes
// ════════════════════════════════════════════════════════════════════════════
export async function listSchemes(req, res, next) {
  try {
    const { data: schemes, error } = await adminClient
      .from('schemes')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    // Attach live application counts per scheme
    const { data: apps } = await adminClient
      .from('scheme_applications')
      .select('scheme_id, status');

    const appsByScheme = {};
    for (const app of (apps || [])) {
      if (!appsByScheme[app.scheme_id]) appsByScheme[app.scheme_id] = [];
      appsByScheme[app.scheme_id].push(app);
    }

    const enriched = (schemes || []).map(s => ({
      ...s,
      budget_available: Number(s.budget_total) - Number(s.budget_used),
      counts: liveCounts(appsByScheme[s.id] || []),
    }));

    res.json({ schemes: enriched });
  } catch (err) {
    next(err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GET /api/schemes/:id
// ════════════════════════════════════════════════════════════════════════════
export async function getScheme(req, res, next) {
  try {
    const { id } = req.params;
    const { scheme, version } = await fetchSchemeWithVersion(id);
    if (!scheme) return next(createError('Scheme not found.', 404, 'NOT_FOUND'));

    res.json({
      scheme: {
        ...scheme,
        budget_available: Number(scheme.budget_total) - Number(scheme.budget_used),
      },
      version,
    });
  } catch (err) {
    next(err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GET /api/schemes/:id/eligibility?district=&kyc=&page=1&limit=50
// ════════════════════════════════════════════════════════════════════════════
export async function getSchemeEligibility(req, res, next) {
  try {
    const { id: schemeId } = req.params;
    const { district, kyc, page = 1, limit = 100 } = req.query;

    const { version } = await fetchSchemeWithVersion(schemeId);
    if (!version) return next(createError('Scheme version not found.', 404, 'NOT_FOUND'));

    // Fetch all farmers with their users and latest crop
    let query = adminClient
      .from('farmers')
      .select('id, kyc_status, total_land_area_acres, bank_account_number, bank_ifsc_code, state, district, village, aadhaar_hash, users(full_name, email)')
      .order('created_at', { ascending: true })
      .range((page - 1) * limit, page * limit - 1);

    if (district) query = query.ilike('district', `%${district}%`);
    if (kyc)      query = query.eq('kyc_status', kyc);

    const { data: farmers, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    // Fetch all latest crops in one query
    const farmerIds = (farmers || []).map(f => f.id);
    const { data: allCrops } = await adminClient
      .from('crops')
      .select('farmer_id, crop_type')
      .in('farmer_id', farmerIds)
      .order('created_at', { ascending: false });

    // Group crops by farmer
    const cropsByFarmer = {};
    for (const c of (allCrops || [])) {
      if (!cropsByFarmer[c.farmer_id]) cropsByFarmer[c.farmer_id] = [];
      cropsByFarmer[c.farmer_id].push(c);
    }

    // Fetch existing applications for this scheme
    const { data: existingApps } = await adminClient
      .from('scheme_applications')
      .select('farmer_id, status, benefit_amount, id, created_by')
      .eq('scheme_id', schemeId);

    const appIds = (existingApps || []).map(a => a.id);
    const historyByApp = {};
    if (appIds.length > 0) {
      const { data: histories } = await adminClient
        .from('scheme_application_history')
        .select('application_id, actor_id, actor_role, at')
        .in('application_id', appIds)
        .order('at', { ascending: false });

      for (const h of (histories || [])) {
        if (!historyByApp[h.application_id]) {
          historyByApp[h.application_id] = h;
        }
      }
    }

    const appByFarmer = {};
    for (const a of (existingApps || [])) {
      const lastHist = historyByApp[a.id];
      const lastActorId = lastHist?.actor_id || a.created_by || null;
      const lastActorRole = lastHist?.actor_role || (a.created_by ? 'ADMIN' : null);
      const nextStep = STATUS_NEXT_STEP[a.status] || {};
      appByFarmer[a.farmer_id] = {
        ...a,
        last_actor_id: lastActorId,
        last_actor_role: lastActorRole,
        last_actor: lastHist ? { id: lastHist.actor_id, role: lastHist.actor_role } : (a.created_by ? { id: a.created_by, role: 'ADMIN' } : null),
        required_role: nextStep.required_role || null,
        required_role_label: nextStep.required_role_label || null,
      };
    }

    // Evaluate each farmer
    const results = (farmers || []).map(farmer => {
      const snapshot = buildFarmerSnapshot(farmer, cropsByFarmer[farmer.id] || []);
      const eligibility = evaluateEligibility(snapshot, version.eligibility_rules);
      const { amount } = computeBenefit(version.benefit_formula, snapshot);

      return {
        farmer_id:      farmer.id,
        full_name:      farmer.users?.full_name || '—',
        email:          farmer.users?.email || null,
        district:       farmer.district,
        state:          farmer.state,
        kyc_status:     farmer.kyc_status,
        land_acres:     snapshot.total_land_area_acres,
        primary_crop:   snapshot.primary_crop,
        bank_verified:  snapshot.bank_verified,
        // Mask Aadhaar
        aadhaar_display: farmer.aadhaar_hash
          ? `XXXX-XXXX-${String(farmer.aadhaar_hash).slice(-4)}`
          : null,
        eligible:       eligibility.eligible,
        eligibility_results: eligibility.results,
        benefit_amount: amount,
        application:    appByFarmer[farmer.id] || null,
      };
    });

    res.json({
      scheme_id:   schemeId,
      version:     version.version,
      total:       results.length,
      eligible:    results.filter(r => r.eligible).length,
      ineligible:  results.filter(r => !r.eligible).length,
      farmers:     results,
    });
  } catch (err) {
    next(err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/applications
// Body: { schemeId, farmerId, season }
// ════════════════════════════════════════════════════════════════════════════
export async function createApplication(req, res, next) {
  try {
    const { schemeId, farmerId, season } = req.body;

    if (!schemeId || !farmerId || !season) {
      return next(createError('schemeId, farmerId, and season are required.', 400, 'VALIDATION_ERROR'));
    }

    const { scheme, version } = await fetchSchemeWithVersion(schemeId);
    if (!scheme) return next(createError('Scheme not found.', 404, 'NOT_FOUND'));
    if (!version) return next(createError('No active version for this scheme.', 404, 'NOT_FOUND'));
    if (scheme.status !== 'ACTIVE') return next(createError('Scheme is not currently active.', 400, 'SCHEME_INACTIVE'));

    const { farmer, crops } = await fetchFarmerWithCrops(farmerId);
    if (!farmer) return next(createError('Farmer not found.', 404, 'NOT_FOUND'));

    const snapshot = buildFarmerSnapshot(farmer, crops);
    const eligibility = evaluateEligibility(snapshot, version.eligibility_rules);

    if (!eligibility.eligible) {
      const reasons = eligibility.results.filter(r => !r.passed).map(r => r.message);
      return res.status(422).json({
        error: {
          message: 'Farmer is not eligible for this scheme.',
          code: 'INELIGIBLE',
          reasons,
          eligibility_results: eligibility.results,
        },
      });
    }

    const { amount } = computeBenefit(version.benefit_formula, snapshot);

    const schemeRole = resolveSchemeRole(req.user.role);
    const isSimulated = !!(req.simulatedActor);
    const createdBy   = req.simulatedActor?.id || req.user.id;
    const actorRole   = req.simulatedActor?.role || schemeRole;

    // Atomic RPC: insert application + history + audit in one transaction
    const { data: rpcResult, error: rpcErr } = await adminClient.rpc(
      'create_application_atomic',
      {
        p_scheme_id:            schemeId,
        p_scheme_version:       version.version,
        p_farmer_id:            farmerId,
        p_season:               season,
        p_eligibility_snapshot: snapshot,
        p_benefit_amount:       amount,
        p_created_by:           createdBy,
        p_actor_role:           actorRole,
        p_is_simulated:         isSimulated,
        p_real_user_id:         isSimulated ? req.user.id : null,
      }
    );

    if (rpcErr) {
      if (rpcErr.code === '23505') {
        return next(createError('An application already exists for this farmer, scheme, and season.', 409, 'DUPLICATE_APPLICATION'));
      }
      return next(createError(rpcErr.message, 500, 'DB_INSERT_ERROR'));
    }

    const app = rpcResult;
    res.status(201).json({ application: app, eligibility_results: eligibility.results });
  } catch (err) {
    next(err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/applications/bulk-screen
// Body: { schemeId, season }
// Creates applications for ALL eligible farmers (idempotent)
// ════════════════════════════════════════════════════════════════════════════
export async function bulkScreenApplications(req, res, next) {
  try {
    const { schemeId, season } = req.body;
    if (!schemeId || !season) {
      return next(createError('schemeId and season are required.', 400, 'VALIDATION_ERROR'));
    }

    const { scheme, version } = await fetchSchemeWithVersion(schemeId);
    if (!scheme || !version) return next(createError('Scheme or version not found.', 404, 'NOT_FOUND'));

    const { data: farmers, error } = await adminClient
      .from('farmers')
      .select('id, kyc_status, total_land_area_acres, bank_account_number, bank_ifsc_code, state, district, village, aadhaar_hash');

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    const { data: allCrops } = await adminClient.from('crops').select('farmer_id, crop_type').order('created_at', { ascending: false });
    const cropsByFarmer = {};
    for (const c of (allCrops || [])) {
      if (!cropsByFarmer[c.farmer_id]) cropsByFarmer[c.farmer_id] = [];
      cropsByFarmer[c.farmer_id].push(c);
    }

    const results = { created: 0, skipped_ineligible: 0, skipped_duplicate: 0, errors: 0 };

    for (const farmer of (farmers || [])) {
      const snapshot = buildFarmerSnapshot(farmer, cropsByFarmer[farmer.id] || []);
      const { eligible } = evaluateEligibility(snapshot, version.eligibility_rules);
      if (!eligible) { results.skipped_ineligible++; continue; }

      const { amount } = computeBenefit(version.benefit_formula, snapshot);

      const { error: insertErr } = await adminClient.from('scheme_applications').insert({
        scheme_id:            schemeId,
        scheme_version:       version.version,
        farmer_id:            farmer.id,
        season,
        status:               'AUTO_SCREENED',
        eligibility_snapshot: snapshot,
        benefit_amount:       amount,
        created_by:           req.user.id,
      }).select().single();

      if (insertErr) {
        if (insertErr.code === '23505') results.skipped_duplicate++;
        else results.errors++;
      } else {
        results.created++;
      }
    }

    res.json({ message: 'Bulk screen complete.', results });
  } catch (err) {
    next(err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GET /api/applications?scheme=&status=&district=&page=1&limit=50
// ════════════════════════════════════════════════════════════════════════════
export async function listApplications(req, res, next) {
  try {
    const { scheme, status, district, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = adminClient
      .from('scheme_applications')
      .select(`
        id, status, season, benefit_amount, created_at, updated_at,
        scheme_id, schemes(code, name, type, benefit_label),
        farmer_id, farmers(id, district, state, kyc_status, total_land_area_acres, users(full_name, email))
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (scheme)   query = query.eq('scheme_id', scheme);
    if (status)   query = query.eq('status', status);
    if (district) query = query.ilike('farmers.district', `%${district}%`);

    const { data, error, count } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    const appIds = (data || []).map(a => a.id);
    const historyByApp = {};
    if (appIds.length > 0) {
      const { data: histories } = await adminClient
        .from('scheme_application_history')
        .select('application_id, actor_id, actor_role, at')
        .in('application_id', appIds)
        .order('at', { ascending: false });

      for (const h of (histories || [])) {
        if (!historyByApp[h.application_id]) {
          historyByApp[h.application_id] = h;
        }
      }
    }

    const applications = (data || []).map(a => {
      const lastHist = historyByApp[a.id];
      const lastActorId = lastHist?.actor_id || a.created_by || null;
      const lastActorRole = lastHist?.actor_role || (a.created_by ? 'ADMIN' : null);
      const nextStep = STATUS_NEXT_STEP[a.status] || {};
      return {
        ...a,
        last_actor_id: lastActorId,
        last_actor_role: lastActorRole,
        last_actor: lastHist ? { id: lastHist.actor_id, role: lastHist.actor_role } : (a.created_by ? { id: a.created_by, role: 'ADMIN' } : null),
        required_role: nextStep.required_role || null,
        required_role_label: nextStep.required_role_label || null,
      };
    });

    res.json({ applications, total: count });
  } catch (err) {
    next(err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/applications/:id/transition
// Body: { toStatus, remarks }
// ════════════════════════════════════════════════════════════════════════════
export async function transitionApplication(req, res, next) {
  try {
    const { id } = req.params;
    const { toStatus, remarks } = req.body;

    if (!toStatus) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'toStatus is required.' },
      });
    }

    const { actorId, platformRole, schemeRoleOverride, isSimulated, realUserId } = extractActor(req);

    const result = await changeStatus({
      applicationId: id,
      toStatus:      toStatus.toUpperCase(),
      actorId,
      platformRole,
      schemeRoleOverride,
      isSimulated,
      realUserId,
      remarks:       remarks || '',
    });

    if (!result.ok) {
      let status = 422;
      if (result.code === 'MAKER_CHECKER_VIOLATION') status = 422;
      else if (result.code === 'ROLE_FORBIDDEN' || result.code === 'ROLE_NOT_ALLOWED') status = 403;
      else if (result.code === 'INVALID_TRANSITION' || result.code === 'INVALID_STATUS' || result.code === 'REMARKS_REQUIRED') status = 400;
      else if (result.code === 'NOT_FOUND') status = 404;

      return res.status(status).json({
        error: {
          code: result.code || 'TRANSITION_ERROR',
          message: result.error,
        },
      });
    }

    res.json({ application: result.application });
  } catch (err) {
    res.status(err.status || 500).json({
      error: {
        code: err.code || 'SERVER_ERROR',
        message: err.message || 'Status transition failed.',
      },
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/disbursements
// Body: { applicationId }
// ════════════════════════════════════════════════════════════════════════════
export async function createDisbursement(req, res, next) {
  try {
    const { applicationId } = req.body;
    if (!applicationId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'applicationId is required.' },
      });
    }

    const { actorId, platformRole, schemeRoleOverride, isSimulated, realUserId } = extractActor(req);

    const result = await disburseBenefit({
      applicationId,
      actorId,
      platformRole,
      schemeRoleOverride,
      isSimulated,
      realUserId,
    });

    if (!result.ok) {
      const code = result.code || 'DISBURSEMENT_ERROR';
      let status = 422;
      if (code === 'NOT_FOUND') status = 404;
      else if (code === 'INVALID_STATUS') status = 400;
      else if (code === 'BUDGET_EXHAUSTED' || code === 'BUDGET_EXCEEDED') status = 402;
      else if (code === 'MAKER_CHECKER_VIOLATION') status = 422;
      else if (code === 'ROLE_FORBIDDEN') status = 403;

      return res.status(status).json({
        error: { code, message: result.error },
        disbursement: result.disbursement,
      });
    }

    res.status(result.alreadyDisbursed ? 200 : 201).json({
      disbursement: result.disbursement,
      already_disbursed: result.alreadyDisbursed || false,
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: {
        code: err.code || 'SERVER_ERROR',
        message: err.message || 'Disbursement failed.',
      },
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/disbursements/bulk
// Body: { applicationIds: string[] }
// ════════════════════════════════════════════════════════════════════════════
export async function bulkCreateDisbursement(req, res, next) {
  try {
    const { applicationIds } = req.body;
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'applicationIds must be a non-empty array.' },
      });
    }
    if (applicationIds.length > 50) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Maximum 50 disbursements per bulk request.' },
      });
    }

    const { actorId, platformRole, schemeRoleOverride, isSimulated, realUserId } = extractActor(req);

    const results = await bulkDisburseBenefit({
      applicationIds,
      actorId,
      platformRole,
      schemeRoleOverride,
      isSimulated,
      realUserId,
    });

    res.json({ results });
  } catch (err) {
    res.status(err.status || 500).json({
      error: {
        code: err.code || 'SERVER_ERROR',
        message: err.message || 'Bulk disbursement failed.',
      },
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GET /api/audit-logs?entity=&entity_id=&page=1&limit=50
// ════════════════════════════════════════════════════════════════════════════
export async function listAuditLogs(req, res, next) {
  try {
    const { entity, entity_id, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = adminClient
      .from('scheme_audit_logs')
      .select('*')
      .order('at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (entity)    query = query.eq('entity', entity);
    if (entity_id) query = query.eq('entity_id', entity_id);

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    res.json({ logs: data || [] });
  } catch (err) {
    next(err);
  }
}
