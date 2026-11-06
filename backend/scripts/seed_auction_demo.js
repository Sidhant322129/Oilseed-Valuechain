// backend/scripts/seed_auction_demo.js
// Idempotent seed script for Live Auction System (Phase 3)
// Generates:
//   - 3 farmers, 3 FPO/processor orgs with bidding limits (including Sneheraj ₹5.0 L), 1 admin
//   - MSP benchmarks for Soybean & Mustard
//   - 8 lots covering every state:
//       1. draft
//       2. scheduled (starts in 10 min)
//       3. live (with several bids and a proxy bid)
//       4. closing (under 5 min left)
//       5. sold (with settlement)
//       6. unsold
//       7. cancelled
//       8. frozen (admin frozen)
//   - 2 open FPO procurement requirements

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminClient } from '../src/config/supabaseClient.js';
import { OFFICIAL_CCEA_MSP_2026_27 } from '../src/services/msp.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '../data/auction_data.json');

// Known Seed User IDs
const USERS = {
  farmer1: { id: '764876b9-b961-43d5-b800-392431308ef4', name: 'Samir Singh', role: 'farmer' },
  farmer2: { id: '3ba38dfb-8c35-490a-abf8-0792781611dd', name: 'Sahil Pal', role: 'farmer' },
  farmer3: { id: '00910982-3349-4904-93d6-b2286ac7d40f', name: 'Ramesh Patel', role: 'farmer' },
  fpo_sneheraj: { id: '0334bba1-15b7-439a-aa0f-ec7fa4eac86e', name: 'Sneheraj', org: 'NMEO-OP Chambal Collective', role: 'fpo', limit: 500000, blocked: 0 },
  processor_samir: { id: '2c2ba7ad-3a63-40e2-bd86-00f629f21a14', name: 'Samir', org: 'Aditya Agro Processors', role: 'processor', limit: 2500000, blocked: 370000 },
  processor_subham: { id: 'bc6a9209-6ea5-4a65-8850-123376502477', name: 'Subham Das', org: 'Bengal Oil Mills', role: 'processor', limit: 1500000, blocked: 0 },
  admin: { id: '693fe4b8-3721-4a0c-b278-5432d64eb2dc', name: 'Koustabh Roy', role: 'admin' },
};

