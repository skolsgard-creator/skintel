import { createClient } from "@supabase/supabase-js";

// En klient, med den publika nyckeln. Behörigheten avgörs av RLS och
// definer-funktionerna i databasen -- aldrig här. Service-role finns bara i
// edge-funktionerna.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("VITE_SUPABASE_URL och VITE_SUPABASE_PUBLISHABLE_KEY saknas i .env");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
