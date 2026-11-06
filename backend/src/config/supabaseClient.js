// src/config/supabaseClient.js
// Initialises two Supabase clients:
//   - adminClient: uses SERVICE_ROLE key (bypasses RLS — server-side only)
//   - anonClient:  uses ANON key (for auth.getUser() token verification)
//
// Node.js v20 fix: native WebSocket is not built-in until Node 22.
// @supabase/realtime-js checks globalThis.WebSocket at startup.
// We polyfill it with the 'ws' package before calling createClient().

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import ws from 'ws';

// ── Polyfill WebSocket for Node 20 ──────────────────────────────────────────
// Must happen BEFORE createClient() is called.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = ws;
}

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env first, then root .env.local, then root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isPlaceholder = (val) => !val || val.includes('your-project-id') || val.includes('your-supabase-');

const SUPABASE_URL = !isPlaceholder(rawUrl) ? rawUrl : 'https://aiobuiyuarozsbfzonam.supabase.co';
const SUPABASE_ANON_KEY = !isPlaceholder(rawAnonKey) ? rawAnonKey : 'dummy-anon-key';
const SUPABASE_SERVICE_ROLE_KEY = !isPlaceholder(rawServiceKey) ? rawServiceKey : SUPABASE_ANON_KEY;

const BASE_OPTIONS = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

// Service-role client — bypasses RLS for privileged server operations.
// NEVER expose this key or this client to the frontend.
export const adminClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BASE_OPTIONS
);

// Anon client — used to verify JWTs via auth.getUser(token).
// Supabase validates the JWT signature server-side in this call.
export const anonClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  BASE_OPTIONS
);


