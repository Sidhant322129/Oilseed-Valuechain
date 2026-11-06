// scripts/test-order-inventory-flow.js
import { adminClient } from '../backend/src/config/supabaseClient.js';
import { placeOrder, listBatches } from '../backend/src/controllers/marketplace.controller.js';

async function run() {
  console.log('=== Starting Marketplace Inventory Deduction Test ===');

  // Clean up any old test batches
  await adminClient.from('batches').delete().like('batch_code', 'BATCH-TEST-%');

  // 1. Get a crop and warehouse
  const { data: crop } = await adminClient.from('crops').select('id, farmer_id').limit(1).single();
  const { data: wh } = await adminClient.from('warehouses').select('id').limit(1).single();
  const { data: buyer } = await adminClient.from('users').select('id, role').eq('role', 'fpo').limit(1).single();

  if (!crop || !wh || !buyer) {
    console.error('Missing prerequisites in database (crop, warehouse, or buyer)');
    process.exit(1);
  }

  // 2. Insert test batch of 50 kg listed for sale
  const testCode = 'BATCH-TEST-' + Date.now().toString().slice(-4);
  const { data: batch, error: bErr } = await adminClient.from('batches').insert({
    crop_id: crop.id,
    farmer_id: crop.farmer_id,
    warehouse_id: wh.id,
    batch_code: testCode,
    quantity_kg: 50,
    base_ask_price_per_kg: 55,
    status: 'listed_for_sale',
    harvest_date: '2026-09-01'
  }).select().single();

  if (bErr) {
    console.error('Error creating batch:', bErr);
    process.exit(1);
  }
  console.log(`[Step 1] Created test batch ${batch.batch_code} with ${batch.quantity_kg} kg, status: ${batch.status}`);

  // 3. Place order 1: 20 kg (partial deduction)
  console.log('\n[Step 2] Placing partial order of 20 kg...');
  let response1 = null;
  const mockReq1 = {
    user: { id: buyer.id, role: buyer.role },
    body: {
      batch_id: batch.id,
      quantity_kg: 20,
      unit_price_per_kg: 55,
      delivery_address: 'Warehouse Hub 1, MP',
      delivery_pincode: '462001',
    }
  };
  const mockRes1 = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      response1 = { statusCode: this.statusCode, payload };
      return this;
    }
  };

  await placeOrder(mockReq1, mockRes1, (err) => { if (err) console.error('Error in order 1:', err); });
  console.log('Order 1 result status:', response1?.statusCode);
  console.log('Order 1 remaining kg returned:', response1?.payload?.remaining_batch_quantity_kg);

  // Verify batch in DB
  const { data: dbBatch1 } = await adminClient.from('batches').select('quantity_kg, status').eq('id', batch.id).single();
  console.log(`Batch in DB after order 1: quantity_kg = ${dbBatch1.quantity_kg}, status = ${dbBatch1.status}`);

  if (Number(dbBatch1.quantity_kg) !== 30 || dbBatch1.status !== 'listed_for_sale') {
    console.error('FAILURE: Expected quantity_kg = 30 and status = listed_for_sale');
    process.exit(1);
  }
  console.log('✓ Partial deduction succeeded perfectly!');

  // 4. Place order 2: Remaining 30 kg (full depletion)
  console.log('\n[Step 3] Placing remaining 30 kg to fully deplete batch...');
  let response2 = null;
  const mockReq2 = {
    user: { id: buyer.id, role: buyer.role },
    body: {
      batch_id: batch.id,
      quantity_kg: 30,
      unit_price_per_kg: 55,
      delivery_address: 'Warehouse Hub 1, MP',
      delivery_pincode: '462001',
    }
  };
  const mockRes2 = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      response2 = { statusCode: this.statusCode, payload };
      return this;
    }
  };

  await placeOrder(mockReq2, mockRes2, (err) => { if (err) console.error('Error in order 2:', err); });
  console.log('Order 2 result status:', response2?.statusCode);
  console.log('Order 2 remaining kg returned:', response2?.payload?.remaining_batch_quantity_kg);

  // Verify batch in DB
  const { data: dbBatch2 } = await adminClient.from('batches').select('quantity_kg, status').eq('id', batch.id).single();
  console.log(`Batch in DB after order 2: quantity_kg = ${dbBatch2.quantity_kg}, status = ${dbBatch2.status}`);

  if (dbBatch2.status !== 'sold') {
    console.error('FAILURE: Expected batch status to be "sold"');
    process.exit(1);
  }
  console.log('✓ Full depletion and transition to "sold" succeeded without constraint violation!');

  // 5. Test listBatches query
  console.log('\n[Step 4] Checking listBatches...');
  let listResponse = null;
  const mockReqList = { query: {} };
  const mockResList = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      listResponse = { statusCode: this.statusCode, payload };
      return this;
    }
  };

  await listBatches(mockReqList, mockResList, (err) => { if (err) console.error('Error in listBatches:', err); });
  const isFoundInList = listResponse?.payload?.batches?.some(b => b.id === batch.id);
  console.log('Total available batches in marketplace:', listResponse?.payload?.batches?.length);
  console.log('Is depleted batch visible in marketplace list?', isFoundInList);

  if (isFoundInList) {
    console.error('FAILURE: Depleted/sold batch is still visible in marketplace listings!');
    process.exit(1);
  }
  console.log('✓ Depleted batch is correctly excluded from marketplace listings!');

  // Cleanup
  console.log('\n[Step 5] Cleaning up test records...');
  await adminClient.from('orders').delete().eq('batch_id', batch.id);
  await adminClient.from('batches').delete().eq('id', batch.id);
  console.log('✓ All test records cleaned up.');
  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

run().catch(err => {
  console.error('Unhandled error in test:', err);
  process.exit(1);
});
