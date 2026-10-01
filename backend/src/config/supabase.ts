import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is required when AUTH_PROVIDER=supabase.');
  return url;
}

export function getSupabaseAuthClient(): SupabaseClient {
  if (!authClient) {
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!key) throw new Error('SUPABASE_PUBLISHABLE_KEY is required when AUTH_PROVIDER=supabase.');
    authClient = createClient(getSupabaseUrl(), key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return authClient;
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (!adminClient) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required by the backend.');
    adminClient = createClient(getSupabaseUrl(), key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export function isSupabaseAuthEnabled(): boolean {
  return (process.env.AUTH_PROVIDER || 'jwt').toLowerCase() === 'supabase';
}
