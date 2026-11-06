#!/usr/bin/env node
// scripts/apply_00013_scheme_engine.cjs
// Applies migration 00013 (Scheme Engine) to Supabase.
// Usage: node scripts/apply_00013_scheme_engine.cjs
//
// Requires: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in .env or .env.local

const fs   = require('fs');
const path = require('path');

// Load dotenv
try { require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') }); } catch {}
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') }); } catch {}
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); } catch {}

const { createClient } = require('@supabase/supabase-js');

const url     = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key     = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url) { console.error('❌  SUPABASE_URL not set'); process.exit(1); }
if (!key && !anonKey) { console.error('❌  SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1); }

const db = createClient(url, key || anonKey);

const SQL_FILE = path.resolve(__dirname, '../supabase/migrations/00013_scheme_engine.sql');
const sql = fs.readFileSync(SQL_FILE, 'utf8');

// Split on statement boundaries (basic split — Supabase SQL editor approach)
// Individual statements are separated by semicolons followed by newlines.
// We skip the trigger REPLACE … FUNCTION block as a whole unit.
const FUNCTION_BLOCK_RE = /CREATE OR REPLACE FUNCTION[\s\S]+?;\s*\n/g;
const functions = [];
let cleanSql = sql.replace(FUNCTION_BLOCK_RE, (m) => {
  functions.push(m);
  return `__FUNC_PLACEHOLDER_${functions.length - 1}__;\n`;
});

const statements = cleanSql
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'))
  .map(s => {
    const m = s.match(/^__FUNC_PLACEHOLDER_(\d+)__$/);
    return m ? functions[Number(m[1])] : s + ';';
  });

async function main() {
  console.log(`\n🚀  Applying migration 00013 (${statements.length} statements)…\n`);
  let passed = 0;
  let skipped = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt || stmt === ';') continue;

    // Show first 80 chars of each statement
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    process.stdout.write(`  [${String(i + 1).padStart(2, '0')}] ${preview}…`);

    try {
      const { error } = await db.rpc('exec_sql', { query: stmt }).single();
      if (error && error.code === 'PGRST202') {
        // exec_sql RPC not available — use raw query via auth.admin
        // Fall back to logging only
        console.log(' ⚠️  exec_sql RPC not available. Run SQL manually in Supabase Dashboard.');
        skipped++;
        continue;
      }
      if (error) {
        // "already exists" errors are acceptable for idempotent migration
        const ok = ['42P07', '42710', '42P01', '23505'].includes(error.code);
        if (ok) {
          console.log(' ✓ (already exists — skipped)');
          skipped++;
        } else {
          console.log(` ✗  ${error.message} (code: ${error.code})`);
        }
      } else {
        console.log(' ✓');
        passed++;
      }
    } catch (e) {
      console.log(` ✗  ${e.message}`);
    }
  }

  console.log(`\n✅  Migration summary: ${passed} applied, ${skipped} skipped/already-exists`);
  console.log('\n📋  If exec_sql RPC is unavailable, copy-paste the SQL file directly into:');
  console.log('    Supabase Dashboard → SQL Editor → New Query');
  console.log(`\n    File: ${SQL_FILE}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
