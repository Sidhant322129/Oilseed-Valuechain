// backend/src/controllers/schemeCatalog.controller.js
// Scheme Catalog API controllers — browse, query, verify, sync, and promote government schemes.
// SAFE & ADDITIVE: zero modification to existing tables or logic.

import { adminClient } from '../config/supabaseClient.js';
import {
  ACTIVE_PROVIDER,
  getProvider,
  runCatalogSync,
  isFarmerRelevantScheme,
} from '../lib/scheme-catalog/index.js';

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

/**
 * GET /api/scheme-catalog
 * Query params:
 *   q: search string (matches name, description, category, ministry)
 *   category: category filter
 *   state: state filter
 *   level: level filter (CENTRAL | STATE | UNKNOWN)
 *   status: status filter (UNVERIFIED | VERIFIED | ARCHIVED)
 *   farmerOnly: boolean string ('true' | 'false', defaults to 'true')
 *   page: integer (defaults to 1)
 *   pageSize: integer (defaults to 12, max 50)
 */
export async function listCatalog(req, res) {
  try {
    const {
      q,
      category,
      state,
      level,
      status,
      farmerOnly = 'true',
      page = 1,
      pageSize = 12,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 12));
    const offset = (pageNum - 1) * limitNum;

    let query = adminClient
      .from('scheme_catalog')
      .select('*', { count: 'exact' });

    // Farmer relevant filter (default true)
    if (farmerOnly !== 'false') {
      query = query.eq('is_farmer_relevant', true);
    }

    // Direct filters
    if (category) query = query.eq('category', category);
    if (state)    query = query.eq('state', state);
    if (level)    query = query.eq('level', level.toUpperCase());
    if (status)   query = query.eq('status', status.toUpperCase());

    // Search query
    if (q && q.trim()) {
      const term = q.trim();
      query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%,ministry.ilike.%${term}%`);
    }

    // Pagination and order
    query = query
      .order('name', { ascending: true })
      .range(offset, offset + limitNum - 1);

    const { data, count, error } = await query;

    if (error) {
      return res.status(500).json({
        error: { code: 'DB_QUERY_ERROR', message: error.message },
      });
    }

    // Aggregate facets for faceted search
    const { data: facetRows } = await adminClient
      .from('scheme_catalog')
      .select('category, level, state, status, is_farmer_relevant');

    const facets = {
      categories: [],
      levels: [],
      states: [],
      statuses: ['UNVERIFIED', 'VERIFIED', 'ARCHIVED'],
    };

    if (facetRows && Array.isArray(facetRows)) {
      const catSet = new Set();
      const levelSet = new Set();
      const stateSet = new Set();

      for (const row of facetRows) {
        if (row.category) catSet.add(row.category);
        if (row.level)    levelSet.add(row.level);
        if (row.state)    stateSet.add(row.state);
      }

      facets.categories = Array.from(catSet).sort();
      facets.levels = Array.from(levelSet).sort();
      facets.states = Array.from(stateSet).sort();
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limitNum) || 1;

    res.json({
      data: data || [],
      total,
      page: pageNum,
      pageSize: limitNum,
      totalPages,
      facets,
    });
  } catch (err) {
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to list scheme catalog.' },
    });
  }
}

/**
 * GET /api/scheme-catalog/sync/status
 * Returns current provider status and last sync run metrics.
 */
export async function getSyncStatus(req, res) {
  try {
    const provider = ACTIVE_PROVIDER;
    const isConfigured = provider.isConfigured();

    const { data: lastRun } = await adminClient
      .from('scheme_catalog_sync_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({
      provider: provider.name,
      isConfigured,
      lastRun: lastRun || null,
    });
  } catch (err) {
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to get sync status.' },
    });
  }
}

/**
 * POST /api/scheme-catalog/sync
 * Admin triggers synchronization run.
 */
export async function syncCatalog(req, res) {
  try {
    const summary = await runCatalogSync(adminClient);
    res.json({
      message: 'Catalog synchronization finished.',
      summary,
    });
  } catch (err) {
    res.status(500).json({
      error: { code: 'SYNC_ERROR', message: err.message || 'Failed to run catalog sync.' },
    });
  }
}

/**
 * GET /api/scheme-catalog/:id
 * Fetches single catalog item by UUID id or external_key slug.
 */
export async function getCatalogItem(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'ID or external_key is required.' },
      });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

    let query = adminClient.from('scheme_catalog').select('*');
    if (isUuid) {
      query = query.eq('id', id);
    } else {
      query = query.eq('external_key', id);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return res.status(500).json({
        error: { code: 'DB_QUERY_ERROR', message: error.message },
      });
    }

    if (!data) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Scheme catalog entry "${id}" not found.` },
      });
    }

    res.json({ data });
  } catch (err) {
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to fetch catalog item.' },
    });
  }
}

/**
 * POST /api/scheme-catalog
 * Admin creates manual scheme entry.
 */
export async function createManualScheme(req, res) {
  try {
    const {
      name,
      description,
      category = 'Agriculture,Rural & Environment',
      level = 'CENTRAL',
      state = null,
      ministry = null,
      nodal_department = null,
      eligibility_criteria = null,
      benefits = null,
      documents_required = [],
      application_url = null,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Scheme name is required.' },
      });
    }

    const external_key = slugify(name);
    const candidate = {
      external_key,
      name: name.trim(),
      description,
      category,
      level: level.toUpperCase(),
      state,
      ministry,
      nodal_department,
      eligibility_criteria,
      benefits,
      documents_required: Array.isArray(documents_required) ? documents_required : [],
      application_url,
      provider: 'manual',
      status: 'UNVERIFIED',
      is_farmer_relevant: isFarmerRelevantScheme({ name, description, category, ministry, benefits }),
      last_synced_at: new Date().toISOString(),
    };

    const { data, error } = await adminClient
      .from('scheme_catalog')
      .insert(candidate)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        error: { code: 'DB_INSERT_ERROR', message: error.message },
      });
    }

    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to create manual scheme.' },
    });
  }
}

