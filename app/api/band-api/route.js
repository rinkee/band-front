/**
 * Band API 프록시 라우트
 * CORS 문제를 해결하기 위해 서버 사이드에서 Band API 호출
 */

import { NextResponse } from 'next/server';

const BAND_API_BASE_URL = "https://openapi.band.us";
const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const MAX_LIMIT = 50;
const MAX_ACCESS_TOKEN_LENGTH = 1024;
const MAX_SIMPLE_PARAM_LENGTH = 200;
const ALLOWED_SORT_VALUES = new Set(["created_at", "-created_at"]);

const ENDPOINT_RULES = {
  "/band/posts": {
    version: "v2",
    allowedMethods: new Set(["GET"]),
    allowedParams: new Set(["access_token", "band_key", "locale", "limit", "after", "before"]),
    requireAccessToken: true,
    requireBandAndPostWhenCursorAbsent: false,
    supportsLimit: true,
  },
  "/band/post/comments": {
    version: "v2.1",
    allowedMethods: new Set(["GET"]),
    allowedParams: new Set([
      "access_token",
      "band_key",
      "post_key",
      "sort",
      "limit",
      "after",
      "before",
    ]),
    requireAccessToken: true,
    requireBandAndPostWhenCursorAbsent: true,
    supportsLimit: true,
  },
  "/bands": {
    version: "v2.1",
    allowedMethods: new Set(["GET"]),
    allowedParams: new Set(["access_token", "locale"]),
    requireAccessToken: true,
    requireBandAndPostWhenCursorAbsent: false,
    supportsLimit: false,
  },
};

const getRateLimitStore = () => {
  if (!globalThis.__bandApiRouteRateLimitStore) {
    globalThis.__bandApiRouteRateLimitStore = new Map();
  }
  return globalThis.__bandApiRouteRateLimitStore;
};

const getClientIp = (request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
};

const checkRateLimit = (key) => {
  const store = getRateLimitStore();
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  store.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
};

const parseAuthUserId = (request) => {
  const authHeader = request.headers.get("authorization") || "";
  const headerUserId = (request.headers.get("x-user-id") || "").trim();

  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "인증 헤더가 필요합니다." };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { ok: false, status: 401, message: "유효하지 않은 인증 토큰입니다." };
  }

  if (!headerUserId) {
    return { ok: false, status: 401, message: "x-user-id 헤더가 필요합니다." };
  }

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidLike.test(headerUserId)) {
    return { ok: false, status: 403, message: "유효하지 않은 사용자 식별자입니다." };
  }

  if (token !== headerUserId) {
    return { ok: false, status: 403, message: "인증 정보가 사용자 식별자와 일치하지 않습니다." };
  }

  return { ok: true, userId: headerUserId };
};

const parseJsonBodyWithLimit = async (request) => {
  const raw = await request.text();
  const bytes = Buffer.byteLength(raw || "", "utf8");
  if (bytes > MAX_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      message: `요청 본문이 너무 큽니다. 최대 ${MAX_BODY_BYTES} bytes`,
    };
  }

  try {
    return { ok: true, body: raw ? JSON.parse(raw) : {} };
  } catch {
    return { ok: false, status: 400, message: "유효하지 않은 JSON 본문입니다." };
  }
};

