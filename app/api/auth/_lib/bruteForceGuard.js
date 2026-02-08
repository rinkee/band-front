const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const FAILURE_TTL_MS = 15 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 1000;

const ROUTE_LIMITS = {
  login: {
    ipMaxRequests: 80,
    accountIpMaxRequests: 12,
  },
  register: {
    ipMaxRequests: 40,
    accountIpMaxRequests: 8,
  },
};

const rateLimitStore = new Map();
const failureStore = new Map();

const cleanupStores = () => {
  const now = Date.now();

  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }

  for (const [key, value] of failureStore.entries()) {
    if (value.expiresAt <= now) {
      failureStore.delete(key);
    }
  }
};

const normalizeAccountId = (rawValue) => {
  if (typeof rawValue !== "string") {
    return "";
  }
  return rawValue.trim().toLowerCase().slice(0, 128);
};

const getClientIp = (request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
};

const checkRateLimitBucket = (key, maxRequests) => {
  const now = Date.now();
  const bucket = rateLimitStore.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (bucket.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterMs: bucket.resetAt - now,
    };
  }

  bucket.count += 1;
  return { allowed: true };
};

const computeBackoffMs = (failureCount) => {
  const step = Math.max(0, failureCount - 1);
  return Math.min(MAX_BACKOFF_MS, 500 * 2 ** step);
};

const buildFailureKey = ({ routeId, clientIp, accountId }) => {
  return `${routeId}:acct:${accountId}:ip:${clientIp}`;
};

const buildIpRateLimitKey = ({ routeId, clientIp }) => {
  return `${routeId}:ip:${clientIp}`;
};

const buildAccountRateLimitKey = ({ routeId, clientIp, accountId }) => {
  return `${routeId}:acct:${accountId}:ip:${clientIp}`;
};

const safeRouteConfig = (routeId) => {
  return ROUTE_LIMITS[routeId] || ROUTE_LIMITS.login;
};

export const evaluateAuthGuards = ({ routeId, clientIp, accountId }) => {
  cleanupStores();

  const routeConfig = safeRouteConfig(routeId);
  const normalizedAccountId = normalizeAccountId(accountId);

  const ipKey = buildIpRateLimitKey({ routeId, clientIp });
  const ipRateLimit = checkRateLimitBucket(ipKey, routeConfig.ipMaxRequests);
  if (!ipRateLimit.allowed) {
    return {
      allowed: false,
      reason: "rate_limit_ip",
      retryAfterMs: ipRateLimit.retryAfterMs,
      retryAfterSeconds: Math.ceil((ipRateLimit.retryAfterMs || 0) / 1000),
    };
  }

  if (normalizedAccountId) {
    const accountKey = buildAccountRateLimitKey({
      routeId,
      clientIp,
      accountId: normalizedAccountId,
    });
    const accountRateLimit = checkRateLimitBucket(
      accountKey,
      routeConfig.accountIpMaxRequests
    );
    if (!accountRateLimit.allowed) {
      return {
        allowed: false,
        reason: "rate_limit_account_ip",
        retryAfterMs: accountRateLimit.retryAfterMs,
        retryAfterSeconds: Math.ceil((accountRateLimit.retryAfterMs || 0) / 1000),
      };
    }
  }

  if (normalizedAccountId) {
    const failureKey = buildFailureKey({
      routeId,
      clientIp,
      accountId: normalizedAccountId,
    });
    const failureInfo = failureStore.get(failureKey);
    const now = Date.now();
    if (failureInfo && failureInfo.blockedUntil > now) {
      const retryAfterMs = failureInfo.blockedUntil - now;
      return {
        allowed: false,
        reason: "backoff",
        retryAfterMs,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }
  }

  return { allowed: true, normalizedAccountId };
};

export const registerAuthFailure = ({ routeId, clientIp, accountId }) => {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) {
    return { tracked: false, failures: 0, backoffMs: 0 };
  }

  const now = Date.now();
  const key = buildFailureKey({
    routeId,
    clientIp,
    accountId: normalizedAccountId,
  });
  const current = failureStore.get(key);
  const nextFailures =
    !current || current.expiresAt <= now ? 1 : (current.failures || 0) + 1;
  const backoffMs = computeBackoffMs(nextFailures);

  failureStore.set(key, {
    failures: nextFailures,
    blockedUntil: now + backoffMs,
    expiresAt: now + FAILURE_TTL_MS,
  });

  return { tracked: true, failures: nextFailures, backoffMs };
};

export const clearAuthFailure = ({ routeId, clientIp, accountId }) => {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) {
    return;
  }
  const key = buildFailureKey({
    routeId,
    clientIp,
    accountId: normalizedAccountId,
  });
  failureStore.delete(key);
};

export { getClientIp, normalizeAccountId };
