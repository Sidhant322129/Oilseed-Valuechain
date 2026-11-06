// backend/src/lib/schemes/benefit.js
// Server-side benefit calculator.
// Input:  formula (JSONB from scheme_versions), farmerSnapshot
// Output: { amount: number, breakdown: string }
//
// Supported formula types:
//   PER_HECTARE:   amount = land_ha * rate  (acres converted to ha)
//   FIXED:         amount = rate (flat)
//   MSP_QUANTITY:  amount = 0 (non-monetary / quantity-based — tracked separately)

import { test } from 'node:test';
import assert from 'node:assert/strict';

const ACRE_TO_HA = 0.4047; // 1 acre = 0.4047 hectares (standard conversion)

/**
 * Compute benefit amount from formula + farmer snapshot.
 * Amount is always rounded to nearest rupee.
 *
 * @param {object} formula - { type, rate, acre_to_ha?, description? }
 * @param {object} farmerSnapshot - from eligibility.buildFarmerSnapshot()
 * @returns {{ amount: number, breakdown: string }}
 */
export function computeBenefit(formula, farmerSnapshot) {
  if (!formula || !formula.type) {
    return { amount: 0, breakdown: 'No benefit formula configured.' };
  }

  const acres = Number(farmerSnapshot.total_land_area_acres) || 0;

  switch (formula.type) {
    case 'PER_HECTARE': {
      const conversionFactor = Number(formula.acre_to_ha) || ACRE_TO_HA;
      const hectares = acres * conversionFactor;
      const rate = Number(formula.rate) || 0;
      const amount = Math.round(hectares * rate);
      return {
        amount,
        breakdown: `${acres.toFixed(2)} acres × ${conversionFactor} (ac→ha) = ${hectares.toFixed(4)} ha × ₹${rate}/ha = ₹${amount.toLocaleString('en-IN')}`,
      };
    }

    case 'FIXED': {
      const amount = Math.round(Number(formula.rate) || 0);
      return {
        amount,
        breakdown: `Fixed grant: ₹${amount.toLocaleString('en-IN')}`,
      };
    }

    case 'MSP_QUANTITY': {
      // MSP benefit is quantity-based and settled at time of procurement.
      // No numeric amount is pre-computed — return 0 with a clear label.
      return {
        amount: 0,
        breakdown: 'MSP benefit settled at procurement — amount depends on actual quantity sold.',
      };
    }

    default:
      return { amount: 0, breakdown: `Unknown formula type: "${formula.type}".` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIT TESTS
// ─────────────────────────────────────────────────────────────────────────────
test('computeBenefit: PER_HECTARE 10 acres at ₹4000/ha', () => {
  const formula = { type: 'PER_HECTARE', rate: 4000, acre_to_ha: 0.4047 };
  const snap    = { total_land_area_acres: 10 };
  const { amount } = computeBenefit(formula, snap);
  // 10 * 0.4047 * 4000 = 16188
  assert.equal(amount, 16188);
});

test('computeBenefit: PER_HECTARE 2.5 acres at ₹4000/ha', () => {
  const formula = { type: 'PER_HECTARE', rate: 4000, acre_to_ha: 0.4047 };
  const snap    = { total_land_area_acres: 2.5 };
  const { amount } = computeBenefit(formula, snap);
  // 2.5 * 0.4047 * 4000 = 4047
  assert.equal(amount, 4047);
});

test('computeBenefit: FIXED rate returns exact amount', () => {
  const formula = { type: 'FIXED', rate: 5000 };
  const { amount } = computeBenefit(formula, {});
  assert.equal(amount, 5000);
});

test('computeBenefit: MSP_QUANTITY returns 0', () => {
  const formula = { type: 'MSP_QUANTITY', rate: 0 };
  const { amount } = computeBenefit(formula, { total_land_area_acres: 100 });
  assert.equal(amount, 0);
});

test('computeBenefit: unknown type returns 0 safely', () => {
  const formula = { type: 'INVALID_TYPE', rate: 99999 };
  const { amount } = computeBenefit(formula, { total_land_area_acres: 10 });
  assert.equal(amount, 0);
});

test('computeBenefit: uses default acre_to_ha if not specified', () => {
  const formula = { type: 'PER_HECTARE', rate: 4000 }; // no acre_to_ha
  const snap    = { total_land_area_acres: 1 };
  const { amount } = computeBenefit(formula, snap);
  // 1 * 0.4047 * 4000 = 1618.8 → round = 1619
  assert.equal(amount, 1619);
});

test('computeBenefit: rounds to nearest rupee (no fractional paise)', () => {
  const formula = { type: 'PER_HECTARE', rate: 1000, acre_to_ha: 0.4047 };
  const snap    = { total_land_area_acres: 1 };
  const { amount } = computeBenefit(formula, snap);
  assert.equal(typeof amount, 'number');
  assert.equal(amount, Math.round(amount)); // integer
});
