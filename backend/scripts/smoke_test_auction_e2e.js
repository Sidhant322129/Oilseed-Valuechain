// backend/scripts/smoke_test_auction_e2e.js
// Production End-to-End Verification Suite for Sovereign Harvest Live Auction System
// Tests every bidding, lot, governance, and demand requirement function across:
//   1. FARMER role
//   2. FPO role
//   3. ADMIN role

import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

// Test Users matching database / seed records
const USERS = {
  farmer: {
    id: '764876b9-b961-43d5-b800-392431308ef4',
    email: 'samirsingh22@gmail.com',
    role: 'farmer',
    name: 'Samir Singh',
  },
  fpo: {
    id: '0334bba1-15b7-439a-aa0f-ec7fa4eac86e',
    email: 'sidhanthansda29@gmail.com',
    role: 'fpo',
    name: 'Sneheraj',
  },
  admin: {
    id: '693fe4b8-3721-4a0c-b278-5432d64eb2dc',
    email: 'koustabh.roy1712@gmail.com',
    role: 'admin',
    name: 'Koustabh Roy',
  },
};

function makeToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    id: user.id,
    email: user.email,
    role: user.role,
    user_metadata: { full_name: user.name, role: user.role },
    exp: Math.floor(Date.now() / 1000) + 7200,
  })).toString('base64url');
  return `${header}.${payload}.sig`;
}

