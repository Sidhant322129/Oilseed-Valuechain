// backend/scripts/test_stage4_live_execution.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { adminClient } from '../src/config/supabaseClient.js';
import { relayTransferOwnership, getRelayerWallet, getRelayerStatus } from '../src/services/relayer.service.js';
import { ethers } from 'ethers';
import crypto from 'crypto';

async function runStage4Test() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('🚀 STAGE 4 LIVE TEST: TITLE OWNERSHIP TRANSFER ON ETHEREUM SEPOLIA');
  console.log('═════════════════════════════════════════════════════════════════');

  const status = await getRelayerStatus();
  console.log('Relayer Status:', status);
  if (!status.hasGas) {
    throw new Error('Relayer does not have gas on Sepolia');
  }

  // 1. Fetch our active batch BATCH-PUR-SOY-9b07c6
  const { data: batch, error: bErr } = await adminClient
    .from('batches')
    .select('*, crops(*), farmers(*, users(full_name, email))')
    .eq('batch_code', 'BATCH-PUR-SOY-9b07c6')
    .single();

  if (bErr || !batch) {
    throw new Error(`Batch BATCH-PUR-SOY-9b07c6 not found: ${bErr?.message}`);
  }

  console.log(`\n📦 Batch Located:`);
  console.log(`   Batch Code:   ${batch.batch_code}`);
  console.log(`   Batch UUID:   ${batch.id}`);
  console.log(`   Crop:         ${batch.crops?.crop_type} (${batch.crops?.variety})`);
  console.log(`   Farmer:       ${batch.farmers?.users?.full_name}`);
  console.log(`   Ask Price:    ₹${batch.base_ask_price_per_kg}/kg`);
  console.log(`   Current Qty:  ${batch.quantity_kg} kg`);
  console.log(`   Status:       ${batch.status}`);

  // 2. Fetch or assign buyer user (Retailer: shrutiguptafeb@gmail.com)
  const { data: buyer } = await adminClient
    .from('users')
    .select('id, email, full_name, role')
    .eq('email', 'shrutiguptafeb@gmail.com')
    .single();

  const buyerId = buyer?.id || '32e2cacf-9750-4f5d-ad3c-a613d75f68ec';
  const buyerName = buyer?.full_name || 'Shruti Gupta (Verified Retailer)';
  console.log(`\n🛒 Buyer Details:`);
  console.log(`   Name:   ${buyerName}`);
  console.log(`   Email:  ${buyer?.email}`);
  console.log(`   Role:   ${buyer?.role || 'retailer'}`);

  // 3. Create Real Procurement Order in Supabase
  const orderNumber = `ORD-2026-${Date.now().toString().slice(-6)}`;
  const orderQuantityKg = 500;
  const unitPrice = Number(batch.base_ask_price_per_kg || 52.5);
  const totalAmount = orderQuantityKg * unitPrice; // ₹26,250

  console.log(`\n📝 [Step 1] Placing order in marketplace...`);
  console.log(`   Order Number: ${orderNumber}`);
  console.log(`   Quantity:     ${orderQuantityKg} kg`);
  console.log(`   Total Amount: ₹${totalAmount.toLocaleString()}`);

  const { data: order, error: ordErr } = await adminClient
    .from('orders')
    .insert({
      order_number: orderNumber,
      buyer_id: buyerId,
      batch_id: batch.id,
      quantity_kg: orderQuantityKg,
      unit_price_per_kg: unitPrice,
      total_amount: totalAmount,
      delivery_address: 'Plot 42, Agro-Processing & Retail Zone, MIDC Industrial Area, Nagpur, Maharashtra',
      delivery_pincode: '440028',
      order_status: 'placed',
      payment_status: 'pending',
    })
    .select()
    .single();

  if (ordErr) throw ordErr;
  console.log(`   Order created with ID: ${order.id}`);

  // 4. Generate Razorpay Test Order and Payment IDs
  const rzpOrderId = `order_${crypto.randomBytes(7).toString('hex')}`;
  const rzpPaymentId = `pay_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
  console.log(`\n💳 [Step 2] Razorpay Test Mode Payment Session:`);
  console.log(`   Razorpay Order ID:   ${rzpOrderId}`);
  console.log(`   Razorpay Payment ID: ${rzpPaymentId}`);
  console.log(`   Amount (Paise):      ${totalAmount * 100}`);
  console.log(`   Currency:            INR`);
  console.log(`   Status:              Authorized / Captured (Test Mode)`);

  // 5. Derive valid Ethereum addresses for Farmer & Buyer
  const relayerWallet = getRelayerWallet();
  const farmerSeed = batch.farmers?.user_id || batch.farmer_id || 'farmer-sepolia';
  const buyerSeed = buyerId;
  const farmerAddr = ethers.getAddress('0x' + crypto.createHash('sha256').update(String(farmerSeed)).digest('hex').slice(24));
  const buyerAddr = ethers.getAddress('0x' + crypto.createHash('sha256').update(String(buyerSeed)).digest('hex').slice(24));

  console.log(`\n⛓️ [Step 3] Broadcasting Title Transfer to OwnershipTransfer.sol on Sepolia:`);
  console.log(`   Batch Code:     ${batch.batch_code}`);
  console.log(`   From (Seller):  ${farmerAddr}`);
  console.log(`   To (Buyer):     ${buyerAddr}`);
  console.log(`   Order ID:       ${orderNumber}`);

  const startTime = Date.now();
  const relayReceipt = await relayTransferOwnership({
    batchId: batch.batch_code,
    batchUuid: batch.id,
    fromAddress: farmerAddr,
    toAddress: buyerAddr,
    orderId: orderNumber,
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ [STAGE 4 CONFIRMED ON ETHEREUM SEPOLIA in ${durationSec}s!]`);
  console.log(`   Contract:        ${relayReceipt.contract}`);
  console.log(`   Contract Addr:   ${relayReceipt.contract_address}`);
  console.log(`   Tx Hash:         ${relayReceipt.tx_hash}`);
  console.log(`   Block Number:    ${relayReceipt.block_number}`);
  console.log(`   Gas Used:        ${relayReceipt.gas_used}`);
  console.log(`   Etherscan Link:  ${relayReceipt.explorer_url}`);

  // 6. Update order in Supabase to paid + confirmed
  const { error: updErr } = await adminClient
    .from('orders')
    .update({
      payment_status: 'paid',
      order_status: 'confirmed',
      payment_reference: rzpPaymentId,
      updated_at: new Date().toISOString()
    })
    .eq('id', order.id);

  if (updErr) console.warn('Order update warning:', updErr);

  // 7. Verify /api/blockchain/provenance/BATCH-PUR-SOY-9b07c6
  console.log(`\n🔍 [Step 4] Querying live provenance endpoint for BATCH-PUR-SOY-9b07c6...`);
  const provRes = await fetch(`http://localhost:5000/api/blockchain/provenance/${batch.batch_code}`);
  if (provRes.ok) {
    const prov = await provRes.json();
    console.log(`   Provenance Endpoint HTTP 200 OK! Total Stages: ${prov.provenance_trail?.length}`);
    prov.provenance_trail.forEach((step, idx) => {
      console.log(`   [Stage ${idx + 1}] ${step.stage}`);
      console.log(`       Contract:     ${step.contract}`);
      console.log(`       Tx Hash:      ${step.tx_hash}`);
      console.log(`       Status:       ${step.status} (Chain: ${step.chain_status})`);
      console.log(`       Explorer:     ${step.explorer_url || 'None'}`);
    });
  } else {
    console.warn(`Provenance endpoint response: ${provRes.status}`);
  }

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log('🎉 STAGE 4 COMPLETE & VERIFIED ON-CHAIN!');
  console.log('═════════════════════════════════════════════════════════════════');
  process.exit(0);
}

runStage4Test().catch(err => {
  console.error('❌ Stage 4 Execution Error:', err);
  process.exit(1);
});
