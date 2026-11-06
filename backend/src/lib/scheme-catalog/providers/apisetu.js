// backend/src/lib/scheme-catalog/providers/apisetu.js
// Stub provider for official API Setu / myScheme API.
// Strictly adheres to safety rules:
//   1. Do NOT scrape myscheme.gov.in or any website.
//   2. Do NOT call undocumented or internal endpoints.
//   3. Do NOT guess request/response formats or auth flows.
//   4. Requires official OpenAPI spec + credentials before live implementation.

import { NotImplementedUntilSpecProvided } from '../types.js';

/**
 * Future Mapping Architecture:
 * When the official API Setu / myScheme OpenAPI specification is provided,
 * map the upstream response payload into our standardized CatalogScheme shape here.
 *
 * @param {any} rawItem - Raw item from official myScheme / API Setu response
 * @returns {import('../types.js').CatalogScheme}
 */
export function mapToCatalogScheme(rawItem) {
  // [PLANNED MAPPING SECTION — PENDING OFFICIAL OPENAPI SPEC]
  // Example future contract once OpenAPI spec is supplied:
  // return {
  //   external_key: rawItem.id || rawItem.slug,
  //   name: rawItem.scheme_name,
  //   ministry: rawItem.nodal_ministry,
  //   level: rawItem.level === 'CENTRAL' ? 'CENTRAL' : 'STATE',
  //   state: rawItem.state_name || null,
  //   category: rawItem.category || null,
  //   tags: Array.isArray(rawItem.tags) ? rawItem.tags : [],
  //   description: rawItem.brief_description,
  //   eligibility_text: rawItem.eligibility_criteria,
  //   benefits_text: rawItem.benefits,
  //   application_process: rawItem.application_procedure,
  //   documents_text: rawItem.required_documents,
  //   official_url: rawItem.portal_url,
  //   source: 'APISETU',
  //   raw: rawItem,
  //   status: 'UNVERIFIED',
  // };
  throw new NotImplementedUntilSpecProvided(
    'Cannot map raw payload: Provide the myScheme OpenAPI spec from API Setu to implement this provider.'
  );
}

/**
 * @implements {import('../types.js').SchemeCatalogProvider}
 */
export class ApiSetuSchemeCatalogProvider {
  constructor() {
    this.name = 'apisetu';
  }

  /**
   * Returns true ONLY if all three required API Setu environment variables are present.
   * @returns {boolean}
   */
  isConfigured() {
    const baseUrl = process.env.APISETU_BASE_URL;
    const clientId = process.env.APISETU_CLIENT_ID;
    const apiKey = process.env.APISETU_API_KEY;
    return Boolean(baseUrl && clientId && apiKey);
  }

  /**
   * Generator for fetching all schemes from API Setu.
   * Throws NotImplementedUntilSpecProvided error until official OpenAPI spec is provided.
   * @param {{ since?: Date }} [_opts]
   * @returns {AsyncGenerator<import('../types.js').CatalogScheme[], void, unknown>}
   */
  async *fetchAll(_opts = {}) {
    if (!this.isConfigured()) {
      throw new Error(
        'API Setu provider is not configured. Missing APISETU_BASE_URL, APISETU_CLIENT_ID, or APISETU_API_KEY.'
      );
    }

    // Safety rule: Never scrape or call internal/invented endpoints.
    // The official OpenAPI spec and contract are required.
    throw new NotImplementedUntilSpecProvided(
      'Provide the myScheme OpenAPI spec from API Setu to implement this provider.'
    );
  }
}

export const apiSetuProvider = new ApiSetuSchemeCatalogProvider();
