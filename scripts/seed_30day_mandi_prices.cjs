// scripts/seed_30day_mandi_prices.cjs
// Populates a complete, continuous 30-day APMC Mandi price history
// across all 7 oilseed commodities in key APMC markets.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../backend/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
loadEnv();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://aiobuiyuarozsbfzonam.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MANDI_DIRECTORY = [
  { crop: 'mustard', mandi: 'Kota APMC Yard', district: 'Kota', state: 'Rajasthan', variety: 'Pusa Bold', basePrice: 6280, volatility: 35 },
  { crop: 'mustard', mandi: 'Morena Central Mandi', district: 'Morena', state: 'Madhya Pradesh', variety: 'Varuna', basePrice: 6220, volatility: 40 },
  { crop: 'mustard', mandi: 'Bikaner Grain Market', district: 'Bikaner', state: 'Rajasthan', variety: 'Pusa Jai Kisan', basePrice: 6310, volatility: 30 },

  { crop: 'soybean', mandi: 'Ujjain Krishi Upaj Mandi', district: 'Ujjain', state: 'Madhya Pradesh', variety: 'JS 20-34', basePrice: 5120, volatility: 25 },
  { crop: 'soybean', mandi: 'Indore APMC Market', district: 'Indore', state: 'Madhya Pradesh', variety: 'JS-335', basePrice: 5190, volatility: 30 },
  { crop: 'soybean', mandi: 'Latur Oilseed Mandi', district: 'Latur', state: 'Maharashtra', variety: 'MACS 1407', basePrice: 5240, volatility: 35 },

  { crop: 'groundnut', mandi: 'Rajkot Marketing Yard', district: 'Rajkot', state: 'Gujarat', variety: 'Girnar-4', basePrice: 7180, volatility: 45 },
  { crop: 'groundnut', mandi: 'Junagadh Mandi', district: 'Junagadh', state: 'Gujarat', variety: 'GG-20', basePrice: 7120, volatility: 40 },
  { crop: 'groundnut', mandi: 'Kurnool APMC', district: 'Kurnool', state: 'Andhra Pradesh', variety: 'Kadiri-6', basePrice: 7060, volatility: 35 },

  { crop: 'sunflower', mandi: 'Koppal Agro Market', district: 'Koppal', state: 'Karnataka', variety: 'KBHS-53', basePrice: 7620, volatility: 50 },
  { crop: 'sunflower', mandi: 'Latur APMC', district: 'Latur', state: 'Maharashtra', variety: 'KBSH-44', basePrice: 7580, volatility: 45 },

  { crop: 'sesame', mandi: 'Bikaner Grain Mandi', district: 'Bikaner', state: 'Rajasthan', variety: 'RT-351 White', basePrice: 13400, volatility: 120 },
  { crop: 'sesame', mandi: 'Rajkot APMC', district: 'Rajkot', state: 'Gujarat', variety: 'Gujarat Til-3', basePrice: 13850, volatility: 140 },

  { crop: 'safflower', mandi: 'Solapur Market Yard', district: 'Solapur', state: 'Maharashtra', variety: 'Bhima (Kusum)', basePrice: 6080, volatility: 35 },
  { crop: 'safflower', mandi: 'Latur APMC', district: 'Latur', state: 'Maharashtra', variety: 'Phule Kusuma', basePrice: 6140, volatility: 40 },

  { crop: 'castor', mandi: 'Palanpur Market Yard', district: 'Banaskantha', state: 'Gujarat', variety: 'GCH-7', basePrice: 6380, volatility: 35 },
  { crop: 'castor', mandi: 'Kurnool APMC', district: 'Kurnool', state: 'Andhra Pradesh', variety: 'DCH-519', basePrice: 6320, volatility: 30 },
];

async function seed30DayPrices() {
  console.log('🚀 Starting 30-Day Mandi Price Backfill...');

  const today = new Date('2026-09-13T00:00:00Z');
  const rows = [];

  // Generate 30 continuous dates from day -29 to day 0
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const d = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];

    // Slight time-series drift based on sinusoidal wave + offset
    const timeProgress = (29 - dayOffset) / 29; // 0 to 1
    const trendFactor = Math.sin(timeProgress * Math.PI * 2) * 0.03; // +/- 3% gradual seasonal arc

    for (const item of MANDI_DIRECTORY) {
      // Random daily walk around base price
      const dailyNoise = ((Math.random() - 0.48) * item.volatility * 2);
      const modal = Math.round(item.basePrice * (1 + trendFactor) + dailyNoise);
      const min = Math.round(modal * 0.965);
      const max = Math.round(modal * 1.035);
      const arrivals = Math.round(25 + Math.random() * 80);

      rows.push({
        crop_type: item.crop,
        variety: item.variety,
        mandi_name: item.mandi,
        state: item.state,
        district: item.district,
        modal_price_per_quintal: modal,
        min_price_per_quintal: min,
        max_price_per_quintal: max,
        arrival_quantity_tonnes: arrivals,
        price_date: dateStr,
      });
    }
  }

  console.log(`Prepared ${rows.length} records across 30 consecutive days for all oilseeds.`);

  // Insert in batches of 100 to avoid payload limits
  const BATCH_SIZE = 100;
  let insertedCount = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('price_history')
      .upsert(chunk, { onConflict: 'crop_type,mandi_name,price_date', ignoreDuplicates: true });

    if (error) {
      console.warn(`Chunk ${i / BATCH_SIZE + 1} notice:`, error.message);
      // Fallback: try direct insert
      const { error: insErr } = await supabase.from('price_history').insert(chunk);
      if (insErr) console.error('Insert fallback err:', insErr.message);
      else insertedCount += chunk.length;
    } else {
      insertedCount += chunk.length;
    }
  }

  console.log(`✅ Backfill complete! Processed ${insertedCount} daily records.`);

  // Verify total dates in DB
  const { data: dbData } = await supabase
    .from('price_history')
    .select('price_date')
    .order('price_date', { ascending: true });

  const uniqueDates = [...new Set(dbData.map(r => r.price_date))];
  console.log(`📊 Distinct Dates in DB: ${uniqueDates.length} days (Earliest: ${uniqueDates[0]}, Latest: ${uniqueDates[uniqueDates.length - 1]})`);
}

seed30DayPrices().catch(console.error);
