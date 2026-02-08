import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const rateLimitStore = new Map();

const USER_SELECT_COLUMNS = `
  user_id, login_id, naver_id, store_name, store_address, owner_name,
  phone_number, band_url, band_number, is_active, created_at, last_login_at,
  last_crawl_at, product_count, crawl_interval, naver_login_status,
  excluded_customers, job_id, auto_barcode_generation, role, settings,
  subscription, auto_crawl, updated_at, cookies_updated_at, last_crawled_post_id,
  band_access_token, band_key, post_fetch_limit, force_ai_processing,
  multi_number_ai_processing, ignore_order_needs_ai, ai_analysis_level, ai_mode_migrated
`;

const ALLOWED_AI_LEVELS = new Set(["off", "smart", "aggressive"]);
const MAX_NAME_LENGTH = 120;
const MAX_BAND_ACCESS_TOKEN_LENGTH = 4096;
const MAX_BAND_KEY_LENGTH = 256;
const MAX_EXCLUDED_CUSTOMERS = 200;
const MAX_EXCLUDED_CUSTOMER_NAME_LENGTH = 80;

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const getClientIp = (request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
};

const checkRateLimit = (key) => {
  const now = Date.now();
  const bucket = rateLimitStore.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterMs: bucket.resetAt - now,
    };
  }

  bucket.count += 1;
  return { allowed: true };
};

const isMissingTokenColumnError = (error) => {
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    (text.includes("token") &&
      (text.includes("column") ||
        text.includes("does not exist") ||
        text.includes("not found")))
  );
};

const createAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey);
};

const buildJson = (body, status = 200, extraHeaders = {}) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

const normalizeText = (value, maxLength) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length > maxLength) return null;
  return normalized;
};

const authenticateRequest = async (request, supabaseAdmin) => {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Authorization 헤더가 필요합니다." };
  }

  const bearerToken = authHeader.slice(7).trim();
  if (!bearerToken) {
    return { ok: false, status: 401, message: "유효한 인증 토큰이 필요합니다." };
  }

  const headerUserId = (request.headers.get("x-user-id") || "").trim();

  // Prefer token-based auth when `users.token` column exists.
  const tokenLookup = await supabaseAdmin
    .from("users")
    .select(USER_SELECT_COLUMNS)
    .eq("token", bearerToken)
    .maybeSingle();

  if (!tokenLookup.error && tokenLookup.data) {
    return { ok: true, user: tokenLookup.data, authMode: "token" };
  }

  if (!tokenLookup.error || !isMissingTokenColumnError(tokenLookup.error)) {
    return {
      ok: false,
      status: 401,
      message: "인증 토큰이 유효하지 않습니다.",
    };
  }

  // Legacy fallback: temporary compatibility mode.
  if (!headerUserId || !isUuid(headerUserId)) {
    return {
      ok: false,
      status: 401,
      message: "x-user-id 헤더가 필요합니다.",
    };
  }

  const legacyLookup = await supabaseAdmin
    .from("users")
    .select(USER_SELECT_COLUMNS)
    .eq("user_id", headerUserId)
    .maybeSingle();

  if (legacyLookup.error || !legacyLookup.data) {
    return {
      ok: false,
      status: 401,
      message: "사용자 인증에 실패했습니다.",
    };
  }

  return { ok: true, user: legacyLookup.data, authMode: "legacy" };
};