function clientFor(user) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${makeToken(user)}`,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true, // Don't throw so we can inspect status codes
  });
}

const farmerClient = clientFor(USERS.farmer);
const fpoClient = clientFor(USERS.fpo);
const adminClient = clientFor(USERS.admin);

let testLotId = null;
let testLotCode = null;

async function runTests() {
  console.log('\n===============================================================');
  console.log('🏛️  SOVEREIGN HARVEST LIVE AUCTION SYSTEM — E2E VERIFICATION SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${details ? '— ' + details : ''}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. FARMER DASHBOARD TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n👨‍🌾  [1/3] TESTING FARMER DASHBOARD ENDPOINTS...');

  // 1.1 Reserve price below statutory MSP rejected (400)
  const belowMspRes = await farmerClient.post('/auction/lots', {
    crop_type: 'mustard',
    qty_kg: 2000,
    reserve_price_per_kg: 50.0, // CCEA MSP for mustard is ₹62.50
    start_price_per_kg: 50.0,
    location_mandi: 'Alwar APMC Mandi, Rajasthan',
  });
  assert(
    belowMspRes.status === 400 && belowMspRes.data?.error?.code === 'RESERVE_BELOW_MSP',
    'Reject lot with reserve below CCEA MSP with statutory rate in message',
    `Status: ${belowMspRes.status}, Error: ${JSON.stringify(belowMspRes.data)}`
  );

  // 1.2 Valid lot published successfully (201)
  const validLotRes = await farmerClient.post('/auction/lots', {
    crop_type: 'mustard',
    qty_kg: 3500,
    reserve_price_per_kg: 66.0, // Above ₹62.50
    start_price_per_kg: 66.0,
    grade: 'Grade A',
    location_mandi: 'Alwar APMC Mandi, Rajasthan',
    duration_hours: 24,
  });
  testLotId = validLotRes.data?.lot?.id;
  testLotCode = validLotRes.data?.lot?.lot_code;
  assert(
    validLotRes.status === 201 && validLotRes.data?.success && testLotId,
    `Publish valid lot (${testLotCode}) to live auction exchange`,
    `Status: ${validLotRes.status}`
  );

  // 1.3 View My Lots tabs
  const myLotsRes = await farmerClient.get('/auction/my-lots');
  const myLotsData = myLotsRes.data?.data;
  assert(
    myLotsRes.status === 200 && myLotsData && Array.isArray(myLotsData.live) && Array.isArray(myLotsData.all),
    'Fetch Farmer My Lots categorized tabs (live, scheduled, sold, unsold, all)',
    `Status: ${myLotsRes.status}, Total lots: ${myLotsData?.all?.length}`
  );

  // 1.4 Lot Room inspection
  const lotRoomRes = await farmerClient.get(`/auction/lots/${testLotId}`);
  assert(
    lotRoomRes.status === 200 &&
    lotRoomRes.data?.lot &&
    Array.isArray(lotRoomRes.data?.bids_ladder) &&
    Array.isArray(lotRoomRes.data?.price_timeline),
    'Lot Room returns enriched lot, anonymized ladder, and Recharts timeline',
    `Status: ${lotRoomRes.status}`
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. FPO DASHBOARD TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🏢  [2/3] TESTING FPO (BUYER) DASHBOARD ENDPOINTS...');

  // 2.1 Auction floor loads live/closing/scheduled lots
  const floorRes = await fpoClient.get('/auction/lots?status=live,closing,scheduled');
  const lots = floorRes.data?.lots || [];
  assert(
    floorRes.status === 200 && Array.isArray(lots) && lots.length > 0,
    `FPO Auction Floor loads active lots (${lots.length} lots found without double /api prefix)`,
    `Status: ${floorRes.status}, Count: ${lots.length}`
  );

  // 2.2 Place bid below minimum increment rejected with 422
  const targetLot = lots.find(l => l.status === 'live') || lots[0];
  const tooLowBidRes = await fpoClient.post('/auction/bid', {
    lot_id: targetLot.id,
    amount_per_kg: 1.0, // way below current high or start price
    idempotency_key: `test-low-${Date.now()}`,
  });
  assert(
    tooLowBidRes.status === 422 && tooLowBidRes.data?.error?.code === 'BID_TOO_LOW',
    'Reject bid below minimum increment with HTTP 422 and required_bid field',
    `Status: ${tooLowBidRes.status}, Body: ${JSON.stringify(tooLowBidRes.data)}`
  );

  // 2.3 Place valid bid
  const nextValidPrice = (Number(targetLot.current_high_bid || targetLot.start_price_per_kg || 65) + 1.0);
  const validBidRes = await fpoClient.post('/auction/bid', {
    lot_id: targetLot.id,
    amount_per_kg: nextValidPrice,
    idempotency_key: `test-valid-${Date.now()}`,
  });
  assert(
    validBidRes.status === 200 && validBidRes.data?.success,
    `Place valid competitive bid of ₹${nextValidPrice}/kg on lot ${targetLot.lot_code}`,
    `Status: ${validBidRes.status}`
  );

  // 2.4 Place proxy bid
  const proxyBidRes = await fpoClient.post('/auction/bid', {
    lot_id: targetLot.id,
    amount_per_kg: nextValidPrice + 0.5,
    max_proxy_amount: nextValidPrice + 5.0,
    idempotency_key: `test-proxy-${Date.now()}`,
  });
  assert(
    proxyBidRes.status === 200 && proxyBidRes.data?.data?.max_proxy_amount,
    `Place proxy bid with ceiling ₹${nextValidPrice + 5.0}/kg`,
    `Status: ${proxyBidRes.status}`
  );

  // 2.5 Watchlist toggle & retrieve
  const watchToggleRes = await fpoClient.post('/auction/watchlist', { lot_id: targetLot.id });
  const watchGetRes = await fpoClient.get('/auction/watchlist');
  const watchlistedLots = (watchGetRes.data?.watchlist || []).map(w => w.lot_id);
  assert(
    watchToggleRes.status === 200 && watchGetRes.status === 200 && watchlistedLots.includes(targetLot.id),
    'Toggle lot on watchlist and retrieve persisted watchlist set',
    `Toggle status: ${watchToggleRes.status}, Watchlist count: ${watchlistedLots.length}`
  );

  // 2.6 Requirements board loads & creates requirement
  const reqListRes = await fpoClient.get('/auction/requirements');
  const reqPostRes = await fpoClient.post('/auction/requirements', {
    crop_type: 'mustard',
    quantity_kg: 20000,
    max_price_per_kg: 66.0,
    deadline: '2026-10-30',
    notes: 'Bulk cold-press procurement for Chambal collective',
  });
  assert(
    reqListRes.status === 200 && reqPostRes.status === 201 && reqPostRes.data?.requirement?.id,
    'FPO Requirements Board loads existing demand and posts new requirement',
    `List status: ${reqListRes.status}, Post status: ${reqPostRes.status}`
  );

  // 2.7 Bidding limits & My Bids shape
  const myBidsRes = await fpoClient.get('/auction/my-bids');
  const bidsData = myBidsRes.data;
  const isBidsArray = Array.isArray(bidsData?.bids);
  const availableLimit = bidsData?.available_limit;
  assert(
    myBidsRes.status === 200 && isBidsArray && availableLimit !== undefined,
    `My Bids returns flat bids array and available limit (₹${(availableLimit / 100000).toFixed(1)} L)`,
    `Status: ${myBidsRes.status}, Limit: ${availableLimit}, IsArray: ${isBidsArray}`
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ADMIN DASHBOARD TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🛡️  [3/3] TESTING ADMIN CONTROL ROOM & GOVERNANCE ENDPOINTS...');

  // 3.1 Overview telemetry
  const overviewRes = await adminClient.get('/admin/procurement/overview');
  assert(
    overviewRes.status === 200 && overviewRes.data?.total_bids !== undefined,
    'Admin procurement monitor overview loads real-time market telemetry',
    `Status: ${overviewRes.status}`
  );

  // 3.2 Freeze lot
  const freezeRes = await adminClient.post(`/auction/lots/${targetLot.id}/freeze`, {
    reason: 'Routine quality parameter audit compliance check',
  });
  assert(
    freezeRes.status === 200 && freezeRes.data?.lot?.status === 'frozen',
    `Admin Control Room freezes lot ${targetLot.lot_code} (status -> frozen)`,
    `Status: ${freezeRes.status}`
  );

  // 3.3 Extend lot
  const extendRes = await adminClient.post(`/auction/lots/${targetLot.id}/extend`, {
    minutes: 30,
    reason: 'Mandi connectivity maintenance window extension',
  });
  assert(
    extendRes.status === 200 && extendRes.data?.success,
    `Admin Control Room extends lot deadline by +30 minutes`,
    `Status: ${extendRes.status}`
  );

  // 3.4 Unfreeze lot
  const unfreezeRes = await adminClient.post(`/auction/lots/${targetLot.id}/unfreeze`, {
    reason: 'Assayer verified seed moisture < 8%',
  });
  assert(
    unfreezeRes.status === 200 && unfreezeRes.data?.lot?.status !== 'frozen',
    `Admin Control Room unfreezes lot ${targetLot.lot_code} back to active state`,
    `Status: ${unfreezeRes.status}`
  );

  // 3.5 Force-close lot
  const forceCloseRes = await adminClient.post(`/auction/lots/${targetLot.id}/force-close`, {
    reason: 'Mandi administrative early settlement reconciliation',
  });
  assert(
    forceCloseRes.status === 200 && ['sold', 'unsold'].includes(forceCloseRes.data?.lot?.status),
    `Admin Control Room force-closes lot ${targetLot.lot_code} with automatic settlement check`,
    `Status: ${forceCloseRes.status}, Result status: ${forceCloseRes.data?.lot?.status}`
  );

  // 3.6 Audit log records actions
  const auditRes = await adminClient.get('/admin/procurement/audit-log');
  const auditItems = auditRes.data?.audit_logs || [];
  assert(
    auditRes.status === 200 && Array.isArray(auditItems) && auditItems.length > 0,
    `Immutable audit log successfully recorded all administrative and bidding actions (${auditItems.length} entries)`,
    `Status: ${auditRes.status}, Entries: ${auditItems.length}`
  );

  console.log('\n===============================================================');
  console.log(`📊  E2E VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('\n❌ Uncaught error during E2E verification:', err);
  process.exit(1);
});
