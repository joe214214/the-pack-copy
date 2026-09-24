import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client, for server-side work that must not be subject
 * to a end-user's row-level security — currently object storage.
 *
 * This is NOT the same thing as `./server.ts`, which is the cookie-bound SSR
 * client that acts as whoever is signed in. That one cannot write to storage.
 *
 * The service-role key bypasses every policy, so this module must never be
 * imported from client code. Nothing here is exported to the browser: the key
 * has no NEXT_PUBLIC_ prefix, so a client-side import fails the build rather
 * than leaking it.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase storage is not configured: NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY must both be set."
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