const sanitizeParams = ({ endpoint, params }) => {
  const rule = ENDPOINT_RULES[endpoint];
  const source = params && typeof params === "object" && !Array.isArray(params) ? params : {};
  const safeParams = {};

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = String(rawKey || "").trim();
    if (!key) continue;

    if (!rule.allowedParams.has(key)) {
      return { ok: false, status: 400, message: `허용되지 않은 파라미터입니다: ${key}` };
    }

    if (rawValue === null || rawValue === undefined) continue;

    if (typeof rawValue === "object") {
      return { ok: false, status: 400, message: `파라미터 형식이 유효하지 않습니다: ${key}` };
    }

    const value = String(rawValue).trim();
    if (!value) continue;

    if (key === "access_token") {
      if (value.length > MAX_ACCESS_TOKEN_LENGTH) {
        return { ok: false, status: 400, message: "access_token 길이가 너무 깁니다." };
      }
      safeParams.access_token = value;
      continue;
    }

    if (key === "limit") {
      const parsedLimit = Number(value);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
        return { ok: false, status: 400, message: "limit는 1 이상의 정수여야 합니다." };
      }
      safeParams.limit = String(Math.min(parsedLimit, MAX_LIMIT));
      continue;
    }

    if (key === "sort") {
      if (!ALLOWED_SORT_VALUES.has(value)) {
        return { ok: false, status: 400, message: `허용되지 않은 sort 값입니다: ${value}` };
      }
      safeParams.sort = value;
      continue;
    }

    if (key === "locale") {
      if (!/^[a-z]{2}_[A-Z]{2}$/.test(value)) {
        return { ok: false, status: 400, message: "locale 형식이 유효하지 않습니다." };
      }
      safeParams.locale = value;
      continue;
    }

    if (value.length > MAX_SIMPLE_PARAM_LENGTH) {
      return { ok: false, status: 400, message: `${key} 길이가 너무 깁니다.` };
    }

    safeParams[key] = value;
  }

  if (rule.requireAccessToken && !safeParams.access_token) {
    return { ok: false, status: 400, message: "access_token 파라미터가 필요합니다." };
  }

  if (rule.requireBandAndPostWhenCursorAbsent) {
    const hasCursor = !!(safeParams.after || safeParams.before);
    if (!hasCursor && (!safeParams.band_key || !safeParams.post_key)) {
      return {
        ok: false,
        status: 400,
        message: "band_key와 post_key 파라미터가 필요합니다.",
      };
    }
  }

  if (!rule.supportsLimit && safeParams.limit) {
    delete safeParams.limit;
  }

  return { ok: true, safeParams };
};

const executeBandProxyRequest = async ({ request, endpoint, params, method }) => {
  const auth = parseAuthUserId(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const rule = ENDPOINT_RULES[endpoint];
  if (!rule) {
    return NextResponse.json(
      { error: `허용되지 않은 endpoint입니다: ${endpoint}` },
      { status: 400 }
    );
  }

  const normalizedMethod = String(method || "GET").toUpperCase();
  if (!rule.allowedMethods.has(normalizedMethod)) {
    return NextResponse.json(
      { error: `허용되지 않은 메소드입니다: ${normalizedMethod}` },
      { status: 400 }
    );
  }

  const rl = checkRateLimit(`band-api:${auth.userId}:${getClientIp(request)}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      }
    );
  }

  const sanitized = sanitizeParams({ endpoint, params });
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.message }, { status: sanitized.status });
  }

  const url = new URL(`${BAND_API_BASE_URL}/${rule.version}${endpoint}`);
  for (const [key, value] of Object.entries(sanitized.safeParams)) {
    url.searchParams.append(key, value);
  }

  if (process.env.NODE_ENV === "development") {
    console.log(
      "Band API Request URL:",
      url.toString().replace(/access_token=[^&]+/g, "access_token=***")
    );
  }

  try {
    const response = await fetch(url.toString(), {
      method: normalizedMethod,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: "Band API error",
          status: response.status,
          message: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data?.result_code === 2300) {
      console.error("Band API Invalid Response (2300):", {
        endpoint,
        message: data?.result_data?.message || data?.message,
      });
    } else if (data?.result_code !== undefined && data.result_code !== 1) {
      console.error("Band API Error:", {
        endpoint,
        result_code: data.result_code,
        message: data?.result_data?.message || data?.message,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Band API proxy error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message,
      },
      { status: 500 }
    );
  }
};

export async function POST(request) {
  try {
    const parsed = await parseJsonBodyWithLimit(request);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.message }, { status: parsed.status });
    }

    const body = parsed.body || {};
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const method = typeof body.method === "string" ? body.method.trim() : "GET";
    const params = body.params;

    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint is required" }, { status: 400 });
    }

    return executeBandProxyRequest({ request, endpoint, params, method });
  } catch (error) {
    console.error("Band API proxy error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// GET 메소드도 지원
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const endpoint = (searchParams.get("endpoint") || "").trim();
  const method = (searchParams.get("method") || "GET").trim();

  if (!endpoint) {
    return NextResponse.json(
      { error: "Endpoint is required" },
      { status: 400 }
    );
  }

  // 쿼리 파라미터를 객체로 변환
  const params = {};
  for (const [key, value] of searchParams) {
    if (key !== "endpoint" && key !== "method") {
      params[key] = value;
    }
  }

  return executeBandProxyRequest({ request, endpoint, params, method });
}
