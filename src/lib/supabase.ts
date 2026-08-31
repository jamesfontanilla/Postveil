import { createClient } from "@supabase/supabase-js";

// These are intentionally public browser values. RLS protects the data; the
// privileged secret key remains server-only in the Cloudflare Worker. Do not
// ship owner-specific fallback values: forks must configure their own project.
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}
