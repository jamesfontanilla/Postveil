import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// These are intentionally public browser values. RLS protects the data; the
// privileged secret key remains server-only in the Cloudflare Worker. Do not
// ship owner-specific fallback values: forks must configure their own project.
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export let supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

type RuntimeSupabaseConfig = {
  supabaseUrl?: unknown;
  supabaseAnonKey?: unknown;
};

/**
 * Worker deployments can provide the browser-safe Supabase values at runtime.
 * This keeps the static bundle forkable while never exposing service keys.
 */
export async function initializeSupabase(): Promise<SupabaseClient | null> {
  if (supabase) return supabase;

  try {
    const response = await fetch("/api/client-config", { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const config = await response.json() as RuntimeSupabaseConfig;
    const runtimeUrl = typeof config.supabaseUrl === "string" ? config.supabaseUrl.trim() : "";
    const runtimeKey = typeof config.supabaseAnonKey === "string" ? config.supabaseAnonKey.trim() : "";
    if (!runtimeUrl || !runtimeKey) return null;
    supabase = createClient(runtimeUrl, runtimeKey);
    return supabase;
  } catch {
    return null;
  }
}

export function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}
