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
  const { data: crops } = await sb.from('crops').select('id, farmer_id, crop_type, variety, acreage_allocated');

  const BATCH_DEFS = [
    {
      crop_type: 'soybean',
      variety: 'JS-9560',
      batch_code: 'BATCH-MP-IND-SOY-001',
      quantity_kg: 3500,
      quality_grade: 'grade_a_premium',
      base_ask_price_per_kg: 54.0,
      status: 'listed_for_sale',
    },
    {
      crop_type: 'mustard',
      variety: 'Pusa Jai Kisan',
      batch_code: 'BATCH-RJ-BHA-MUST-002',
      quantity_kg: 2800,
      quality_grade: 'grade_a_premium',
      base_ask_price_per_kg: 61.0,
      status: 'listed_for_sale',
    },
    {
      crop_type: 'soybean',
      variety: 'JS-335',
      batch_code: 'BATCH-MH-LAT-SOY-003',
      quantity_kg: 3000,
      quality_grade: 'grade_b_standard',
      base_ask_price_per_kg: 52.0,
      status: 'listed_for_sale',
    },
    {
      crop_type: 'sunflower',
      variety: 'KBSH-53',
      batch_code: 'BATCH-KA-KOP-SUNF-004',
      quantity_kg: 2200,
      quality_grade: 'grade_a_premium',
      base_ask_price_per_kg: 64.0,
      status: 'listed_for_sale',
    },
  ];

  for (const b of BATCH_DEFS) {
    const matchCrop = crops.find(c => c.crop_type === b.crop_type && c.variety === b.variety);
    if (!matchCrop) {
      console.log(`Could not find crop for ${b.crop_type} ${b.variety}`);
      continue;
    }

    const { data: existing } = await sb.from('batches').select('id').eq('batch_code', b.batch_code).maybeSingle();
    if (existing) {
      console.log(`Batch ${b.batch_code} already exists`);
      continue;
    }

    const { data: newBatch, error } = await sb.from('batches').insert({
      crop_id: matchCrop.id,
      farmer_id: matchCrop.farmer_id,
      batch_code: b.batch_code,
      quantity_kg: b.quantity_kg,
      quality_grade: b.quality_grade,
      moisture_pct: 8.5,
      oil_content_pct: 42.0,
      foreign_matter_pct: 1.0,
      harvest_date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
      status: b.status,
      base_ask_price_per_kg: b.base_ask_price_per_kg,
    }).select().single();

    if (error) {
      console.error(`Error inserting batch ${b.batch_code}:`, error.message);
    } else {
      console.log(`Successfully created active batch: ${newBatch.batch_code} (${newBatch.quantity_kg} kg at ₹${newBatch.base_ask_price_per_kg}/kg)`);
    }
  }

  const { count: activeCount } = await sb.from('batches').select('*', { count: 'exact', head: true }).not('status', 'in', '("sold")');
  console.log(`Total active marketplace batches now in DB: ${activeCount}`);
}

run();
