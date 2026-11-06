// backend/src/lib/schemes/eligibility.js
// Pure rules engine — no I/O, no side effects.
// Input:  farmerRecord (plain JS object), ruleSet (JSONB from scheme_versions)
// Output: { eligible: boolean, results: [{rule, passed, reasonCode, message}] }
//
// Supported operators: ==, !=, >, >=, <, <=, in, not_in
// Supported combinators: "all" (AND), "any" (OR)
// Rejects unknown fields/operators safely — NO eval().

const ALLOWED_FARMER_FIELDS = new Set([
  'kyc_status',
  'total_land_area_acres',
  'bank_verified',
  'primary_crop',
  'state',
  'district',
  'village',
  'pincode',
  'phone',
  'aadhaar_hash',
  'aadhaar_last4',
]);

const FRIENDLY_FIELD_NAMES = {
  kyc_status:            'KYC verification status',
  total_land_area_acres: 'registered land area',
  bank_verified:         'bank account verification',
  primary_crop:          'registered crop type',
  state:                 'state',
  district:              'district',
};

function friendlyField(field) {
  return FRIENDLY_FIELD_NAMES[field] || field;
}

/**
 * Evaluate a single rule against a farmer record.
 * @param {object} rule - { field, op, value, label }
 * @param {object} farmer - flattened farmer data object
 * @returns {{ rule, passed, reasonCode, message }}
 */
function evaluateRule(rule, farmer) {
  const { field, op, value, label } = rule;

  // Safety: reject unknown fields to prevent injection via JSONB
  if (!ALLOWED_FARMER_FIELDS.has(field)) {
    return {
      rule,
      passed: false,
      reasonCode: 'UNKNOWN_FIELD',
      message: `Unknown eligibility field: "${field}". Contact scheme administrator.`,
    };
  }

  const farmerVal = farmer[field];

  let passed = false;
  let message = label || `${friendlyField(field)} check`;

  try {
    switch (op) {
      case '==':
        passed = farmerVal == value; // eslint-disable-line eqeqeq
        if (!passed) {
          message = buildMessage(field, op, value, farmerVal);
        }
        break;
      case '!=':
        passed = farmerVal != value; // eslint-disable-line eqeqeq
        if (!passed) {
          message = `${friendlyField(field)} must not be "${value}" (current: "${farmerVal}")`;
        }
        break;
      case '>':
        passed = Number(farmerVal) > Number(value);
        if (!passed) {
          message = `${friendlyField(field)} must be greater than ${value} (current: ${farmerVal ?? 'not set'})`;
        }
        break;
      case '>=':
        passed = Number(farmerVal) >= Number(value);
        if (!passed) {
          message = `${friendlyField(field)} must be at least ${value} (current: ${farmerVal ?? 'not set'})`;
        }
        break;
      case '<':
        passed = Number(farmerVal) < Number(value);
        if (!passed) {
          message = `${friendlyField(field)} must be less than ${value} (current: ${farmerVal ?? 'not set'})`;
        }
        break;
      case '<=':
        passed = Number(farmerVal) <= Number(value);
        if (!passed) {
          message = `${friendlyField(field)} must be at most ${value} (current: ${farmerVal ?? 'not set'})`;
        }
        break;
      case 'in':
        if (!Array.isArray(value)) {
          return { rule, passed: false, reasonCode: 'INVALID_RULE', message: 'Rule "in" requires an array value.' };
        }
        passed = value.includes(farmerVal);
        if (!passed) {
          message = `${friendlyField(field)} must be one of [${value.join(', ')}] (current: "${farmerVal ?? 'not set'}")`;
        }
        break;
      case 'not_in':
        if (!Array.isArray(value)) {
          return { rule, passed: false, reasonCode: 'INVALID_RULE', message: 'Rule "not_in" requires an array value.' };
        }
        passed = !value.includes(farmerVal);
        if (!passed) {
          message = `${friendlyField(field)} must not be one of [${value.join(', ')}] (current: "${farmerVal}")`;
        }
        break;
      default:
        return {
          rule,
          passed: false,
          reasonCode: 'UNKNOWN_OPERATOR',
          message: `Unknown operator: "${op}". Contact scheme administrator.`,
        };
    }
  } catch {
    return {
      rule,
      passed: false,
      reasonCode: 'EVALUATION_ERROR',
      message: `Could not evaluate rule for field "${field}".`,
    };
  }

  return {
    rule,
    passed,
    reasonCode: passed ? 'PASS' : ruleReasonCode(field, op, value, farmerVal),
    message: passed ? (label || message) : message,
  };
}

