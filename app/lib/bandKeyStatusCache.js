export const BAND_KEY_STATUS_CACHE_KEY = "bandKeyStatus";
export const BAND_KEY_STATUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5분

export function readBandKeyStatusCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BAND_KEY_STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_) {
    try {
      sessionStorage.removeItem(BAND_KEY_STATUS_CACHE_KEY);
    } catch (_) {}
    return null;
  }
}

export function isBandKeyStatusCacheFresh(cache, ttlMs = BAND_KEY_STATUS_CACHE_TTL_MS) {
  const updatedAt = cache?.updated_at;
  if (!updatedAt) return false;
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ttlMs;
}

export function writeBandKeyStatusCache({ current_band_key_index = 0, backup_band_keys = null } = {}) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      BAND_KEY_STATUS_CACHE_KEY,
      JSON.stringify({
        current_band_key_index: current_band_key_index ?? 0,
        backup_band_keys: backup_band_keys ?? null,
        updated_at: new Date().toISOString(),
      })
    );
  } catch (_) {}
}

export async function fetchBandKeyStatusFromDb(supabase, userId) {
  const { data, error } = await supabase
    .from("users")
    .select("current_band_key_index, backup_band_keys")
    .eq("user_id", userId)
    .single();

  if (error) throw error;

  return {
    current_band_key_index: data?.current_band_key_index ?? 0,
    backup_band_keys: data?.backup_band_keys ?? null,
    updated_at: new Date().toISOString(),
  };
}

