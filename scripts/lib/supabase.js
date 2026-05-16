import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL      = "https://fpgvgetxtifenmqchdlw.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZ3ZnZXR4dGlmZW5tcWNoZGx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MzQxMTEsImV4cCI6MjA5MTMxMDExMX0.KwtiIGYfAlk3Jp1BG4SaHrUd6FXRM-RZfdt55tvLkbY";

// Supabase stores its session at this localStorage key — read synchronously in initAuthSession()
export const SUPABASE_SESSION_KEY = "farmix.supabase.session";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession    : true,
    autoRefreshToken  : true,
    storageKey        : SUPABASE_SESSION_KEY,
  },
});