function buildMessage(field, op, value, actual) {
  if (field === 'kyc_status' && !actual) return 'KYC verification is not completed. Please complete DigiLocker eKYC.';
  if (field === 'kyc_status') return `KYC status must be "${value}" (current: "${actual}"). Complete DigiLocker eKYC.`;
  if (field === 'bank_verified') return `Bank account must be verified (current: ${actual ? 'verified' : 'not verified'}).`;
  return `${friendlyField(field)} must equal "${value}" (current: "${actual ?? 'not set'}").`;
}

function ruleReasonCode(field, op, value) {
  if (field === 'kyc_status')            return 'KYC_NOT_VERIFIED';
  if (field === 'bank_verified')         return 'BANK_NOT_VERIFIED';
  if (field === 'total_land_area_acres') return 'NO_LAND_AREA';
  if (field === 'primary_crop')          return 'CROP_NOT_COVERED';
  return 'RULE_FAILED';
}

/**
 * Run the full rule set against a farmer record.
 * @param {object} farmerRecord - farmer data object (must include primary_crop derived field)
 * @param {object} ruleSet - { "all": [...] } or { "any": [...] }
 * @returns {{ eligible: boolean, results: array }}
 */
export function evaluateEligibility(farmerRecord, ruleSet) {
  if (!ruleSet || typeof ruleSet !== 'object') {
    return { eligible: false, results: [{ rule: {}, passed: false, reasonCode: 'INVALID_RULESET', message: 'Invalid rule set configuration.' }] };
  }

  const combinator = ruleSet.all ? 'all' : ruleSet.any ? 'any' : null;
  if (!combinator) {
    return { eligible: false, results: [{ rule: {}, passed: false, reasonCode: 'MISSING_COMBINATOR', message: 'Rule set must have "all" or "any" combinator.' }] };
  }

  const rules = ruleSet[combinator];
  if (!Array.isArray(rules) || rules.length === 0) {
    return { eligible: true, results: [] }; // empty rules = everyone eligible
  }

  const results = rules.map(rule => evaluateRule(rule, farmerRecord));

  const eligible = combinator === 'all'
    ? results.every(r => r.passed)
    : results.some(r => r.passed);

  return { eligible, results };
}

/**
 * Build a "farmer snapshot" object from a raw DB farmer row + crops.
 * This normalises the data into the flat shape the rule engine expects.
 * primary_crop is the most recently registered active crop type (or null).
 */
