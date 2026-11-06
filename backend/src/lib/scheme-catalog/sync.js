// backend/src/lib/scheme-catalog/sync.js
// Synchronization engine for the Scheme Catalog.
// Handles provider iteration, idempotency, field sanitation, and run tracking.

import { adminClient } from '../../config/supabaseClient.js';
import { getProvider } from './index.js';

/**
 * Single editable constant for farmer relevance detection.
 * Matches keywords against scheme name, category, description, and tags.
 */
export const FARMER_RELEVANT_KEYWORDS = Object.freeze([
  'agriculture',
  'farmer',
  'kisan',
  'crop',
  'seed',
  'irrigation',
  'fertiliser',
  'horticulture',
  'oilseed',
  'msp',
  'insurance',
  'soil',
]);

/**
 * Strips HTML tags and normalizes whitespace safely without external parser.
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
export function stripHtml(text) {
  if (!text || typeof text !== 'string') return text || null;
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

/**
 * Determines whether a scheme is relevant to farmers based on keyword presence.
 * @param {import('./types.js').CatalogScheme} scheme
 * @returns {boolean}
 */
export function isFarmerRelevantScheme(scheme) {
  if (!scheme) return false;
  if (scheme.is_farmer_relevant === true) return true;

  const parts = [
    scheme.name || '',
    scheme.category || '',
    scheme.description || '',
    scheme.eligibility_text || '',
    Array.isArray(scheme.tags) ? scheme.tags.join(' ') : '',
  ].join(' ').toLowerCase();

  return FARMER_RELEVANT_KEYWORDS.some((kw) => parts.includes(kw.toLowerCase()));
}

/**
 * Executes a scheme catalog synchronization run.
 *
 * @param {Object} [options]
 * @param {import('./types.js').SchemeCatalogProvider} [options.provider] - Provider instance
 * @param {any} [options.db] - Supabase database client (defaults to adminClient)
 * @returns {Promise<{
 *   success: boolean,
 *   runId: string|null,
 *   status: string,
 *   provider: string,
 *   fetched: number,
 *   inserted: number,
 *   updated: number,
 *   message?: string,
 *   error?: string
 * }>}
 */
export async function runCatalogSync(options = {}) {
  const provider = options.provider || getProvider();
  const db = options.db || adminClient;

  let runId = null;
  const startedAt = new Date().toISOString();

  // 1. Create run record in scheme_catalog_sync_runs
  try {
    const { data: run, error: runError } = await db
      .from('scheme_catalog_sync_runs')
      .insert({
        provider: provider.name,
        started_at: startedAt,
        status: 'RUNNING',
        fetched: 0,
        inserted: 0,
        updated: 0,
      })
      .select('id')
      .single();

    if (!runError && run) {
      runId = run.id;
    }
  } catch (err) {
    // If table not yet migrated, log warning and continue in dry/fallback mode
    console.warn('[scheme-catalog-sync] Could not create sync_run row:', err.message);
  }

  // Helper to close the run row
  async function finalizeRun(status, counts = {}, errorMsg = null) {
    if (!runId) return;
    try {
      await db
        .from('scheme_catalog_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status,
          fetched: counts.fetched || 0,
          inserted: counts.inserted || 0,
          updated: counts.updated || 0,
          error: errorMsg || null,
        })
        .eq('id', runId);
    } catch (err) {
      console.warn('[scheme-catalog-sync] Failed to update sync_run status:', err.message);
    }
  }

  // 2. Check if provider is configured
  if (!provider.isConfigured()) {
    const errorMsg = `Provider "${provider.name}" is not configured with required credentials or environment variables.`;
    await finalizeRun('NOT_CONFIGURED', {}, errorMsg);
    return {
      success: false,
      runId,
      status: 'NOT_CONFIGURED',
      provider: provider.name,
      fetched: 0,
      inserted: 0,
      updated: 0,
      message: 'Provider is not configured.',
      error: errorMsg,
    };
  }

  // 3. Handle manual provider (no-op external fetch)
  if (provider.name === 'manual') {
    const message = 'Managed manually — no external feed to synchronize.';
    await finalizeRun('SUCCESS', { fetched: 0, inserted: 0, updated: 0 }, null);
    return {
      success: true,
      runId,
      status: 'SUCCESS',
      provider: provider.name,
      fetched: 0,
      inserted: 0,
      updated: 0,
      message,
    };
  }

  // 4. Run external sync with provider
  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;

  try {
    const nowIso = new Date().toISOString();

    for await (const batch of provider.fetchAll()) {
      if (!Array.isArray(batch) || batch.length === 0) continue;
      totalFetched += batch.length;

      // Extract external_keys in batch to inspect existing rows
      const keys = batch.map((item) => item.external_key).filter(Boolean);
      const { data: existingRows } = await db
        .from('scheme_catalog')
        .select('external_key, status, last_verified_at, promoted_scheme_id')
        .in('external_key', keys);

      const existingMap = new Map((existingRows || []).map((r) => [r.external_key, r]));

      for (const item of batch) {
        if (!item.external_key || !item.name) continue;

        const existing = existingMap.get(item.external_key);
        const farmerRelevant = isFarmerRelevantScheme(item);

        const sanitized = {
          external_key: item.external_key,
          name: stripHtml(item.name),
          ministry: stripHtml(item.ministry),
          level: item.level || 'CENTRAL',
          state: item.state || null,
          category: stripHtml(item.category),
          tags: Array.isArray(item.tags) ? item.tags.map(stripHtml).filter(Boolean) : [],
          description: stripHtml(item.description),
          eligibility_text: stripHtml(item.eligibility_text),
          benefits_text: stripHtml(item.benefits_text),
          application_process: stripHtml(item.application_process),
          documents_text: stripHtml(item.documents_text),
          official_url: item.official_url || null,
          source: item.source || 'APISETU',
          raw: item.raw || null,
          is_farmer_relevant: farmerRelevant,
          synced_at: nowIso,
          updated_at: nowIso,
        };

        if (existing) {
          // CRITICAL SAFETY RULE: NEVER overwrite status, last_verified_at, or promoted_scheme_id of existing rows!
          const { error: updateError } = await db
            .from('scheme_catalog')
            .update(sanitized)
            .eq('external_key', item.external_key);

          if (!updateError) totalUpdated++;
        } else {
          // New row defaults to UNVERIFIED
          const newRow = {
            ...sanitized,
            status: item.status || 'UNVERIFIED',
            last_verified_at: null,
            promoted_scheme_id: null,
          };
          const { error: insertError } = await db
            .from('scheme_catalog')
            .insert(newRow);

          if (!insertError) totalInserted++;
        }
      }
    }

    const counts = { fetched: totalFetched, inserted: totalInserted, updated: totalUpdated };
    await finalizeRun('SUCCESS', counts, null);

    return {
      success: true,
      runId,
      status: 'SUCCESS',
      provider: provider.name,
      ...counts,
      message: `Sync complete: ${totalFetched} fetched, ${totalInserted} inserted, ${totalUpdated} updated.`,
    };
  } catch (err) {
    const errorMsg = err.message || 'Unknown synchronization error';
    await finalizeRun('FAILED', { fetched: totalFetched, inserted: totalInserted, updated: totalUpdated }, errorMsg);

    return {
      success: false,
      runId,
      status: 'FAILED',
      provider: provider.name,
      fetched: totalFetched,
      inserted: totalInserted,
      updated: totalUpdated,
      error: errorMsg,
    };
  }
}
