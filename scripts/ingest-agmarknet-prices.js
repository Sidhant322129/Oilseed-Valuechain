// scripts/ingest-agmarknet-prices.js
// One-shot AGMARKNET price ingestion script.
// Run with: node scripts/ingest-agmarknet-prices.js
// (from the project root — uses .env.local and backend/.env automatically)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../backend/.env'));
loadEnvFile(path.resolve(__dirname, '../.env.local'));
loadEnvFile(path.resolve(__dirname, '../.env'));

import { createClient } from '@supabase/supabase-js';

const AGMARKNET_RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const AGMARKNET_BASE_URL = 'https://api.data.gov.in/resource';

const OILSEED_COMMODITIES = [
  { apiName: 'Mustard',   cropType: 'mustard'   },
  { apiName: 'Soyabean',  cropType: 'soybean'   },
  { apiName: 'Groundnut', cropType: 'groundnut' },
  { apiName: 'Sunflower', cropType: 'sunflower' },
  { apiName: 'Sesamum',   cropType: 'sesame'    },
  { apiName: 'Safflower', cropType: 'safflower' },
];

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseArrivalDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

async function fetchCommodityPrices(apiName, limit = 100) {
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey) throw new Error('DATA_GOV_API_KEY is not set');

  const params = new URLSearchParams({
    'api-key': apiKey,
    format: 'json',
    limit: String(limit),
    'filters[commodity]': apiName,
  });

  const res = await fetch(`${AGMARKNET_BASE_URL}/${AGMARKNET_RESOURCE_ID}?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${apiName}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  return Array.isArray(json.records) ? json.records : [];
}

async function main() {
  console.log('\n🌾 AGMARKNET Price Ingestion Starting…\n');
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey) {
    console.error('❌ DATA_GOV_API_KEY is not set. Add it to backend/.env or .env.local');
    process.exit(1);
  }

  const totalResult = {};

  for (const { apiName, cropType } of OILSEED_COMMODITIES) {
    try {
      console.log(`📡 Fetching ${apiName}…`);
      const records = await fetchCommodityPrices(apiName, 100);
      console.log(`   Got ${records.length} records from API`);

      let inserted = 0, skipped = 0, errors = 0;

      for (const rec of records) {
        const priceDate = parseArrivalDate(rec.arrival_date);
        if (!priceDate) { skipped++; continue; }

        const modal = Number(rec.modal_price);
        const min   = Number(rec.min_price);
        const max   = Number(rec.max_price);
        if (!modal || modal <= 0 || !min || min <= 0 || !max || max < min) { skipped++; continue; }

        const mandiName = (rec.market || '').trim();
        const state     = (rec.state || '').trim();
        const district  = (rec.district || '').trim();
        const variety   = (rec.variety || '').trim() || null;
        if (!mandiName || !state || !district) { skipped++; continue; }

        // Check for duplicate
        const { data: existing } = await supabase
          .from('price_history')
          .select('id')
          .eq('crop_type', cropType)
          .eq('mandi_name', mandiName)
          .eq('price_date', priceDate)
          .maybeSingle();

        if (existing) { skipped++; continue; }

        const { error: err } = await supabase.from('price_history').insert({
          crop_type:                cropType,
          variety,
          mandi_name:               mandiName,
          state,
          district,
          modal_price_per_quintal:  modal,
          min_price_per_quintal:    min,
          max_price_per_quintal:    max,
          arrival_quantity_tonnes:  0,
          price_date:               priceDate,
          source:                   'Agmarknet API',
        });

        if (err) {
          console.warn(`   ⚠️  Insert error ${cropType}/${mandiName}/${priceDate}: ${err.message}`);
          errors++;
        } else {
          inserted++;
        }
      }

      totalResult[cropType] = { fetched: records.length, inserted, skipped, errors };
      console.log(`   ✅ ${apiName}: inserted=${inserted}, skipped=${skipped}, errors=${errors}`);

    } catch (err) {
      console.error(`   ❌ ${apiName}: ${err.message}`);
      totalResult[cropType] = { fetched: 0, inserted: 0, skipped: 0, errors: 1, errorMsg: err.message };
    }
  }

  console.log('\n📊 Final Summary:');
  for (const [crop, stat] of Object.entries(totalResult)) {
    console.log(`   ${crop}: fetched=${stat.fetched} inserted=${stat.inserted} skipped=${stat.skipped} errors=${stat.errors}`);
  }
  console.log('\n✅ Ingestion complete.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
