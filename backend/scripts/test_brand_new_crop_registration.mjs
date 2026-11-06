import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function registerCropLive() {
  console.log('1. Generating fresh magic link session for farmer Sidhant...');
  const { data: linkData, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'sidhanthansda3221@gmail.com'
  });
  if (lErr) throw lErr;
  
  const otp = linkData.properties.email_otp;
  const { data: sessionData, error: vErr } = await supabaseAnon.auth.verifyOtp({
    email: 'sidhanthansda3221@gmail.com',
    token: otp,
    type: 'magiclink'
  });
  if (vErr) throw vErr;
  
  const token = sessionData.session.access_token;
  console.log('2. Farmer authenticated with valid JWT. Calling POST http://localhost:5000/api/crops...');

  const cropPayload = {
    farmer_id: 'f7f2d62f-320d-4674-897d-3f465d0ab0d1',
    crop_type: 'groundnut',
    variety: 'Girnar-4',
    season: 'kharif',
    sowing_date: '2026-09-14',
    expected_harvest_date: '2026-12-25',
    acreage_allocated: 3.5,
    estimated_yield_quintals: 35
  };

  const startTime = Date.now();
  const response = await fetch('http://localhost:5000/api/crops', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(cropPayload)
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const json = await response.json();
  console.log(`3. Crop API responded in ${durationSec}s with HTTP ${response.status}:`, JSON.stringify(json, null, 2));

  const cropId = json.crop?.id;
  if (cropId) {
    console.log('4. Querying Supabase batches table for the newly created batch linked to crop:', cropId);
    const { data: batchRows, error: bErr } = await supabaseAdmin
      .from('batches')
      .select('*')
      .eq('crop_id', cropId);
    console.log('5. Live Supabase Batch Row in DB:', JSON.stringify(batchRows, null, 2));
  }
}

registerCropLive().catch(console.error);
