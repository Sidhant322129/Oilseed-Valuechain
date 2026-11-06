/**
 * Database & Supabase Health Check Script
 * Usage: npx ts-node scripts/test-db-connection.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aiobuiyuarozsbfzonam.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function testConnection() {
  console.log('🌱 ====================================================');
  console.log('   AI-Enabled Value Chain Platform for Oilseed Self-Reliance');
  console.log('   Week 1: Supabase Database & Storage Verification');
  console.log('====================================================\n');

  console.log(`📡 Connecting to Supabase Project: ${supabaseUrl}`);

  if (!supabaseAnonKey) {
    console.log('⚠️  Warning: NEXT_PUBLIC_SUPABASE_ANON_KEY is empty in your environment.');
    console.log('👉 Please add it to your .env.local file from your Supabase Dashboard (Settings -> API).\n');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const tablesToCheck = [
    'users',
    'farmers',
    'land_records',
    'crops',
    'batches',
    'orders',
    'warehouses',
    'logistics',
    'price_history',
    'weather_logs',
    'pest_reports',
    'loan_applications',
    'insurance_claims',
    'notifications',
  ];

  console.log(`📋 Checking 14 Database Tables...`);
  for (const table of tablesToCheck) {
    const { error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`   ❌ Table [${table}]: Error (${error.message})`);
    } else {
      console.log(`   ✅ Table [${table}]: Active & accessible`);
    }
  }

  console.log(`\n📦 Checking Storage Buckets...`);
  const bucketsToCheck = ['crop-images', 'documents', 'ml-models'];
  for (const bucket of bucketsToCheck) {
    const { data, error } = await supabase.storage.getBucket(bucket);
    if (error) {
      console.log(`   ❌ Bucket [${bucket}]: ${error.message}`);
    } else {
      console.log(`   ✅ Bucket [${bucket}]: Verified (${data.public ? 'Public' : 'Private'})`);
    }
  }

  console.log('\n✨ Database and Storage check completed.');
}

testConnection().catch(console.error);