export async function seedAuctionDemo() {
  console.log('\n🌾 [SEED-AUCTION] Initializing idempotent demo data seed...');
  const now = new Date();

  // 1. Time milestones
  const scheduledStart = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // +10 min
  const scheduledEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // +24 hours

  const liveStart = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // started 2h ago
  const liveEnd = new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString(); // ends in 18h

  const closingStart = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(); // started 3h ago
  const closingEnd = new Date(now.getTime() + 4 * 60 * 1000).toISOString(); // ends in 4 min (< 5 min left)

  const soldStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const soldEnd = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const unsoldStart = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const unsoldEnd = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();

  // 2. The 8 Lots Covering Every State
  const seedLots = [
    // 1. Draft Lot
    {
      id: '33333333-3333-4000-8000-000000000001',
      lot_code: 'LOT-MUST-DRAFT',
      farmer_id: USERS.farmer1.id,
      farmer_name: USERS.farmer1.name,
      crop_type: 'mustard',
      qty_kg: 3000,
      grade: 'Grade A',
      location_mandi: 'Alwar APMC Mandi, Rajasthan',
      reserve_price_per_kg: 64.0,
      start_price_per_kg: 62.5,
      bid_increment_per_kg: 0.5,
      starts_at: scheduledStart,
      ends_at: scheduledEnd,
      original_ends_at: scheduledEnd,
      extensions_count: 0,
      status: 'draft',
      current_high_bid: null,
      current_high_bidder_id: null,
      current_high_bidder_org: null,
      bid_count: 0,
      notes: 'Initial lot draft saved by farmer, pending publication to live mandi board.',
      created_at: new Date(now.getTime() - 3600000).toISOString(),
      updated_at: now.toISOString(),
    },

    // 2. Scheduled Lot (starts in 10 min)
    {
      id: '33333333-3333-4000-8000-000000000002',
      lot_code: 'LOT-SOY-SCHED',
      farmer_id: USERS.farmer2.id,
      farmer_name: USERS.farmer2.name,
      crop_type: 'soybean',
      qty_kg: 6000,
      grade: 'Standard',
      location_mandi: 'Dewas APMC Mandi, Madhya Pradesh',
      reserve_price_per_kg: 53.0,
      start_price_per_kg: 51.8,
      bid_increment_per_kg: 0.5,
      starts_at: scheduledStart,
      ends_at: scheduledEnd,
      original_ends_at: scheduledEnd,
      extensions_count: 0,
      status: 'scheduled',
      current_high_bid: null,
      current_high_bidder_id: null,
      current_high_bidder_org: null,
      bid_count: 0,
      notes: 'Scheduled morning auction session. Clean yellow soybean ready at warehouse gate.',
      created_at: new Date(now.getTime() - 1800000).toISOString(),
      updated_at: now.toISOString(),
    },

    // 3. Live Lot (with several bids and proxy bid)
    {
      id: '33333333-3333-4000-8000-000000000003',
      lot_code: 'LOT-MUST-LIVE',
      farmer_id: USERS.farmer1.id,
      farmer_name: USERS.farmer1.name,
      crop_type: 'mustard',
      qty_kg: 5000,
      grade: 'Grade A',
      location_mandi: 'Bharatpur Mandi Yard, Rajasthan',
      reserve_price_per_kg: 64.0,
      start_price_per_kg: 62.5,
      bid_increment_per_kg: 0.5,
      starts_at: liveStart,
      ends_at: liveEnd,
      original_ends_at: liveEnd,
      extensions_count: 0,
      status: 'live',
      current_high_bid: 74.0,
      current_high_bidder_id: USERS.fpo_sneheraj.id,
      current_high_bidder_org: USERS.fpo_sneheraj.org,
      bid_count: 5,
      notes: 'Active competitive bidding floor. Premium bold seed, 42.1% oil extraction.',
      created_at: liveStart,
      updated_at: now.toISOString(),
    },

    // 4. Closing Lot (under 5 min left)
    {
      id: '33333333-3333-4000-8000-000000000004',
      lot_code: 'LOT-SOY-CLOSING',
      farmer_id: USERS.farmer2.id,
      farmer_name: USERS.farmer2.name,
      crop_type: 'soybean',
      qty_kg: 8000,
      grade: 'Premium',
      location_mandi: 'Indore APMC Mandi, Madhya Pradesh',
      reserve_price_per_kg: 53.5,
      start_price_per_kg: 52.0,
      bid_increment_per_kg: 0.5,
      starts_at: closingStart,
      ends_at: closingEnd,
      original_ends_at: closingEnd,
      extensions_count: 1,
      status: 'closing',
      current_high_bid: 56.5,
      current_high_bidder_id: USERS.processor_samir.id,
      current_high_bidder_org: USERS.processor_samir.org,
      bid_count: 7,
      notes: 'Soft-close in progress. Final anti-sniping window under 5 minutes remaining.',
      created_at: closingStart,
      updated_at: now.toISOString(),
    },

    // 5. Sold Lot (with settlement)
    {
      id: '33333333-3333-4000-8000-000000000005',
      lot_code: 'LOT-GROUND-SOLD',
      farmer_id: USERS.farmer3.id,
      farmer_name: USERS.farmer3.name,
      crop_type: 'groundnut',
      qty_kg: 4000,
      grade: 'Grade A',
      location_mandi: 'Rajkot APMC Mandi, Gujarat',
      reserve_price_per_kg: 73.5,
      start_price_per_kg: 71.5,
      bid_increment_per_kg: 0.5,
      starts_at: soldStart,
      ends_at: soldEnd,
      original_ends_at: soldEnd,
      extensions_count: 0,
      status: 'sold',
      current_high_bid: 78.0,
      current_high_bidder_id: USERS.processor_samir.id,
      current_high_bidder_org: USERS.processor_samir.org,
      winner_bid_id: '44444444-4444-4000-8000-000000000005',
      bid_count: 8,
      notes: 'Successfully concluded. Settlement order generated and awaiting payment dispatch.',
      created_at: soldStart,
      updated_at: soldEnd,
    },

    // 6. Unsold Lot
    {
      id: '33333333-3333-4000-8000-000000000006',
      lot_code: 'LOT-SESAME-UNSOLD',
      farmer_id: USERS.farmer1.id,
      farmer_name: USERS.farmer1.name,
      crop_type: 'sesame',
      qty_kg: 2000,
      grade: 'Standard',
      location_mandi: 'Jodhpur APMC Mandi, Rajasthan',
      reserve_price_per_kg: 98.0,
      start_price_per_kg: 92.0,
      bid_increment_per_kg: 1.0,
      starts_at: unsoldStart,
      ends_at: unsoldEnd,
      original_ends_at: unsoldEnd,
      extensions_count: 0,
      status: 'unsold',
      current_high_bid: 94.0,
      current_high_bidder_id: null,
      current_high_bidder_org: null,
      bid_count: 2,
      notes: 'Expired without reaching farmer statutory reserve floor (₹98/kg). Eligible for relisting.',
      created_at: unsoldStart,
      updated_at: unsoldEnd,
    },

    // 7. Cancelled Lot
    {
      id: '33333333-3333-4000-8000-000000000007',
      lot_code: 'LOT-SUNFL-CANCEL',
      farmer_id: USERS.farmer2.id,
      farmer_name: USERS.farmer2.name,
      crop_type: 'sunflower',
      qty_kg: 3500,
      grade: 'Standard',
      location_mandi: 'Latur APMC Yard, Maharashtra',
      reserve_price_per_kg: 77.0,
      start_price_per_kg: 76.0,
      bid_increment_per_kg: 0.5,
      starts_at: scheduledStart,
      ends_at: scheduledEnd,
      original_ends_at: scheduledEnd,
      extensions_count: 0,
      status: 'cancelled',
      current_high_bid: null,
      current_high_bidder_id: null,
      current_high_bidder_org: null,
      bid_count: 0,
      notes: 'Cancelled by farmer prior to auction start due to private warehouse storage agreement.',
      created_at: new Date(now.getTime() - 7200000).toISOString(),
      updated_at: now.toISOString(),
    },

    // 8. Frozen Lot (Admin control room)
    {
      id: '33333333-3333-4000-8000-000000000008',
      lot_code: 'LOT-MUST-FROZEN',
      farmer_id: USERS.farmer3.id,
      farmer_name: USERS.farmer3.name,
      crop_type: 'mustard',
      qty_kg: 7000,
      grade: 'Standard',
      location_mandi: 'Kota APMC Mandi, Rajasthan',
      reserve_price_per_kg: 63.5,
      start_price_per_kg: 62.5,
      bid_increment_per_kg: 0.5,
      starts_at: liveStart,
      ends_at: liveEnd,
      original_ends_at: liveEnd,
      extensions_count: 0,
      status: 'frozen',
      current_high_bid: 68.0,
      current_high_bidder_id: USERS.processor_subham.id,
      current_high_bidder_org: USERS.processor_subham.org,
      bid_count: 3,
      freeze_reason: 'Quality certificate audit pending verification by Mandi Assayer.',
      notes: 'Temporarily frozen under Mandi Rule 14-B for batch moisture re-verification.',
      created_at: liveStart,
      updated_at: now.toISOString(),
    },
  ];

  // 3. Seed Bids (including proxy bid on LOT-MUST-LIVE)
  const seedBids = [
    {
      id: '44444444-4444-4000-8000-000000000001',
      lot_id: '33333333-3333-4000-8000-000000000003',
      bidder_user_id: USERS.processor_samir.id,
      bidder_org_id: USERS.processor_samir.org,
      amount_per_kg: 68.0,
      status: 'outbid',
      server_ts: new Date(now.getTime() - 70 * 60 * 1000).toISOString(),
      idempotency_key: 'seed-bid-01',
    },
    {
      id: '44444444-4444-4000-8000-000000000002',
      lot_id: '33333333-3333-4000-8000-000000000003',
      bidder_user_id: USERS.processor_subham.id,
      bidder_org_id: USERS.processor_subham.org,
      amount_per_kg: 70.5,
      status: 'outbid',
      server_ts: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      idempotency_key: 'seed-bid-02',
    },
    {
      id: '44444444-4444-4000-8000-000000000003',
      lot_id: '33333333-3333-4000-8000-000000000003',
      bidder_user_id: USERS.fpo_sneheraj.id,
      bidder_org_id: USERS.fpo_sneheraj.org,
      amount_per_kg: 74.0,
      max_proxy_amount: 78.0, // Active Proxy bid up to ₹78/kg!
      is_auto: true,
      status: 'winning',
      server_ts: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      idempotency_key: 'seed-bid-03',
    },
    {
      id: '44444444-4444-4000-8000-000000000004',
      lot_id: '33333333-3333-4000-8000-000000000004',
      bidder_user_id: USERS.processor_samir.id,
      bidder_org_id: USERS.processor_samir.org,
      amount_per_kg: 56.5,
      status: 'winning',
      server_ts: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      idempotency_key: 'seed-bid-04',
    },
    {
      id: '44444444-4444-4000-8000-000000000005',
      lot_id: '33333333-3333-4000-8000-000000000005',
      bidder_user_id: USERS.processor_samir.id,
      bidder_org_id: USERS.processor_samir.org,
      amount_per_kg: 78.0,
      status: 'won',
      server_ts: soldEnd,
      idempotency_key: 'seed-bid-05',
    },
  ];

  // 4. Seed Settlement for Sold Lot
  const seedSettlements = [
    {
      id: '55555555-5555-4000-8000-000000000001',
      lot_id: '33333333-3333-4000-8000-000000000005',
      lot_code: 'LOT-GROUND-SOLD',
      winning_bid_id: '44444444-4444-4000-8000-000000000005',
      buyer_id: USERS.processor_samir.id,
      buyer_name: USERS.processor_samir.name,
      seller_id: USERS.farmer3.id,
      seller_name: USERS.farmer3.name,
      crop_type: 'groundnut',
      qty_kg: 4000,
      price_per_kg: 78.0,
      total_amount: 312000.0,
      msp_per_kg_at_sale: 71.5,
      premium_over_msp_pct: 9.09,
      status: 'pending_payment',
      created_at: soldEnd,
      updated_at: soldEnd,
    },
  ];

  // 5. Seed Bidding Limits
  const seedLimits = {
    [USERS.fpo_sneheraj.id]: {
      user_id: USERS.fpo_sneheraj.id,
      org_id: USERS.fpo_sneheraj.org,
      bidding_limit: USERS.fpo_sneheraj.limit, // ₹5.0 L
      blocked_amount: USERS.fpo_sneheraj.blocked, // ₹0 blocked
    },
    [USERS.processor_samir.id]: {
      user_id: USERS.processor_samir.id,
      org_id: USERS.processor_samir.org,
      bidding_limit: USERS.processor_samir.limit, // ₹25.0 L
      blocked_amount: USERS.processor_samir.blocked,
    },
    [USERS.processor_subham.id]: {
      user_id: USERS.processor_subham.id,
      org_id: USERS.processor_subham.org,
      bidding_limit: USERS.processor_subham.limit, // ₹15.0 L
      blocked_amount: USERS.processor_subham.blocked,
    },
  };

  // 6. Two Open Requirements
  const seedRequirements = [
    {
      id: 'REQ-CHAMBAL-01',
      fpo_id: USERS.fpo_sneheraj.id,
      fpo_name: USERS.fpo_sneheraj.org,
      crop_type: 'mustard',
      quantity_tonnes: 25.0,
      max_price_per_kg: 68.0,
      delivery_deadline: new Date(now.getTime() + 10 * 86400000).toISOString().split('T')[0],
      target_warehouse_name: 'Alwar Central Oilseed Silo',
      status: 'open',
      created_at: new Date(now.getTime() - 86400000).toISOString(),
    },
    {
      id: 'REQ-ADITYA-02',
      fpo_id: USERS.processor_samir.id,
      fpo_name: USERS.processor_samir.org,
      crop_type: 'soybean',
      quantity_tonnes: 50.0,
      max_price_per_kg: 56.0,
      delivery_deadline: new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0],
      target_warehouse_name: 'Dewas Processing Terminal A',
      status: 'open',
      created_at: new Date(now.getTime() - 172800000).toISOString(),
    },
  ];

  // 7. Write to Local Fallback Store
  const payload = {
    lots: seedLots,
    bids: seedBids,
    settlements: seedSettlements,
    limits: seedLimits,
    requirements: seedRequirements,
    watchlist: [
      { id: 'wl-01', user_id: USERS.fpo_sneheraj.id, lot_id: '33333333-3333-4000-8000-000000000003' },
    ],
    updated_at: now.toISOString(),
  };

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ [SEED-AUCTION] Written ${seedLots.length} lots across all 8 states to ${DATA_FILE}`);
  console.log(`✅ [SEED-AUCTION] Seeded FPO Sneheraj bidding limit: ₹${USERS.fpo_sneheraj.limit / 100000} Lakhs (Available: ₹5.0 L)`);
  console.log(`✅ [SEED-AUCTION] Seeded ${seedRequirements.length} open procurement requirements`);

  // 8. Try seeding Supabase tables if they exist
  try {
    for (const lot of seedLots) {
      await adminClient.from('auction_lots').upsert(lot, { onConflict: 'id' });
    }
    for (const req of seedRequirements) {
      await adminClient.from('auction_requirements').upsert(req, { onConflict: 'id' });
    }
  } catch (dbErr) {
    console.log('ℹ️ [SEED-AUCTION] Supabase remote sync note:', dbErr.message);
  }

  return { success: true, lots_count: seedLots.length, requirements_count: seedRequirements.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedAuctionDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ [SEED-AUCTION] Failed:', err);
      process.exit(1);
    });
}
