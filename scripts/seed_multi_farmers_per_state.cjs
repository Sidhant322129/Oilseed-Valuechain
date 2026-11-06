// scripts/seed_multi_farmers_per_state.cjs
// 1. Adds active crops to existing 0-acre farmers (Morena, Rajkot, Karnoor).
// 2. Adds second farmers with active crops across Rajasthan, Maharashtra, Karnataka, Gujarat, Andhra Pradesh, Madhya Pradesh.
// Result: Every state has multiple farmers, and 0 states/farmers have 0 cultivated acres!

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

async function run() {
  console.log('--- Step 1: Assign active crops to existing farmers in Morena, Rajkot, Karnoor ---');
  const { data: farmers } = await sb.from('farmers').select('id, district, state, total_land_area_acres');

  for (const f of farmers) {
    const { data: existingCrops } = await sb.from('crops').select('id').eq('farmer_id', f.id);
    if (!existingCrops || existingCrops.length === 0) {
      let cropType = 'mustard';
      let variety = 'Pusa Bold';
      let season = 'rabi';
      let estYield = 55.0;

      if (f.district.toLowerCase() === 'rajkot') {
        cropType = 'groundnut';
        variety = 'Girnar-4';
        season = 'kharif';
        estYield = 120.0;
      } else if (f.district.toLowerCase().includes('karn') || f.district.toLowerCase().includes('kurn')) {
        cropType = 'groundnut';
        variety = 'Kadiri-6';
        season = 'kharif';
        estYield = 130.0;
      } else if (f.district.toLowerCase() === 'morena') {
        cropType = 'mustard';
        variety = 'Pusa Bold';
        season = 'rabi';
        estYield = 55.0;
      }

      const acres = parseFloat(f.total_land_area_acres) || 10.0;
      const { data: newCrop, error: cErr } = await sb.from('crops').insert({
        farmer_id: f.id,
        crop_type: cropType,
        variety: variety,
        season: season,
        sowing_date: new Date(Date.now() - 50 * 86400000).toISOString().split('T')[0],
        expected_harvest_date: new Date(Date.now() + 40 * 86400000).toISOString().split('T')[0],
        acreage_allocated: acres,
        estimated_yield_quintals: estYield,
        status: 'vegetative',
      }).select().single();

      if (cErr) {
        console.error(`Error adding crop for ${f.district}:`, cErr.message);
      } else {
        console.log(`✓ Added crop ${cropType} (${variety}, ${acres} ac) for farmer in ${f.district}, ${f.state}`);

        // Also add an active batch
        const batchCode = `BATCH-${f.district.toUpperCase().slice(0, 3)}-${cropType.toUpperCase().slice(0, 4)}-${Math.floor(100 + Math.random() * 900)}`;
        await sb.from('batches').insert({
          crop_id: newCrop.id,
          farmer_id: f.id,
          batch_code: batchCode,
          quantity_kg: Math.round(acres * 180),
          quality_grade: 'grade_a_premium',
          moisture_pct: 7.8,
          oil_content_pct: 42.5,
          foreign_matter_pct: 0.9,
          harvest_date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
          status: 'listed_for_sale',
          base_ask_price_per_kg: cropType === 'mustard' ? 62.0 : 68.0,
        });
        console.log(`  ✓ Added batch ${batchCode}`);
      }
    }
  }

  console.log('\n--- Step 2: Add second farmers with crops across states ---');
  const SECOND_FARMERS = [
    {
      email: 'giriraj.alwar@sovereignharvest.in',
      full_name: 'Giriraj Meena',
      phone_number: '+919414033445',
      state: 'Rajasthan',
      district: 'Alwar',
      village: 'Thanagazi',
      taluka_tehsil: 'Thanagazi',
      pincode: '301022',
      total_land: 18.0,
      crop_type: 'mustard',
      variety: 'Giriraj',
      season: 'rabi',
      acreage: 18.0,
      yield_q: 180.0,
      batch_code: 'BATCH-RJ-ALW-MUST-101',
      batch_kg: 3200,
      price_kg: 62.5,
    },
    {
      email: 'pandurang.solapur@sovereignharvest.in',
      full_name: 'Pandurang Shinde',
      phone_number: '+919822044556',
      state: 'Maharashtra',
      district: 'Solapur',
      village: 'Barshi',
      taluka_tehsil: 'Barshi',
      pincode: '413401',
      total_land: 15.0,
      crop_type: 'safflower',
      variety: 'PBNS-12',
      season: 'rabi',
      acreage: 15.0,
      yield_q: 120.0,
      batch_code: 'BATCH-MH-SOL-SAFF-102',
      batch_kg: 2400,
      price_kg: 58.0,
    },
    {
      email: 'mallikarjun.dharwad@sovereignharvest.in',
      full_name: 'Mallikarjun Gowda',
      phone_number: '+919845055667',
      state: 'Karnataka',
      district: 'Koppal', // Additional farmer in Koppal/Karnataka hub
      village: 'Kushtagi',
      taluka_tehsil: 'Kushtagi',
      pincode: '583277',
      total_land: 20.0,
      crop_type: 'sunflower',
      variety: 'KBSH-44',
      season: 'kharif',
      acreage: 20.0,
      yield_q: 160.0,
      batch_code: 'BATCH-KA-KOP-SUNF-103',
      batch_kg: 3000,
      price_kg: 63.5,
    },
    {
      email: 'mansukh.amreli@sovereignharvest.in',
      full_name: 'Mansukhbhai Bhalani',
      phone_number: '+919879066778',
      state: 'Gujrat',
      district: 'Rajkot', // Additional farmer in Rajkot/Gujarat hub
      village: 'Gondal',
      taluka_tehsil: 'Gondal',
      pincode: '360311',
      total_land: 16.0,
      crop_type: 'groundnut',
      variety: 'TG-37A',
      season: 'kharif',
      acreage: 16.0,
      yield_q: 175.0,
      batch_code: 'BATCH-GJ-RAJ-GROU-104',
      batch_kg: 3100,
      price_kg: 69.0,
    },
    {
      email: 'venkat.anantapur@sovereignharvest.in',
      full_name: 'Venkat Reddy',
      phone_number: '+919848077889',
      state: 'Andra Pradesh',
      district: 'Karnoor', // Additional farmer in Kurnool/AP hub
      village: 'Nandyal',
      taluka_tehsil: 'Nandyal',
      pincode: '518501',
      total_land: 17.5,
      crop_type: 'groundnut',
      variety: 'Kadiri-6',
      season: 'kharif',
      acreage: 17.5,
      yield_q: 165.0,
      batch_code: 'BATCH-AP-KAR-GROU-105',
      batch_kg: 2900,
      price_kg: 67.0,
    },
    {
      email: 'devendra.ujjain@sovereignharvest.in',
      full_name: 'Devendra Sharma',
      phone_number: '+919826088990',
      state: 'Madhya Pradesh',
      district: 'Indore', // Additional farmer in Indore/MP hub
      village: 'Sanwer',
      taluka_tehsil: 'Sanwer',
      pincode: '453551',
      total_land: 21.0,
      crop_type: 'soybean',
      variety: 'JS-20-34',
      season: 'kharif',
      acreage: 21.0,
      yield_q: 210.0,
      batch_code: 'BATCH-MP-IND-SOY-106',
      batch_kg: 3800,
      price_kg: 53.5,
    },
  ];

  for (const f of SECOND_FARMERS) {
    let userId = null;
    const { data: userList } = await sb.auth.admin.listUsers();
    const existingAuth = (userList?.users || []).find(u => u.email === f.email);

    if (existingAuth) {
      userId = existingAuth.id;
    } else {
      const { data: createdAuth, error: authErr } = await sb.auth.admin.createUser({
        email: f.email,
        email_confirm: true,
        password: 'Password@123',
        user_metadata: { full_name: f.full_name, role: 'farmer' },
      });
      if (authErr) {
        console.error(`Error creating auth for ${f.email}:`, authErr.message);
        continue;
      }
      userId = createdAuth.user.id;
    }

    // Public users
    await sb.from('users').upsert({
      id: userId,
      email: f.email,
      full_name: f.full_name,
      phone_number: f.phone_number,
      role: 'farmer',
      is_verified: true,
    });

    // Farmer
    const { data: farmerRow, error: fErr } = await sb.from('farmers').upsert({
      user_id: userId,
      state: f.state,
      district: f.district,
      taluka_tehsil: f.taluka_tehsil,
      village: f.village,
      pincode: f.pincode,
      kyc_status: 'verified',
      total_land_area_acres: f.total_land,
    }, { onConflict: 'user_id' }).select().single();

    if (fErr || !farmerRow) {
      console.error(`Farmer insert error for ${f.email}:`, fErr?.message);
      continue;
    }

    // Land record
    await sb.from('land_records').insert({
      farmer_id: farmerRow.id,
      survey_number: `SRV-${f.district.toUpperCase().slice(0, 3)}-${Math.floor(200 + Math.random() * 700)}`,
      area_acres: f.total_land,
      soil_type: f.state.includes('Rajasthan') ? 'alluvial_soil' : 'black_soil',
      is_verified: true,
    });

    // Crop
    const { data: cropRow } = await sb.from('crops').insert({
      farmer_id: farmerRow.id,
      crop_type: f.crop_type,
      variety: f.variety,
      season: f.season,
      sowing_date: new Date(Date.now() - 40 * 86400000).toISOString().split('T')[0],
      expected_harvest_date: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0],
      acreage_allocated: f.acreage,
      estimated_yield_quintals: f.yield_q,
      status: 'vegetative',
    }).select().single();

    if (cropRow) {
      // Batch
      await sb.from('batches').insert({
        crop_id: cropRow.id,
        farmer_id: farmerRow.id,
        batch_code: f.batch_code,
        quantity_kg: f.batch_kg,
        quality_grade: 'grade_a_premium',
        moisture_pct: 8.2,
        oil_content_pct: 42.0,
        foreign_matter_pct: 1.0,
        harvest_date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
        status: 'listed_for_sale',
        base_ask_price_per_kg: f.price_kg,
      });
      console.log(`✓ Created farmer ${f.full_name} in ${f.district} (${f.state}) with ${f.crop_type} (${f.acreage} ac) & batch ${f.batch_code}`);
    }
  }

  // Summary
  const [
    { count: totalFarmers },
    { count: totalCrops },
    { count: totalBatches },
    { data: stateCheck },
  ] = await Promise.all([
    sb.from('farmers').select('*', { count: 'exact', head: true }),
    sb.from('crops').select('*', { count: 'exact', head: true }),
    sb.from('batches').select('*', { count: 'exact', head: true }).not('status', 'in', '("sold")'),
    sb.from('farmers').select('district, state, total_land_area_acres'),
  ]);

  console.log('\n================ UPDATED DATABASE STATE ================');
  console.log(`Total Farmers in Platform:  ${totalFarmers}`);
  console.log(`Total Active Crops in DB:   ${totalCrops}`);
  console.log(`Total Active Batches in DB: ${totalBatches}`);
  console.table(stateCheck);
}

run();
