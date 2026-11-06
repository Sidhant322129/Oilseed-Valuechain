/**
 * Automated Database Migration Runner for Supabase
 * Usage: node scripts/deploy-schema.js [DB_PASSWORD]
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PROJECT_REF = 'aiobuiyuarozsbfzonam';

async function tryConnect(connConfig) {
  const client = new Client(connConfig);
  await client.connect();
  return client;
}

async function runMigration() {
  const password = process.argv[2] || process.env.SUPABASE_DB_PASSWORD || 'aienabled@123';
  const encodedPassword = encodeURIComponent(password);

  console.log('🌱 ========================================================');
  console.log('   AI-Enabled Value Chain Platform for Oilseed Self-Reliance');
  console.log('   Executing Week 1 Master Schema Deployment to Supabase');
  console.log('========================================================\n');

  // Candidate connection endpoints
  const connectionCandidates = [
    {
      name: 'Direct Supabase Connection (Port 5432)',
      config: {
        host: `db.${PROJECT_REF}.supabase.co`,
        port: 5432,
        user: 'postgres',
        password: password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      }
    },
    {
      name: 'Direct Supabase Connection (Port 6543)',
      config: {
        host: `db.${PROJECT_REF}.supabase.co`,
        port: 6543,
        user: 'postgres',
        password: password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      }
    },
    {
      name: 'Supabase Session Pooler (aws-0-ap-south-1)',
      config: {
        host: 'aws-0-ap-south-1.pooler.supabase.com',
        port: 5432,
        user: `postgres.${PROJECT_REF}`,
        password: password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      }
    },
    {
      name: 'Supabase Session Pooler (aws-0-ap-southeast-1)',
      config: {
        host: 'aws-0-ap-southeast-1.pooler.supabase.com',
        port: 5432,
        user: `postgres.${PROJECT_REF}`,
        password: password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      }
    },
    {
      name: 'Supabase Session Pooler (aws-0-us-east-1)',
      config: {
        host: 'aws-0-us-east-1.pooler.supabase.com',
        port: 5432,
        user: `postgres.${PROJECT_REF}`,
        password: password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      }
    }
  ];

  let client = null;
  let activeEndpointName = '';

  for (const candidate of connectionCandidates) {
    try {
      console.log(`🔌 Attempting connection via ${candidate.name}...`);
      client = await tryConnect(candidate.config);
      activeEndpointName = candidate.name;
      console.log(`✅ Successfully connected to Supabase PostgreSQL via ${candidate.name}!\n`);
      break;
    } catch (err) {
      console.log(`   ⚠️ Failed (${err.message.trim()}). Trying next endpoint...`);
    }
  }

  if (!client) {
    console.error('\n❌ Could not connect via direct connection or standard poolers.');
    console.error('Please verify your password or network settings, or run 00000_complete_week1_schema.sql in the Supabase SQL Editor.');
    process.exit(1);
  }

  try {
    const schemaPath = path.join(__dirname, '../supabase/migrations/00000_complete_week1_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('🚀 Executing Week 1 Master Schema (14 Tables, RLS, Storage Buckets, Triggers)...');
    await client.query(schemaSql);
    console.log('✅ Master Schema Migration applied successfully!\n');

    const seedPath = path.join(__dirname, '../supabase/seed.sql');
    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      console.log('🌱 Inserting benchmark Mandi Prices, Weather Logs, and Warehouse seed data...');
      await client.query(seedSql);
      console.log('✅ Seed data inserted successfully!\n');
    }

    // Verify all 14 tables
    const tableVerificationQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    const res = await client.query(tableVerificationQuery);
    console.log('📋 Verified Active Public Tables in Database:');
    res.rows.forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.table_name}`);
    });

    console.log('\n🎉 ========================================================');
    console.log('   WEEK 1 DATABASE & STORAGE SETUP IS LIVE ON SUPABASE!');
    console.log('========================================================\n');
  } catch (err) {
    console.error('❌ SQL Execution error:', err.message);
  } finally {
    await client.end();
  }
}

runMigration();
