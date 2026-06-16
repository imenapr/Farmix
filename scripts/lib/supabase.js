import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const SUPABASE_URL = "https://kxdgnygvwnaxfcsljujt.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4ZGdueWd2d25heGZjc2xqdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjI4NzAsImV4cCI6MjA5NDU5ODg3MH0.rEoHZAZXcUdadKSD7b7gJuWcl90d72z6KqneK4yLQLQ";

/** Session storage key used internally by Supabase Auth (non-authoritative cache). */
export const SUPABASE_SESSION_KEY = "farmix.supabase.session";

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

export function getSupabase() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: SUPABASE_SESSION_KEY,
      },
    });
  }
  return client;
}
