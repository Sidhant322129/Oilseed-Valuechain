// scripts/seed_farmers_production.cjs
// Inserts production-grade farmers, land holdings, crops, and batches into Supabase.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const p = l.split('=');
  if (p.length >= 2) {
    const k = p[0].trim();
    const v = p.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[k] = v;
  }
});

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

const NEW_FARMERS = [
  {
    email: 'rameshwar.indore@sovereignharvest.in',
    full_name: 'Rameshwar Patidar',
    phone_number: '+919826011223',
    state: 'Madhya Pradesh',
    district: 'Indore',
    village: 'Depalpur',
    taluka_tehsil: 'Depalpur',
    pincode: '453115',
    total_land_area_acres: 18.5,
    crop_type: 'soybean',
    variety: 'JS-9560',
    season: 'kharif',
    acreage: 18.5,
    estimated_yield: 185.0,
    batch_code: 'BATCH-MP-IND-SOY-001',
    batch_quantity: 3500,
    base_ask_price: 54.0,
    quality_grade: 'Grade_A',
    batch_status: 'quality_approved',
  },
  {
    email: 'bhupendra.bharatpur@sovereignharvest.in',
    full_name: 'Bhupendra Singh Gurjar',
    phone_number: '+919414022334',
    state: 'Rajasthan',
    district: 'Bharatpur',
    village: 'Kumher',
    taluka_tehsil: 'Kumher',
    pincode: '321201',
    total_land_area_acres: 14.0,
    crop_type: 'mustard',
    variety: 'Pusa Jai Kisan',
    season: 'rabi',
    acreage: 14.0,
    estimated_yield: 140.0,
    batch_code: 'BATCH-RJ-BHA-MUST-002',
    batch_quantity: 2800,
    base_ask_price: 61.0,
    quality_grade: 'Grade_A',
    batch_status: 'harvested',
  },
  {
    email: 'vitthal.latur@sovereignharvest.in',
    full_name: 'Vitthal Rao Kadam',
    phone_number: '+919822033445',
    state: 'Maharashtra',
    district: 'Latur',
    village: 'Ausa',
    taluka_tehsil: 'Ausa',
    pincode: '413520',
    total_land_area_acres: 16.0,
    crop_type: 'soybean',
    variety: 'JS-335',
    season: 'kharif',
    acreage: 16.0,
    estimated_yield: 160.0,
    batch_code: 'BATCH-MH-LAT-SOY-003',
    batch_quantity: 3000,
    base_ask_price: 52.0,
    quality_grade: 'Grade_B',
    batch_status: 'quality_approved',
  },
  {
    email: 'basavaraj.koppal@sovereignharvest.in',
    full_name: 'Basavaraj Patil',
    phone_number: '+919845044556',
    state: 'Karnataka',
    district: 'Koppal',
    village: 'Yelburga',
    taluka_tehsil: 'Yelburga',
    pincode: '583236',
    total_land_area_acres: 22.0,
    crop_type: 'sunflower',
    variety: 'KBSH-53',
    season: 'zaid',
    acreage: 15.0,
    estimated_yield: 120.0,
    batch_code: 'BATCH-KA-KOP-SUNF-004',
    batch_quantity: 2200,
    base_ask_price: 64.0,
    quality_grade: 'Grade_A',
    batch_status: 'quality_approved',
  },
];

