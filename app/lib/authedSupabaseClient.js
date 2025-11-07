// app/lib/authedSupabaseClient.js
// Returns a memoized Supabase client that adds Authorization header from session token.
// Ensures a single GoTrue client per token to avoid warnings.

import { createClient } from "@supabase/supabase-js";
import baseSupabase from "./supabaseClient";

const cacheByToken = new Map(); // token -> supabase client

export function getAuthedClient() {
  if (typeof window === "undefined") return baseSupabase;
  try {
    const s = sessionStorage.getItem("userData");
    const token = s ? JSON.parse(s)?.token : null;
    if (!token) return baseSupabase;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return baseSupabase;

    // Only attach Authorization when the token looks like a Supabase GoTrue token
    const looksSupabase = (() => {
      try {
        const parts = String(token).split(".");
        if (parts.length !== 3) return false;
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
        const payload = JSON.parse(atob(b64 + pad));
        const role = payload?.role || payload?.app_metadata?.role;
        // Accept ONLY Supabase roles that are known to PostgREST
        return role === "authenticated" || role === "service_role";
      } catch (_) {
        return false;
      }
    })();

    if (!looksSupabase) {
      // Fallback to anon client to avoid PostgREST role errors in production
      return baseSupabase;
    }

    let cli = cacheByToken.get(token);
    if (!cli) {
      const short = (url || '').slice(-6) + '-' + String(token).slice(-6);
      cli = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: {
          persistSession: false,
          detectSessionInUrl: false,
          storageKey: `sb-authed-${short}`,
          // Avoid touching localStorage entirely to silence GoTrue storage conflicts
          storage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          },
        },
      });
      cacheByToken.set(token, cli);
    }
    return cli;
  } catch (_) {
    return baseSupabase;
  }
}

export default getAuthedClient;
