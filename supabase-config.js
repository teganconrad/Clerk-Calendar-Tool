import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// TODO: Replace with your project values from Supabase > Project Settings > API
// Example: https://xyzcompany.supabase.co
export const SUPABASE_URL = 'YOUR_SUPABASE_URL';

// TODO: Replace with your public anon key from Supabase > Project Settings > API
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const hasSupabaseKeys =
  SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

export const supabase = hasSupabaseKeys
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