const buildValidatedUpdatePayload = (input, currentUser) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "JSON 객체 본문이 필요합니다.", status: 400 };
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(input, "owner_name")) {
    const normalized = normalizeText(input.owner_name, MAX_NAME_LENGTH);
    if (normalized === null) {
      return { error: "owner_name 값이 유효하지 않습니다.", status: 400 };
    }
    updates.owner_name = normalized;
  }

  if (Object.prototype.hasOwnProperty.call(input, "store_name")) {
    const normalized = normalizeText(input.store_name, MAX_NAME_LENGTH);
    if (normalized === null) {
      return { error: "store_name 값이 유효하지 않습니다.", status: 400 };
    }
    updates.store_name = normalized;
  }

  if (Object.prototype.hasOwnProperty.call(input, "post_fetch_limit")) {
    const parsed = Number.parseInt(input.post_fetch_limit, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 400) {
      return { error: "post_fetch_limit는 1~400 사이 정수여야 합니다.", status: 400 };
    }
    updates.post_fetch_limit = parsed;
  }

  if (Object.prototype.hasOwnProperty.call(input, "excluded_customers")) {
    if (!Array.isArray(input.excluded_customers)) {
      return { error: "excluded_customers는 배열이어야 합니다.", status: 400 };
    }
    if (input.excluded_customers.length > MAX_EXCLUDED_CUSTOMERS) {
      return {
        error: `excluded_customers는 최대 ${MAX_EXCLUDED_CUSTOMERS}개까지 허용됩니다.`,
        status: 400,
      };
    }

    const normalizedCustomers = [];
    for (const item of input.excluded_customers) {
      const normalized = normalizeText(item, MAX_EXCLUDED_CUSTOMER_NAME_LENGTH);
      if (!normalized) {
        return {
          error: "excluded_customers 항목은 비어있지 않은 문자열이어야 합니다.",
          status: 400,
        };
      }
      normalizedCustomers.push(normalized);
    }
    updates.excluded_customers = Array.from(new Set(normalizedCustomers));
  }

  for (const key of [
    "auto_barcode_generation",
    "force_ai_processing",
    "multi_number_ai_processing",
    "ignore_order_needs_ai",
    "ai_mode_migrated",
  ]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      if (typeof input[key] !== "boolean") {
        return { error: `${key}는 boolean 값이어야 합니다.`, status: 400 };
      }
      updates[key] = input[key];
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "ai_analysis_level")) {
    if (
      typeof input.ai_analysis_level !== "string" ||
      !ALLOWED_AI_LEVELS.has(input.ai_analysis_level)
    ) {
      return {
        error: "ai_analysis_level은 off/smart/aggressive 중 하나여야 합니다.",
        status: 400,
      };
    }
    updates.ai_analysis_level = input.ai_analysis_level;
  }

  const wantsBandKeyUpdate =
    Object.prototype.hasOwnProperty.call(input, "band_access_token") ||
    Object.prototype.hasOwnProperty.call(input, "band_key");
  if (wantsBandKeyUpdate && currentUser.role !== "admin") {
    return { error: "Band 키 변경은 관리자만 가능합니다.", status: 403 };
  }

  if (Object.prototype.hasOwnProperty.call(input, "band_access_token")) {
    if (typeof input.band_access_token !== "string") {
      return { error: "band_access_token은 문자열이어야 합니다.", status: 400 };
    }
    if (input.band_access_token.length > MAX_BAND_ACCESS_TOKEN_LENGTH) {
      return {
        error: `band_access_token 길이는 ${MAX_BAND_ACCESS_TOKEN_LENGTH}자를 초과할 수 없습니다.`,
        status: 400,
      };
    }
    updates.band_access_token = input.band_access_token.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "band_key")) {
    if (typeof input.band_key !== "string") {
      return { error: "band_key는 문자열이어야 합니다.", status: 400 };
    }
    if (input.band_key.length > MAX_BAND_KEY_LENGTH) {
      return {
        error: `band_key 길이는 ${MAX_BAND_KEY_LENGTH}자를 초과할 수 없습니다.`,
        status: 400,
      };
    }
    updates.band_key = input.band_key.trim();
  }

  if (Object.keys(updates).length === 0) {
    return { error: "업데이트할 허용 필드가 없습니다.", status: 400 };
  }

  updates.updated_at = new Date().toISOString();

  return { updates };
};

export async function GET(request) {
  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) {
    return buildJson(
      { success: false, message: "서버 인증 설정이 누락되었습니다." },
      500
    );
  }

  const auth = await authenticateRequest(request, supabaseAdmin);
  if (!auth.ok) {
    return buildJson({ success: false, message: auth.message }, auth.status);
  }

  const rl = checkRateLimit(`auth-me:get:${auth.user.user_id}:${getClientIp(request)}`);
  if (!rl.allowed) {
    return buildJson(
      { success: false, message: "요청이 너무 많습니다." },
      429,
      { "Retry-After": String(Math.ceil((rl.retryAfterMs || 0) / 1000)) }
    );
  }

  return buildJson({ success: true, data: auth.user }, 200);
}

export async function PATCH(request) {
  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) {
    return buildJson(
      { success: false, message: "서버 인증 설정이 누락되었습니다." },
      500
    );
  }

  const auth = await authenticateRequest(request, supabaseAdmin);
  if (!auth.ok) {
    return buildJson({ success: false, message: auth.message }, auth.status);
  }

  const rl = checkRateLimit(
    `auth-me:patch:${auth.user.user_id}:${getClientIp(request)}`
  );
  if (!rl.allowed) {
    return buildJson(
      { success: false, message: "요청이 너무 많습니다." },
      429,
      { "Retry-After": String(Math.ceil((rl.retryAfterMs || 0) / 1000)) }
    );
  }

  const body = await request.json().catch(() => null);
  const payload = buildValidatedUpdatePayload(body, auth.user);
  if (payload.error) {
    return buildJson({ success: false, message: payload.error }, payload.status);
  }

  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from("users")
    .update(payload.updates)
    .eq("user_id", auth.user.user_id)
    .select(USER_SELECT_COLUMNS)
    .single();

  if (updateError || !updatedUser) {
    return buildJson(
      {
        success: false,
        message: updateError?.message || "사용자 정보 업데이트에 실패했습니다.",
      },
      500
    );
  }

  return buildJson({ success: true, data: updatedUser }, 200);
}
