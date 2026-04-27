// app/lib/swrCache.js
// SWR key helpers + cross-cutting cache invalidation utilities.

export const ORDER_STATS_LOCAL_CACHE_PREFIX = "order-stats-cache:";
export const POSTS_CACHE_STALE_EVENT = "posts-cache-stale";
export const POSTS_CACHE_STALE_LOCAL_CACHE_PREFIX = "posts-cache-stale:";

export function stableJsonStringify(value) {
  if (!value || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  const normalized = {};
  Object.keys(value)
    .sort()
    .forEach((key) => {
      const v = value[key];
      if (v !== undefined) normalized[key] = v;
    });

  return JSON.stringify(normalized);
}

export function parseJsonIfString(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

export function getFunctionsBaseUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/functions/v1`;
}

const getPostsCacheStaleKey = (userId) =>
  userId ? `${POSTS_CACHE_STALE_LOCAL_CACHE_PREFIX}${userId}` : null;

const getBrowserLocalStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
};

const dispatchBrowserEvent = (eventName, detail) => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  const event =
    typeof CustomEvent === "function"
      ? new CustomEvent(eventName, { detail })
      : { type: eventName, detail };

  window.dispatchEvent(event);
};

export function readPostsCacheStale(userId) {
  const storage = getBrowserLocalStorage();
  const key = getPostsCacheStaleKey(userId);
  if (!storage || !key) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.userId !== userId || typeof parsed.savedAt !== "number") {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

export function markPostsCacheStale(userId, detail = {}) {
  const storage = getBrowserLocalStorage();
  const key = getPostsCacheStaleKey(userId);
  if (!storage || !key) return null;

  const previous = readPostsCacheStale(userId);
  const now = Date.now();
  const savedAt = previous?.savedAt && previous.savedAt >= now ? previous.savedAt + 1 : now;
  const marker = {
    ...detail,
    userId,
    savedAt
  };

  try {
    storage.setItem(key, JSON.stringify(marker));
  } catch (_) {
    return null;
  }

  dispatchBrowserEvent(POSTS_CACHE_STALE_EVENT, marker);
  return marker;
}

export function clearPostsCacheStale(userId, savedAt = null) {
  const storage = getBrowserLocalStorage();
  const key = getPostsCacheStaleKey(userId);
  if (!storage || !key) return false;

  const current = readPostsCacheStale(userId);
  if (!current) return false;
  if (savedAt !== null && current.savedAt > savedAt) return false;

  try {
    storage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
}

export function invalidateOrderStatsLocalCache(userId) {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const prefix = userId
      ? `${ORDER_STATS_LOCAL_CACHE_PREFIX}${userId}:`
      : ORDER_STATS_LOCAL_CACHE_PREFIX;

    const toRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) toRemove.push(key);
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch (_) {
    // localStorage 접근/용량 이슈는 UX를 막지 않도록 무시
  }
}

export async function revalidateUserCaches(
  mutate,
  {
    userId,
    bandNumber = null,
    mutateOptions = { revalidate: true },
    invalidateOrderStats = false,
    includeOrders = true,
    includeProducts = true,
    includePosts = true,
    includeOrderStats = true,
    includeCommentOrders = true,
  } = {}
) {
  if (typeof mutate !== "function" || !userId) return [];

  if (invalidateOrderStats) {
    invalidateOrderStatsLocalCache(userId);
  }

  const functionsBaseUrl = getFunctionsBaseUrl();
  const tasks = [];

  // Orders: Edge Function string keys + SWR array keys + legacy /api routes.
  if (includeOrders) {
    tasks.push(
      mutate(
        (key) => {
          if (typeof key === "string") {
            if (key === "/api/orders") return true;
            if (key.startsWith(`/api/orders?userId=${userId}`)) return true;
            if (
              functionsBaseUrl &&
              key.startsWith(`${functionsBaseUrl}/orders-get-all?userId=${userId}`)
            ) {
              return true;
            }
          }
          if (Array.isArray(key) && key[0] === "orders" && key[1] === userId) {
            return true;
          }
          return false;
        },
        undefined,
        mutateOptions
      )
    );
  }

  // Products: Edge Function string keys + SWR array keys + legacy /api routes.
  if (includeProducts) {
    tasks.push(
      mutate(
        (key) => {
          if (typeof key === "string") {
            if (key === "/api/products") return true;
            if (
              functionsBaseUrl &&
              key.startsWith(`${functionsBaseUrl}/products-get-all?userId=${userId}`)
            ) {
              return true;
            }
          }
          if (Array.isArray(key) && key[0] === "products" && key[1] === userId) {
            return true;
          }
          return false;
        },
        undefined,
        mutateOptions
      )
    );
  }

  // Posts: bandNumber가 있으면 해당 band만, 없으면 모든 band.
  if (includePosts) {
    tasks.push(
      mutate(
        (key) => {
          if (typeof key === "string") {
            // posts 관련 API route는 형태가 다양하므로 prefix로 묶어서 처리
            if (key === "/api/posts" || key.startsWith("/api/posts/")) return true;
            return false;
          }
          if (!Array.isArray(key) || key[0] !== "posts") return false;
          if (bandNumber == null) return true;
          return key[1] === bandNumber;
        },
        undefined,
        mutateOptions
      )
    );
  }

  // Order stats: SWR array keys + legacy string keys.
  if (includeOrderStats) {
    tasks.push(
      mutate(
        (key) => {
          if (Array.isArray(key) && key[0] === "orderStats" && key[1] === userId) {
            return true;
          }
          if (typeof key === "string") {
            if (key.startsWith(`order-stats-${userId}-`)) return true;
            if (key.startsWith(`/orders/stats?userId=${userId}`)) return true;
            return false;
          }
          return false;
        },
        undefined,
        mutateOptions
      )
    );
  }

  // comment_orders (raw mode 목록)
  if (includeCommentOrders) {
    tasks.push(
      mutate(
        (key) =>
          Array.isArray(key) && key[0] === "comment_orders" && key[1] === userId,
        undefined,
        mutateOptions
      )
    );
  }

  return Promise.all(tasks);
}
