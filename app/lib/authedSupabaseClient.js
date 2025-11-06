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

