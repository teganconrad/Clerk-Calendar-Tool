import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://gtdgoimxezetcwkzwuxq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZGdvaW14ZXpldGN3a3p3dXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTY3MzcsImV4cCI6MjA4OTE3MjczN30.2FWE2TlmEVnZyRBFWU-CRJa0WzoBX8eqaIpP4rEODQ4';

export const hasSupabaseKeys =
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('PASTE_') &&
  !SUPABASE_ANON_KEY.includes('PASTE_');

export const supabase = hasSupabaseKeys
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;