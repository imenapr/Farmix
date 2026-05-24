import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kxdgnygvwnaxfcsljujt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4ZGdueWd2d25heGZjc2xqdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjI4NzAsImV4cCI6MjA5NDU5ODg3MH0.rEoHZAZXcUdadKSD7b7gJuWcl90d72z6KqneK4yLQLQ';

let supabaseClient = null;

/**
 * Get or create Supabase client singleton
 * @returns {SupabaseClient} Initialized Supabase client
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: localStorage,
        storageKey: 'farmix.supabase.session'
      }
    });
  }
  return supabaseClient;
}

/**
 * Get current authenticated user
 * @returns {Promise<{user: AuthUser, session: Session} | {user: null, session: null}>}
 */
export async function getCurrentAuthUser() {
  const client = getSupabaseClient();
  const { data: { user }, data: { session } } = await client.auth.getUser();
  return { user, session };
}

/**
 * Get current session
 * @returns {Promise<Session | null>}
 */
export async function getAuthSession() {
  const client = getSupabaseClient();
  const { data: { session } } = await client.auth.getSession();
  return session;
}

/**
 * Watch for auth state changes
 * @param {Function} callback - Called when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  const client = getSupabaseClient();
  const { data: { subscription } } = client.auth.onAuthStateChange(
    (event, session) => callback(event, session)
  );
  return () => subscription?.unsubscribe();
}

export default getSupabaseClient();
