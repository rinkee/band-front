// lib/excludedCustomersCache.js - 제외고객 목록 공유 캐시
import supabase from "./supabaseClient";

const excludedCustomersCache = new Map();

/**
 * 제외고객 목록 조회 (전역 캐시)
 */
export const fetchExcludedCustomers = async (userId) => {
  if (!userId) return [];

  if (excludedCustomersCache.has(userId)) {
    return excludedCustomersCache.get(userId);
  }

  try {
    const { data: userData, error } = await supabase
      .from("users")
      .select("excluded_customers")
      .eq("user_id", userId)
      .single();

    if (!error && userData?.excluded_customers && Array.isArray(userData.excluded_customers)) {
      const names = userData.excluded_customers.filter(
        (n) => typeof n === "string" && n.trim().length > 0
      );
      excludedCustomersCache.set(userId, names);
      return names;
    }
  } catch (_) {
    // ignore
  }

  excludedCustomersCache.set(userId, []);
  return [];
};

/**
 * 캐시 무효화 (설정 변경 시 사용)
 */
export const invalidateExcludedCustomersCache = (userId) => {
  if (userId) {
    excludedCustomersCache.delete(userId);
  } else {
    excludedCustomersCache.clear();
  }
};

export default fetchExcludedCustomers;
