// backend/src/lib/scheme-catalog/providers/manual.js
// Manual catalog provider: schemes are entered and curated manually by administrators.
// External synchronization is a no-op that reports "managed manually".

/**
 * @implements {import('../types.js').SchemeCatalogProvider}
 */
export class ManualSchemeCatalogProvider {
  constructor() {
    this.name = 'manual';
  }

  /**
   * Manual provider is always configured since it requires no external API keys.
   * @returns {boolean}
   */
  isConfigured() {
    return true;
  }

  /**
   * Async generator yielding empty batches — manual schemes are managed locally.
   * @param {{ since?: Date }} [_opts]
   * @returns {AsyncGenerator<import('../types.js').CatalogScheme[], void, unknown>}
   */
  async *fetchAll(_opts = {}) {
    // No external fetch. Returns immediately.
    return;
  }
}

export const manualProvider = new ManualSchemeCatalogProvider();
