// backend/src/lib/scheme-catalog/types.js
// Type definitions and contracts for the Scheme Catalog Provider system.

/**
 * @typedef {'CENTRAL' | 'STATE' | 'UNKNOWN'} SchemeLevel
 * @typedef {'UNVERIFIED' | 'VERIFIED' | 'ARCHIVED'} SchemeStatus
 * @typedef {'MANUAL' | 'APISETU'} SchemeSource
 * @typedef {'RUNNING' | 'SUCCESS' | 'FAILED' | 'NOT_CONFIGURED'} SyncRunStatus
 *
 * @typedef {Object} CatalogScheme
 * @property {string} external_key - Provider ID or unique slug for de-duplication
 * @property {string} name - Scheme name
 * @property {string} [ministry] - Nodal ministry or department
 * @property {SchemeLevel} [level] - Central or State level
 * @property {string} [state] - State name if state-level
 * @property {string} [category] - Scheme category
 * @property {string[]} [tags] - Categorization tags
 * @property {string} [description] - Description/overview
 * @property {string} [eligibility_text] - Detailed eligibility criteria text
 * @property {string} [benefits_text] - Detailed benefit description text
 * @property {string} [application_process] - How to apply instructions
 * @property {string} [documents_text] - Required documents text
 * @property {string} [official_url] - Official portal URL
 * @property {SchemeSource} source - Source provider (MANUAL, APISETU)
 * @property {any} [raw] - Original provider raw payload for traceability
 * @property {SchemeStatus} [status] - Verification status
 * @property {string} [last_verified_at] - ISO timestamp of manual verification
 * @property {boolean} [is_farmer_relevant] - Auto-tagged farmer relevance
 * @property {string} [promoted_scheme_id] - UUID of operational scheme if promoted
 *
 * @typedef {Object} SchemeCatalogProvider
 * @property {string} name - Provider identifier
 * @property {() => boolean} isConfigured - Checks if credentials and env are set
 * @property {(opts?: { since?: Date }) => AsyncIterable<CatalogScheme[]>} fetchAll - Async iterator yielding batches of CatalogScheme
 */

export class NotImplementedUntilSpecProvided extends Error {
  constructor(message = 'Provide the myScheme OpenAPI spec from API Setu to implement this provider.') {
    super(message);
    this.name = 'NotImplementedUntilSpecProvided';
    this.code = 'NOT_IMPLEMENTED_UNTIL_SPEC_PROVIDED';
  }
}
