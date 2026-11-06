// backend/src/lib/scheme-catalog/__tests__/catalog.test.js
// Unit tests for the Scheme Catalog Provider Layer.
// Tests run via `node --test backend/src/lib/scheme-catalog/__tests__/catalog.test.js`.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isFarmerRelevantScheme,
  stripHtml,
  FARMER_RELEVANT_KEYWORDS,
  runCatalogSync,
} from '../sync.js';
import { ManualSchemeCatalogProvider } from '../providers/manual.js';
import { ApiSetuSchemeCatalogProvider } from '../providers/apisetu.js';
import { NotImplementedUntilSpecProvided } from '../types.js';

test('isFarmerRelevantScheme: identifies keywords across all fields', () => {
  // Test each keyword in the constant
  for (const kw of FARMER_RELEVANT_KEYWORDS) {
    const item = { name: `National Scheme for ${kw} Development`, description: 'General welfare' };
    assert.equal(
      isFarmerRelevantScheme(item),
      true,
      `Expected "${kw}" to trigger farmer relevance`
    );
  }

  // Non-agricultural scheme should not be tagged
  const nonAgri = {
    name: 'National Highways Construction Scheme',
    category: 'Road Transport',
    description: 'Development of expressways and bypasses',
    tags: ['infrastructure', 'roads'],
  };
  assert.equal(isFarmerRelevantScheme(nonAgri), false);

  // Explicit flag true should remain true
  const explicit = { name: 'Generic Scheme', is_farmer_relevant: true };
  assert.equal(isFarmerRelevantScheme(explicit), true);
});

test('stripHtml: cleans tags and normalizes entities safely', () => {
  assert.equal(stripHtml('<p>Eligible <b>farmers</b> only.</p>'), 'Eligible farmers only.');
  assert.equal(stripHtml('Direct&nbsp;Benefit&nbsp;Transfer'), 'Direct Benefit Transfer');
  assert.equal(stripHtml('Amount &gt; 5000 &amp; land &lt; 10'), 'Amount > 5000 & land < 10');
  assert.equal(stripHtml(null), null);
  assert.equal(stripHtml(''), null);
});

test('ManualSchemeCatalogProvider: reports configured and yields empty async stream', async () => {
  const manual = new ManualSchemeCatalogProvider();
  assert.equal(manual.name, 'manual');
  assert.equal(manual.isConfigured(), true);

  const batches = [];
  for await (const batch of manual.fetchAll()) {
    batches.push(batch);
  }
  assert.equal(batches.length, 0);
});

test('ApiSetuSchemeCatalogProvider: checks configuration and throws typed error', async () => {
  const provider = new ApiSetuSchemeCatalogProvider();
  assert.equal(provider.name, 'apisetu');

  // Without environment variables set, isConfigured should be false
  const oldBase = process.env.APISETU_BASE_URL;
  const oldClient = process.env.APISETU_CLIENT_ID;
  const oldKey = process.env.APISETU_API_KEY;

  delete process.env.APISETU_BASE_URL;
  delete process.env.APISETU_CLIENT_ID;
  delete process.env.APISETU_API_KEY;

  assert.equal(provider.isConfigured(), false);

  // Calling fetchAll while unconfigured must throw
  await assert.rejects(
    async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of provider.fetchAll()) {}
    },
    { message: /not configured/ }
  );

  // Set mock env vars
  process.env.APISETU_BASE_URL = 'https://apisetu.gov.in';
  process.env.APISETU_CLIENT_ID = 'test-client';
  process.env.APISETU_API_KEY = 'test-key';

  assert.equal(provider.isConfigured(), true);

  // Calling fetchAll with credentials but no spec must throw NotImplementedUntilSpecProvided
  await assert.rejects(
    async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of provider.fetchAll()) {}
    },
    (err) => {
      assert(err instanceof NotImplementedUntilSpecProvided);
      assert.match(err.message, /Provide the myScheme OpenAPI spec/);
      return true;
    }
  );

  // Restore env
  if (oldBase) process.env.APISETU_BASE_URL = oldBase;
  else delete process.env.APISETU_BASE_URL;
  if (oldClient) process.env.APISETU_CLIENT_ID = oldClient;
  else delete process.env.APISETU_CLIENT_ID;
  if (oldKey) process.env.APISETU_API_KEY = oldKey;
  else delete process.env.APISETU_API_KEY;
});

test('runCatalogSync: handles unconfigured provider without crashing', async () => {
  const fakeUnconfiguredProvider = {
    name: 'unconfigured-mock',
    isConfigured: () => false,
    async *fetchAll() {},
  };

  const mockDb = {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'mock-run-id' } }) }) }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };

  const result = await runCatalogSync({ provider: fakeUnconfiguredProvider, db: mockDb });
  assert.equal(result.success, false);
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.match(result.error, /not configured/);
});

test('runCatalogSync: manual provider completes as SUCCESS with 0 counts', async () => {
  const manual = new ManualSchemeCatalogProvider();
  const mockDb = {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'mock-manual-run' } }) }) }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };

  const result = await runCatalogSync({ provider: manual, db: mockDb });
  assert.equal(result.success, true);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.fetched, 0);
  assert.match(result.message, /Managed manually/);
});

test('runCatalogSync: upsert preserves status, last_verified_at, and promoted_scheme_id on existing rows', async () => {
  const existingRow = {
    external_key: 'test-kisan',
    status: 'VERIFIED',
    last_verified_at: '2026-01-01T00:00:00Z',
    promoted_scheme_id: 'a0000000-0000-0000-0000-000000000001',
  };

  let updatedPayload = null;

  const mockDb = {
    from: (table) => {
      if (table === 'scheme_catalog_sync_runs') {
        return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'run-1' } }) }) }),
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        };
      }
      if (table === 'scheme_catalog') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [existingRow] }),
          }),
          update: (payload) => ({
            eq: (_col, _val) => {
              updatedPayload = payload;
              return Promise.resolve({ error: null });
            },
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
    },
  };

  const mockProvider = {
    name: 'test-feed',
    isConfigured: () => true,
    async *fetchAll() {
      yield [
        {
          external_key: 'test-kisan',
          name: 'Updated Kisan Name <b>Official</b>',
          description: 'Updated farmer description',
          status: 'UNVERIFIED', // Provider tries to suggest UNVERIFIED
        },
      ];
    },
  };

  const res = await runCatalogSync({ provider: mockProvider, db: mockDb });
  assert.equal(res.success, true);
  assert.equal(res.updated, 1);
  assert.equal(res.inserted, 0);

  // CRITICAL VERIFICATION:
  // Update payload MUST NOT contain status, last_verified_at, or promoted_scheme_id!
  assert.equal(updatedPayload.status, undefined, 'status must NOT be in update payload');
  assert.equal(updatedPayload.last_verified_at, undefined, 'last_verified_at must NOT be in update payload');
  assert.equal(updatedPayload.promoted_scheme_id, undefined, 'promoted_scheme_id must NOT be in update payload');
  // Check HTML stripping occurred
  assert.equal(updatedPayload.name, 'Updated Kisan Name Official');
  assert.equal(updatedPayload.is_farmer_relevant, true);
});