async function seed() {
  console.log('Starting farmer seed process...');

  for (const item of NEW_FARMERS) {
    try {
      // 1. Create or get user in auth.users via admin API
      let userId = null;
      const { data: userList } = await sb.auth.admin.listUsers();
      const existingAuth = (userList?.users || []).find(u => u.email === item.email);

      if (existingAuth) {
        userId = existingAuth.id;
        console.log(`Auth user already exists for ${item.email} (${userId})`);
      } else {
        const { data: createdAuth, error: authErr } = await sb.auth.admin.createUser({
          email: item.email,
          email_confirm: true,
          password: 'Password@123',
          user_metadata: { full_name: item.full_name, role: 'farmer' },
        });
        if (authErr) {
          console.error(`Error creating auth user ${item.email}:`, authErr.message);
          continue;
        }
        userId = createdAuth.user.id;
        console.log(`Created auth user for ${item.email} (${userId})`);
      }

      // 2. Ensure public.users profile exists
      const { data: existingProf } = await sb.from('users').select('id').eq('id', userId).maybeSingle();
      if (!existingProf) {
        const { error: profErr } = await sb.from('users').insert({
          id: userId,
          email: item.email,
          full_name: item.full_name,
          phone_number: item.phone_number,
          role: 'farmer',
          is_verified: true,
        });
        if (profErr) console.error(`Error creating public profile:`, profErr.message);
      }

      // 3. Create or update public.farmers
      let farmerId = null;
      const { data: existingFarmer } = await sb.from('farmers').select('id').eq('user_id', userId).maybeSingle();
      if (existingFarmer) {
        farmerId = existingFarmer.id;
        console.log(`Farmer record exists (${farmerId})`);
      } else {
        const { data: newFarmer, error: fErr } = await sb.from('farmers').insert({
          user_id: userId,
          state: item.state,
          district: item.district,
          taluka_tehsil: item.taluka_tehsil,
          village: item.village,
          pincode: item.pincode,
          kyc_status: 'verified',
          total_land_area_acres: item.total_land_area_acres,
        }).select().single();

        if (fErr) {
          console.error(`Error creating farmer:`, fErr.message);
          continue;
        }
        farmerId = newFarmer.id;
        console.log(`Created farmer record (${farmerId}) in ${item.district}`);
      }

      // 4. Create land record if none
      const { data: existingLand } = await sb.from('land_records').select('id').eq('farmer_id', farmerId).limit(1);
      let landId = existingLand?.[0]?.id;
      if (!landId) {
        const { data: newLand, error: lErr } = await sb.from('land_records').insert({
          farmer_id: farmerId,
          survey_number: `SRV-${item.district.toUpperCase().slice(0, 3)}-${Math.floor(100 + Math.random() * 900)}`,
          area_acres: item.total_land_area_acres,
          soil_type: item.state === 'Rajasthan' ? 'alluvial_soil' : 'black_soil',
          is_verified: true,
        }).select().single();
        if (!lErr && newLand) landId = newLand.id;
      }

      // 5. Create crop cycle
      const { data: existingCrop } = await sb.from('crops').select('id').eq('farmer_id', farmerId).eq('crop_type', item.crop_type).limit(1);
      let cropId = existingCrop?.[0]?.id;
      if (!cropId) {
        const { data: newCrop, error: cErr } = await sb.from('crops').insert({
          farmer_id: farmerId,
          land_id: landId,
          crop_type: item.crop_type,
          variety: item.variety,
          season: item.season,
          sowing_date: new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0],
          expected_harvest_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          acreage_allocated: item.acreage,
          estimated_yield_quintals: item.estimated_yield,
          status: 'flowering',
        }).select().single();
        if (cErr) {
          console.error(`Error creating crop:`, cErr.message);
          continue;
        }
        cropId = newCrop.id;
        console.log(`Created crop ${item.crop_type} (${item.variety}) for farmer ${farmerId}`);
      }

      // 6. Create batch produce lot
      const { data: existingBatch } = await sb.from('batches').select('id').eq('batch_code', item.batch_code).maybeSingle();
      if (!existingBatch && cropId) {
        const { data: newBatch, error: bErr } = await sb.from('batches').insert({
          crop_id: cropId,
          farmer_id: farmerId,
          batch_code: item.batch_code,
          quantity_kg: item.batch_quantity,
          quality_grade: item.quality_grade,
          moisture_pct: 8.5,
          oil_content_pct: 41.2,
          foreign_matter_pct: 1.1,
          harvest_date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
          status: item.batch_status,
          base_ask_price_per_kg: item.base_ask_price,
        }).select().single();
        if (bErr) {
          console.error(`Error creating batch:`, bErr.message);
        } else {
          console.log(`Created batch ${item.batch_code} (${item.batch_quantity} kg at ₹${item.base_ask_price}/kg)`);
        }
      }
    } catch (err) {
      console.error(`Iteration error for ${item.email}:`, err);
    }
  }

  // Summary of database state after seed
  const [
    { count: totalF },
    { count: totalC },
    { count: totalB },
    { data: rgnCheck },
  ] = await Promise.all([
    sb.from('farmers').select('*', { count: 'exact', head: true }),
    sb.from('crops').select('*', { count: 'exact', head: true }),
    sb.from('batches').select('*', { count: 'exact', head: true }).not('status', 'in', '("sold")'),
    sb.from('farmers').select('district, state, total_land_area_acres'),
  ]);

  console.log('\n================ SEED COMPLETE ================');
  console.log(`Total Registered Farmers in DB: ${totalF}`);
  console.log(`Total Registered Crops in DB:   ${totalC}`);
  console.log(`Total Active Batches in DB:    ${totalB}`);
  console.log('\nActive Regional Districts:');
  console.table(rgnCheck);
}

seed();
