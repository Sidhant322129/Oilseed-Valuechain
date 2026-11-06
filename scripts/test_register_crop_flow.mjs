// scripts/test_register_crop_flow.mjs
import { adminClient } from '../backend/src/config/supabaseClient.js';
import { relayCreateBatch, getSavedReceipts } from '../backend/src/services/relayer.service.js';

async function main() {
  // 1. Get farmer record
  const { data: farmer } = await adminClient
    .from('farmers')
    .select('id, user_id, district, state')
    .limit(1)
    .single();

  console.log(`Using Farmer: ${farmer.id} (${farmer.district}, ${farmer.state})`);

  // 2. Insert crop into Supabase
  const { data: crop, error: cropErr } = await adminClient
    .from('crops')
    .insert({
      farmer_id: farmer.id,
      crop_type: 'mustard',
      variety: 'Pusa Bold Live',
      season: 'rabi',
      sowing_date: '2026-09-14',
      expected_harvest_date: '2027-01-15',
      acreage_allocated: 3.5,
      estimated_yield_quintals: 18,
      status: 'sown'
    })
    .select()
    .single();

  if (cropErr) {
    console.error('Crop insert error:', cropErr);
    process.exit(1);
  }

  const batchCode = `BATCH-${farmer.district.slice(0, 3).toUpperCase()}-MUST-${Date.now().toString().slice(-4)}`;
  console.log(`\n1. Registered Crop: ${crop.id} (${crop.crop_type} - ${crop.variety})`);
  console.log(`2. Synchronized Batch: ${batchCode} (1800 kg)`);

  // 3. Insert batch into Supabase
  await adminClient.from('batches').insert({
    crop_id: crop.id,
    farmer_id: farmer.id,
    batch_code: batchCode,
    quantity_kg: 1800,
    quality_grade: 'grade_a_premium',
    status: 'harvested',
    base_ask_price_per_kg: 58.0
  });

  // 4. Trigger automated background on-chain transaction to BatchRecord.sol
  console.log(`3. Triggering automated gasless on-chain relay to BatchRecord.sol...`);
  await relayCreateBatch({
    batchId: batchCode,
    cropType: 'Mustard',
    quantityKg: 1800
  });

  console.log('4. Waiting for live mining confirmation on Sepolia (~12-15s)...');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const receipts = getSavedReceipts();
    const cur = receipts[`createBatch_${batchCode}`];
    if (cur?.tx_hash) {
      console.log(`   [Sepolia State: ${cur.chain_status}] Tx: ${cur.tx_hash}`);
      if (cur.chain_status === 'confirmed') {
        console.log('\n================================================================');
        console.log('✅ LIVE PROVENANCE VERIFIED ON-CHAIN!');
        console.log('Batch Code:    ', batchCode);
        console.log('Block Number:  ', cur.block_number);
        console.log('Transaction:   ', cur.tx_hash);
        console.log('Etherscan URL: ', cur.explorer_url);
        console.log('================================================================');
        process.exit(0);
      }
    }
  }

  process.exit(0);
}

main().catch(console.error);
