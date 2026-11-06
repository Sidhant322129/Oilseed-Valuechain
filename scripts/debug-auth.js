import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read env vars
const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match && !line.startsWith('#')) {
    env[match[1]] = match[2]?.trim() || '';
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('URL:', supabaseUrl);
console.log('Key (first 30):', supabaseAnonKey?.slice(0, 30) + '...');
console.log('');

const client = createClient(supabaseUrl, supabaseAnonKey);

console.log('Testing Email OTP send...');
const { data, error } = await client.auth.signInWithOtp({
  email: 'test-debug@example.com',
  options: {
    shouldCreateUser: true,
    data: { role: 'farmer', full_name: 'Test User' },
  },
});

if (error) {
  console.log('\n❌ FULL ERROR OBJECT:');
  console.log(JSON.stringify(error, null, 2));
  console.log('\nError keys:', Object.keys(error));
  console.log('error.message:', error.message);
  console.log('error.status:', error.status);
  console.log('error.code:', error.code);
} else {
  console.log('\n✅ OTP send SUCCESS:', data);
}