/**
 * PATCH /api/scheme-catalog/:id
 * Admin updates catalog scheme details.
 */
export async function updateManualScheme(req, res) {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // Prevent direct alteration of system-managed fields
    delete updates.id;
    delete updates.promoted_scheme_id;
    delete updates.created_at;

    if (updates.name) {
      updates.is_farmer_relevant = isFarmerRelevantScheme(updates);
    }

    const { data, error } = await adminClient
      .from('scheme_catalog')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        error: { code: 'DB_UPDATE_ERROR', message: error.message },
      });
    }

    res.json({ data });
  } catch (err) {
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to update scheme catalog entry.' },
    });
  }
}

/**
 * POST /api/scheme-catalog/:id/verify
 * Admin verifies a catalog scheme.
 */
export async function verifyCatalogScheme(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await adminClient
      .from('scheme_catalog')
      .update({
        status: 'VERIFIED',
        last_verified_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        error: { code: 'DB_UPDATE_ERROR', message: error.message },
      });
    }

    // Append to audit log
    try {
      await adminClient.from('scheme_audit_logs').insert({
        actor_id: req.user?.id || null,
        actor_role: req.user?.role || 'admin',
        action: 'VERIFY_CATALOG_SCHEME',
        entity: 'scheme_catalog',
        entity_id: id,
        after: { status: 'VERIFIED', name: data?.name },
      });
    } catch (_) {
      // non-fatal
    }

    res.json({ data });
  } catch (err) {
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to verify scheme catalog entry.' },
    });
  }
}

/**
 * POST /api/scheme-catalog/:id/promote
 * Promotes a catalog scheme to an operational scheme in DRAFT status.
 */
export async function promoteCatalogScheme(req, res) {
  try {
    const { id } = req.params;

    const { data: catalogItem, error: fetchErr } = await adminClient
      .from('scheme_catalog')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !catalogItem) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Scheme catalog entry not found.' },
      });
    }

    // If already promoted, return existing operational scheme
    if (catalogItem.promoted_scheme_id) {
      const { data: existingScheme } = await adminClient
        .from('schemes')
        .select('*')
        .eq('id', catalogItem.promoted_scheme_id)
        .maybeSingle();

      if (existingScheme) {
        return res.json({
          message: 'Scheme is already promoted to operational.',
          data: existingScheme,
          alreadyPromoted: true,
        });
      }
    }

    // Determine unique code
    let code = (catalogItem.external_key || catalogItem.name)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .slice(0, 16);

    const { data: codeCheck } = await adminClient
      .from('schemes')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (codeCheck) {
      code = `${code}-${Math.floor(100 + Math.random() * 900)}`;
    }

    // 1. Insert into schemes as DRAFT
    const newSchemeData = {
      code,
      name: catalogItem.name,
      description: catalogItem.description || 'Promoted government benefit scheme.',
      type: (catalogItem.benefits && catalogItem.benefits.toLowerCase().includes('dbt')) ? 'DBT' : 'SUBSIDY',
      status: 'DRAFT',
      badge_label: catalogItem.level || 'NATIONAL',
      benefit_label: catalogItem.benefits ? catalogItem.benefits.slice(0, 32) : 'Financial Assistance',
      budget_total: 5000000,
      budget_used: 0,
      start_date: new Date().toISOString().split('T')[0],
    };

    const { data: newScheme, error: createSchemeErr } = await adminClient
      .from('schemes')
      .insert(newSchemeData)
      .select('*')
      .single();

    if (createSchemeErr) {
      return res.status(500).json({
        error: { code: 'CREATE_SCHEME_ERROR', message: createSchemeErr.message },
      });
    }

    // 2. Insert initial scheme_version (v1)
    const initialVersionData = {
      scheme_id: newScheme.id,
      version: 1,
      eligibility_rules: {
        all: [
          { field: 'kyc_status', op: 'eq', value: 'verified', label: 'Aadhaar e-KYC verified' },
          { field: 'land_acres', op: 'gt', value: 0, label: 'Verified cultivable landholding' },
        ],
      },
      benefit_formula: {
        type: 'FIXED',
        amount: 5000,
      },
      documents_required: catalogItem.documents_required?.length
        ? catalogItem.documents_required
        : ['Aadhaar Card', 'Land Record / 7-12 Extract', 'Bank Passbook'],
    };

    await adminClient.from('scheme_versions').insert(initialVersionData);

    // 3. Link back in scheme_catalog
    await adminClient
      .from('scheme_catalog')
      .update({ promoted_scheme_id: newScheme.id })
      .eq('id', catalogItem.id);

    // 4. Governance audit log
    try {
      await adminClient.from('scheme_audit_logs').insert({
        actor_id: req.user?.id || null,
        actor_role: req.user?.role || 'admin',
        action: 'PROMOTE_CATALOG_SCHEME',
        entity: 'scheme_catalog',
        entity_id: catalogItem.id,
        after: {
          promoted_scheme_id: newScheme.id,
          scheme_code: newScheme.code,
          scheme_name: newScheme.name,
        },
      });
    } catch (_) {
      // non-fatal
    }

    res.status(201).json({
      message: 'Scheme successfully promoted to operational DRAFT.',
      data: newScheme,
      alreadyPromoted: false,
    });
  } catch (err) {
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to promote catalog scheme.' },
    });
  }
}
