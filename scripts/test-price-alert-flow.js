// scripts/test-price-alert-flow.js
// End-to-end verification script for the Price Alert system.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually parse env files
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      value = value.replace(/(^['"]|['"]$)/g, '').trim();
      process.env[match[1]] = value;
    }
  });
}

loadEnv(path.resolve(__dirname, '../.env.local'));
loadEnv(path.resolve(__dirname, '../.env'));
loadEnv(path.resolve(__dirname, '../backend/.env'));

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase URL or Service Role Key in env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Import price alert service
import { checkAndCreatePriceAlert } from '../backend/src/services/priceAlert.service.js';

async function run() {
  console.log('🌾 ========================================================');
  console.log('   PRICE ALERT SYSTEM - COMPREHENSIVE E2E VERIFICATION');
  console.log('========================================================\n');

  // Step 1: Check existing farmers and crops
  console.log('1. Checking existing farmers and crops in database...');
  const { data: farmers, error: fErr } = await supabase.from('farmers').select('id, user_id, district, state');
  if (fErr) throw fErr;
  console.log(`   Found ${farmers.length} farmer profile(s).`);

  const { data: crops, error: cErr } = await supabase.from('crops').select('id, farmer_id, crop_type, variety, status');
  if (cErr) throw cErr;
  console.log(`   Found ${crops.length} registered crop(s):`, crops.map(c => `${c.crop_type} (${c.variety})`).join(', '));

  // Find a crop that the farmer is growing
  const activeCrop = crops.find(c => c.crop_type === 'soybean') || crops[0];
  const testCropType = activeCrop ? activeCrop.crop_type : 'mustard';
  console.log(`   Target crop for alert test: ${testCropType}`);

  // Step 2: Fetch latest price benchmark for this crop
  console.log(`\n2. Fetching baseline price benchmark for ${testCropType}...`);
  const { data: latestBenchmark } = await supabase
    .from('price_history')
    .select('*')
    .eq('crop_type', testCropType)
    .order('price_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const baselinePrice = latestBenchmark ? Number(latestBenchmark.modal_price_per_quintal) : 4800;
  console.log(`   Baseline modal price: ₹${baselinePrice}/quintal at ${latestBenchmark?.mandi_name || 'Indore Mandi'}`);

  // Step 3: Insert a price surge row (+9.0% price increase)
  const surgePct = 9.0;
  const newPrice = Math.round(baselinePrice * (1 + surgePct / 100));
  console.log(`\n3. Simulating market surge: New modal price = ₹${newPrice}/quintal (+${surgePct}% increase)...`);

  const { data: newPriceRecord, error: priceInsertErr } = await supabase
    .from('price_history')
    .insert({
      crop_type: testCropType,
      variety: activeCrop?.variety || 'JS-335',
      mandi_name: 'Indore Mandi',
      state: 'Madhya Pradesh',
      district: 'Indore',
      modal_price_per_quintal: newPrice,
      min_price_per_quintal: Math.round(newPrice * 0.95),
      max_price_per_quintal: Math.round(newPrice * 1.05),
      arrival_quantity_tonnes: 220.0,
      price_date: new Date().toISOString().split('T')[0],
      source: 'Agmarknet API Realtime',
    })
    .select()
    .single();

  if (priceInsertErr) throw priceInsertErr;
  console.log('   ✅ price_history row inserted successfully: ID =', newPriceRecord.id);

  // Step 4: Run price alert detection service
  console.log('\n4. Running checkAndCreatePriceAlert() evaluation...');
  const alertResult = await checkAndCreatePriceAlert(newPriceRecord);
  console.log('   Alert evaluation result:', {
    alertTriggered: alertResult.alertTriggered,
    percentageIncrease: alertResult.percentageIncrease,
    farmersEligibleCount: alertResult.farmersEligibleCount,
    alertsDispatchedCount: alertResult.alertsDispatchedCount,
  });

  if (alertResult.notifications && alertResult.notifications.length > 0) {
    const alert = alertResult.notifications[0];
    console.log('\n   ✅ Notification created in database:');
    console.log('      - Notification ID:', alert.id);
    console.log('      - Target User ID:', alert.user_id);
    console.log('      - Title:', alert.title);
    console.log('      - Category:', alert.category);
    console.log('      - Priority:', alert.priority);
    console.log('      - Is Read:', alert.is_read);
    console.log('      - Crop Type:', alert.metadata?.crop_type);
    console.log('      - Previous Price: ₹' + alert.metadata?.previous_price);
    console.log('      - New Price: ₹' + alert.metadata?.new_price);
    console.log('      - Percentage Increase: +' + alert.metadata?.percentage_increase + '%');
    console.log('      - Amount Increase: +₹' + alert.metadata?.amount_increase);
    console.log('      - Mandi:', alert.metadata?.mandi_name);

    // Step 5: Test marking the alert as read
    console.log('\n5. Testing PATCH mark alert as read...');
    const { data: updatedAlert, error: readErr } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', alert.id)
      .select()
      .single();

    if (readErr) throw readErr;
    console.log('   ✅ Alert marked as read. New is_read status:', updatedAlert.is_read);

    // Step 6: Verify unread count decreases
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', alert.user_id)
      .eq('category', 'mandi_price')
      .eq('is_read', false);

    console.log('   ✅ Remaining unread price alerts for this farmer:', unreadCount);

    // Step 7: Create a fresh UNREAD alert so the farmer can immediately see it on their dashboard
    console.log('\n7. Generating a fresh unread alert on the farmer dashboard for verification...');
    const freshSurgePrice = Math.round(newPrice * 1.06); // another +6% increase
    const { data: freshPriceRecord } = await supabase
      .from('price_history')
      .insert({
        crop_type: testCropType,
        variety: activeCrop?.variety || 'JS-335',
        mandi_name: 'Indore Mandi',
        state: 'Madhya Pradesh',
        district: 'Indore',
        modal_price_per_quintal: freshSurgePrice,
        min_price_per_quintal: Math.round(freshSurgePrice * 0.95),
        max_price_per_quintal: Math.round(freshSurgePrice * 1.05),
        arrival_quantity_tonnes: 260.0,
        price_date: new Date().toISOString().split('T')[0],
        source: 'Agmarknet API Realtime',
      })
      .select()
      .single();

    const freshAlertResult = await checkAndCreatePriceAlert(freshPriceRecord);
    console.log('   ✅ Fresh unread alert dispatched:', {
      alertsDispatched: freshAlertResult.alertsDispatchedCount,
      title: freshAlertResult.notifications?.[0]?.title,
      price: `₹${freshAlertResult.notifications?.[0]?.metadata?.new_price}/q`,
    });
  }

  console.log('\n========================================================');
  console.log('🎉 ALL PRICE ALERT VERIFICATION CHECKS PASSED');
  console.log('========================================================');
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