export function buildFarmerSnapshot(farmerRow, crops = []) {
  // Derive bank_verified from presence of account number + IFSC
  const bank_verified = Boolean(
    farmerRow.bank_account_number && farmerRow.bank_ifsc_code
  );

  // primary_crop: most recently registered crop, normalised to lowercase
  const activeCrop = crops.length > 0 ? crops[0] : null;
  const primary_crop = activeCrop?.crop_type?.toLowerCase() || null;

  return {
    id:                    farmerRow.id,
    kyc_status:            farmerRow.kyc_status || 'pending',
    total_land_area_acres: Number(farmerRow.total_land_area_acres) || 0,
    bank_verified,
    primary_crop,
    state:                 farmerRow.state,
    district:              farmerRow.district,
    village:               farmerRow.village,
    phone:                 farmerRow.phone || null,
    aadhaar_hash:          farmerRow.aadhaar_hash || null,
    aadhaar_last4:         farmerRow.aadhaar_last4 || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIT TESTS (run with: node --test backend/src/lib/schemes/eligibility.js)
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('evaluateEligibility: verified farmer with land passes NMEO-OP', () => {
  const farmer = { kyc_status: 'verified', total_land_area_acres: 5, primary_crop: 'mustard', bank_verified: true };
  const rules = { all: [
    { field: 'kyc_status', op: '==', value: 'verified' },
    { field: 'total_land_area_acres', op: '>', value: 0 },
    { field: 'primary_crop', op: 'in', value: ['mustard', 'soybean', 'groundnut', 'sunflower', 'sesame', 'safflower'] },
  ]};
  const { eligible } = evaluateEligibility(farmer, rules);
  assert.equal(eligible, true);
});

test('evaluateEligibility: pending KYC fails all schemes', () => {
  const farmer = { kyc_status: 'pending', total_land_area_acres: 5, primary_crop: 'mustard', bank_verified: false };
  const rules = { all: [{ field: 'kyc_status', op: '==', value: 'verified' }] };
  const { eligible, results } = evaluateEligibility(farmer, rules);
  assert.equal(eligible, false);
  assert.equal(results[0].reasonCode, 'KYC_NOT_VERIFIED');
});

test('evaluateEligibility: zero land fails NFSM-OIL', () => {
  const farmer = { kyc_status: 'verified', total_land_area_acres: 0, primary_crop: 'mustard', bank_verified: true };
  const rules = { all: [
    { field: 'kyc_status', op: '==', value: 'verified' },
    { field: 'total_land_area_acres', op: '>', value: 0 },
    { field: 'bank_verified', op: '==', value: true },
  ]};
  const { eligible, results } = evaluateEligibility(farmer, rules);
  assert.equal(eligible, false);
  assert.equal(results[1].reasonCode, 'NO_LAND_AREA');
});

test('evaluateEligibility: non-covered crop fails PM-AASHA', () => {
  const farmer = { kyc_status: 'verified', total_land_area_acres: 3, primary_crop: 'sesame', bank_verified: true };
  const rules = { all: [
    { field: 'kyc_status', op: '==', value: 'verified' },
    { field: 'primary_crop', op: 'in', value: ['mustard', 'soybean', 'groundnut'] },
    { field: 'bank_verified', op: '==', value: true },
  ]};
  const { eligible, results } = evaluateEligibility(farmer, rules);
  assert.equal(eligible, false);
  assert.equal(results[1].reasonCode, 'CROP_NOT_COVERED');
});

test('evaluateEligibility: unknown operator returns safe error', () => {
  const farmer = { kyc_status: 'verified' };
  const rules = { all: [{ field: 'kyc_status', op: 'EVAL(process.exit)', value: 'x' }] };
  const { eligible, results } = evaluateEligibility(farmer, rules);
  assert.equal(eligible, false);
  assert.equal(results[0].reasonCode, 'UNKNOWN_OPERATOR');
});

test('evaluateEligibility: "any" combinator — passes if at least one rule passes', () => {
  const farmer = { kyc_status: 'verified', primary_crop: 'sesame', bank_verified: false };
  const rules = { any: [
    { field: 'kyc_status', op: '==', value: 'verified' },
    { field: 'bank_verified', op: '==', value: true },
  ]};
  const { eligible } = evaluateEligibility(farmer, rules);
  assert.equal(eligible, true);
});

test('buildFarmerSnapshot: derives bank_verified and primary_crop correctly', () => {
  const row = { id: 'f1', kyc_status: 'verified', total_land_area_acres: '10', bank_account_number: '12345', bank_ifsc_code: 'SBIN0001', state: 'MP', district: 'Indore', village: 'Test' };
  const crops = [{ crop_type: 'Mustard' }];
  const snap = buildFarmerSnapshot(row, crops);
  assert.equal(snap.bank_verified, true);
  assert.equal(snap.primary_crop, 'mustard');
  assert.equal(snap.total_land_area_acres, 10);
});
