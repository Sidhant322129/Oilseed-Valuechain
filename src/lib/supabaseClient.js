import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://aiobuiyuarozsbfzonam.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(
  supabaseAnonKey && supabaseAnonKey !== 'your-supabase-anon-key-here'
);

if (!isSupabaseConfigured) {
  console.warn(
    '⚠️ Supabase Anon Key is not set or using placeholder. Please configure VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

// Fallback dummy key to prevent @supabase/supabase-js from throwing on initialization
const validKey = isSupabaseConfigured ? supabaseAnonKey : 'dummy-anon-key-for-init';

export const supabase = createClient(supabaseUrl, validKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Expose to DevTools console in development only
if (import.meta.env.DEV) {
  window.supabase = supabase;
}
