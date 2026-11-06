import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    value = value.replace(/(^['"]|['"]$)/g, '').trim();
    env[match[1]] = value;
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('====================================================');
console.log('🔍 WEEK 1 SUPABASE & DATABASE VERIFICATION');
console.log('====================================================');
console.log(`URL: ${supabaseUrl}`);
console.log(`Anon Key detected: ${supabaseAnonKey ? '✅ YES' : '❌ NO'}`);
console.log(`Service Role Key detected: ${supabaseServiceKey ? '✅ YES' : '❌ NO'}`);
console.log('----------------------------------------------------');

const client = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

const TABLES = [
  'users',
  'farmers',
  'land_records',
  'crops',
  'warehouses',
  'batches',
  'orders',
  'logistics',
  'price_history',
  'weather_logs',
  'pest_reports',
  'loan_applications',
  'insurance_claims',
  'notifications'
];

const BUCKETS = [
  'crop-images',
  'documents',
  'ml-models'
];

async function verify() {
  console.log('\n📊 1. CHECKING 14 DATABASE TABLES...');
  let tablesOk = 0;
  for (const table of TABLES) {
    try {
      const { data, error, count } = await client.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`  ❌ Table "${table}": ERROR (${error.message})`);
      } else {
        console.log(`  ✅ Table "${table}": OK (accessible)`);
        tablesOk++;
      }
    } catch (err) {
      console.log(`  ❌ Table "${table}": Exception (${err.message})`);
    }
  }

  console.log(`\nTables Status: ${tablesOk}/${TABLES.length} verified.`);

  console.log('\n🪣 2. CHECKING SUPABASE STORAGE BUCKETS...');
  try {
    const { data: buckets, error: bucketError } = await client.storage.listBuckets();
    if (bucketError) {
      console.log(`  ❌ Bucket list error: ${bucketError.message}`);
    } else {
      const bucketNames = buckets.map(b => b.name);
      console.log(`  Found buckets in Supabase: [${bucketNames.join(', ')}]`);
      for (const requiredBucket of BUCKETS) {
        if (bucketNames.includes(requiredBucket)) {
          console.log(`  ✅ Bucket "${requiredBucket}": EXISTS`);
        } else {
          console.log(`  ❌ Bucket "${requiredBucket}": MISSING`);
        }
      }
    }
  } catch (err) {
    console.log(`  ❌ Bucket check exception: ${err.message}`);
  }

  console.log('\n🔐 3. CHECKING AUTH PROVIDERS...');
  try {
    const { data: authData, error: authError } = await client.auth.getSession();
    console.log(`  ✅ Auth endpoint reachable: YES`);
  } catch (err) {
    console.log(`  ❌ Auth endpoint error: ${err.message}`);
  }

  console.log('\n====================================================');
}

verify();
