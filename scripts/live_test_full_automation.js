// scripts/live_test_full_automation.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminClient } from '../backend/src/config/supabaseClient.js';
import { 
  relayRegisterFarmer, 
  relayCreateBatch, 
  relayRecordCertificate, 
  relayTransferOwnership,
  getSavedReceipts,
  getRelayerStatus,
  getProvider
} from '../backend/src/services/relayer.service.js';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForReceipt(key, timeoutMs = 90000) {
  console.log(`⏳ Awaiting Sepolia confirmation for ${key}...`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipts = getSavedReceipts();
    const entry = receipts[key];
    if (entry && entry.chain_status === 'confirmed') {
      console.log(`✅ Confirmed! Tx: ${entry.tx_hash} (Block ${entry.block_number})`);
      return entry;
    }
    if (entry && entry.chain_status === 'failed') {
      throw new Error(`Transaction failed for ${key}: ${entry.error}`);
    }
    await sleep(3000);
  }
  throw new Error(`Timeout waiting for ${key}`);
}

async function main() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('🚀 LIVE ON-CHAIN AUTOMATION TEST — ETHEREUM SEPOLIA');
  console.log('═════════════════════════════════════════════════════════════════');

  const status = await getRelayerStatus();
  console.log('Relayer Status:', status);
  if (!status.hasGas) {
    throw new Error('Relayer does not have sufficient gas.');
  }

  // 1. Create a brand new unique test farmer user in Supabase
  const testId = Date.now().toString().slice(-4);
  const email = `farmer_test_${testId}@oilseed.gov.in`;
  const fullName = `Rajesh Verma (Test ${testId})`;
  console.log(`\n👤 [Step 1] Creating new farmer: ${fullName} (${email})...`);

  // Insert user
  const { data: newUser, error: userErr } = await adminClient.from('users').insert({
    email,
    full_name: fullName,
    phone_number: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
    role: 'farmer',
    is_verified: true,
  }).select().single();

  if (userErr) throw userErr;
  console.log(`   User created in DB: ${newUser.id}`);

  // Insert farmer profile
  const { data: newFarmer, error: farmerErr } = await adminClient.from('farmers').insert({
    user_id: newUser.id,
    state: 'Madhya Pradesh',
    district: 'Ujjain',
    village: 'Nagda',
    pincode: '456335',
    total_land_area_acres: 12.5,
    kyc_status: 'verified',
    fpo_membership_name: 'Malwa Oilseed Producers Collective'
  }).select().single();

  if (farmerErr) throw farmerErr;
  console.log(`   Farmer profile created: ${newFarmer.id}`);

  // Trigger Stage 1 On-Chain: FarmerRegistry.sol
  console.log('\n⛓️ [STAGE 1 — FarmerRegistry.sol] Triggering automated registration...');
  const stage1Req = await relayRegisterFarmer({
    farmerId: newFarmer.id,
    walletAddress: null
  });
  console.log(`   Stage 1 Queued with key: ${stage1Req.key}`);
  const stage1Receipt = await waitForReceipt(stage1Req.key);

  // 2. Register Crop & Batch (Stage 2)
  console.log('\n🌱 [Step 2] Registering crop cycle and batch for farmer...');
  const batchCode = `BATCH-UJJ-SOY-${testId}`;
  const quantityKg = 850;

  const { data: newCrop, error: cropErr } = await adminClient.from('crops').insert({
    farmer_id: newFarmer.id,
    crop_type: 'soybean',
    variety: 'JS 335 Gold',
    season: 'kharif',
    acreage_allocated: 5.0,
    estimated_yield_quintals: 8.5,
    status: 'harvested'
  }).select().single();
  if (cropErr) throw cropErr;

  const { data: newBatch, error: batchDbErr } = await adminClient.from('batches').insert({
    crop_id: newCrop.id,
    farmer_id: newFarmer.id,
    batch_code: batchCode,
    quantity_kg: quantityKg,
    quality_grade: 'grade_a_premium',
    status: 'harvested',
    base_ask_price_per_kg: 54.0
  }).select().single();
  if (batchDbErr) throw batchDbErr;

  console.log(`   Batch registered in DB: ${newBatch.id} (${batchCode})`);

  console.log('\n⛓️ [STAGE 2 — BatchRecord.sol] Triggering automated batch creation...');
  const stage2Req = await relayCreateBatch({
    batchId: batchCode,
    cropType: 'soybean',
    quantityKg
  });
  console.log(`   Stage 2 Queued with key: ${stage2Req.key}`);
  const stage2Receipt = await waitForReceipt(stage2Req.key);

  // 3. Lab Quality Assay / IPFS Pinning (Stage 3)
  console.log('\n🔬 [Step 3] Submitting Lab Assay Quality Certificate...');
  const ipfsCid = `QmTestLabAssay${testId}OilseedGradeAPremium`;
  console.log('\n⛓️ [STAGE 3 — QualityOracle.sol] Triggering automated certificate anchor...');
  const stage3Req = await relayRecordCertificate({
    batchId: batchCode,
    ipfsCID: ipfsCid,
    certType: 'lab_assay_report'
  });
  console.log(`   Stage 3 Queued with key: ${stage3Req.key}`);
  const stage3Receipt = await waitForReceipt(stage3Req.key);

  // 4. Order Payment & Title Transfer (Stage 4)
  console.log('\n💰 [Step 4] Placing order & simulating payment confirmation...');
  const orderNumber = `ORD-${batchCode.replace('BATCH-', '')}`;
  const buyerAddress = ethers.Wallet.createRandom().address;
  const sellerAddress = ethers.Wallet.createRandom().address;

  console.log('\n⛓️ [STAGE 4 — OwnershipTransfer.sol] Triggering automated ownership transfer...');
  const stage4Req = await relayTransferOwnership({
    batchId: batchCode,
    fromAddress: sellerAddress,
    toAddress: buyerAddress,
    orderId: orderNumber
  });
  console.log(`   Stage 4 Queued with key: ${stage4Req.key}`);
  const stage4Receipt = await waitForReceipt(stage4Req.key);

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log('🎉 ALL 4 STAGES CONFIRMED ON ETHEREUM SEPOLIA TESTNET!');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('Stage 1 (FarmerRegistry.sol):', stage1Receipt.tx_hash);
  console.log('Stage 2 (BatchRecord.sol):   ', stage2Receipt.tx_hash);
  console.log('Stage 3 (QualityOracle.sol): ', stage3Receipt.tx_hash);
  console.log('Stage 4 (OwnershipTransfer.sol):', stage4Receipt.tx_hash);
  console.log('Explorer URL (Stage 1):', stage1Receipt.explorer_url);
  console.log('Explorer URL (Stage 2):', stage2Receipt.explorer_url);
  console.log('Explorer URL (Stage 3):', stage3Receipt.explorer_url);
  console.log('Explorer URL (Stage 4):', stage4Receipt.explorer_url);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Automation Test Failed:', err);
  process.exit(1);
});
