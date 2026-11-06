// backend/src/lib/scheme-catalog/index.js
// Provider selector and entry point for the Scheme Catalog system.

import { manualProvider } from './providers/manual.js';
import { apiSetuProvider } from './providers/apisetu.js';

export { NotImplementedUntilSpecProvided } from './types.js';
export { manualProvider } from './providers/manual.js';
export { apiSetuProvider } from './providers/apisetu.js';
export { runCatalogSync, isFarmerRelevantScheme, stripHtml, FARMER_RELEVANT_KEYWORDS } from './sync.js';

/**
 * Registry of available scheme catalog providers.
 * @type {Record<string, import('./types.js').SchemeCatalogProvider>}
 */
export const PROVIDERS = {
  manual: manualProvider,
  apisetu: apiSetuProvider,
};

/**
 * Returns the requested or active SchemeCatalogProvider.
 * Falls back to 'manual' if the requested name is unknown or unset.
 *
 * @param {string} [name] - Provider identifier ('manual' | 'apisetu')
 * @returns {import('./types.js').SchemeCatalogProvider}
 */
export function getProvider(name) {
  const providerKey = (name || process.env.SCHEME_CATALOG_PROVIDER || 'manual').trim().toLowerCase();
  return PROVIDERS[providerKey] || PROVIDERS.manual;
}

/**
 * Currently active provider based on environment configuration.
 */
export const ACTIVE_PROVIDER = getProvider();
