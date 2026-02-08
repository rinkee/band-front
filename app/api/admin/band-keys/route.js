import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 80;
const MAX_TOTAL_TOKENS = 5;
const MAX_BACKUP_TOKENS = MAX_TOTAL_TOKENS - 1;
const MAX_TOKEN_LENGTH = 4096;
const MASK_PREFIX_LENGTH = 8;

const AUTH_USER_SELECT_COLUMNS = `
  user_id, role
`;

const TARGET_USER_SELECT_COLUMNS = `
  user_id, login_id, store_name, owner_name, band_key,
  band_access_token, band_access_tokens, backup_band_keys,
  current_band_key_index, updated_at
`;

const rateLimitStore = new Map();

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

const authenticateRequest = async (request, supabaseAdmin) => {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      message: "Authorization 헤더가 필요합니다.",
    };
  }

  const bearerToken = authHeader.slice(7).trim();
  if (!bearerToken) {
    return {
      ok: false,
      status: 401,
      message: "유효한 인증 토큰이 필요합니다.",
    };
  }

  const headerUserId = (request.headers.get("x-user-id") || "").trim();

  const tokenLookup = await supabaseAdmin
    .from("users")
    .select(AUTH_USER_SELECT_COLUMNS)
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

  if (!headerUserId || !isUuid(headerUserId)) {
    return {
      ok: false,
      status: 401,
      message: "x-user-id 헤더가 필요합니다.",
    };
  }

  const legacyLookup = await supabaseAdmin
    .from("users")
    .select(AUTH_USER_SELECT_COLUMNS)
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

const normalizeToken = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const extractTokenFromEntry = (entry) => {
  if (typeof entry === "string") {
    return normalizeToken(entry);
  }

  if (!entry || typeof entry !== "object") {
    return "";
  }

  if (typeof entry.access_token === "string") {
    return normalizeToken(entry.access_token);
  }

  if (typeof entry.token === "string") {
    return normalizeToken(entry.token);
  }

  return "";
};

const normalizeTokenArray = (value) => {
  if (!Array.isArray(value)) return [];
  const dedupe = new Set();
  const result = [];

  for (const entry of value) {
    const token = extractTokenFromEntry(entry);
    if (!token || dedupe.has(token)) continue;
    dedupe.add(token);
    result.push(token);
  }

  return result;
};

const maskToken = (value) => {
  const token = normalizeToken(value);
  if (!token) return "미설정";

  const prefix = token.slice(0, MASK_PREFIX_LENGTH);
  const starLength = Math.max(4, token.length - MASK_PREFIX_LENGTH);
  return `${prefix}${"*".repeat(starLength)}`;
};

const buildTokenId = (token) => {
  const hash = createHash("sha256").update(token).digest("hex").slice(0, 16);
  return `bk_${hash}`;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const deriveTokenState = (userData) => {
  const mainToken = normalizeToken(userData?.band_access_token);
  const fromBandAccessTokens = normalizeTokenArray(userData?.band_access_tokens);
  const fromLegacyBackup = normalizeTokenArray(userData?.backup_band_keys);

  const combined = [];
  const seen = new Set();

  const pushToken = (token) => {
    if (!token || seen.has(token)) return;
    seen.add(token);
    combined.push(token);
  };

  pushToken(mainToken);
  fromBandAccessTokens.forEach(pushToken);
  fromLegacyBackup.forEach(pushToken);

  const resolvedMainToken = mainToken || combined[0] || "";
  const allTokens = [];

  if (resolvedMainToken) {
    allTokens.push(resolvedMainToken);
    combined.forEach((token) => {
      if (token !== resolvedMainToken) {
        allTokens.push(token);
      }
    });
  }

  const backupTokens = allTokens.slice(1);
  const totalKeys = allTokens.length;
  const maxIndex = Math.max(0, totalKeys - 1);
  const requestedIndex = Number.parseInt(userData?.current_band_key_index, 10);
  const currentBandKeyIndex = Number.isInteger(requestedIndex)
    ? clamp(requestedIndex, 0, maxIndex)
    : 0;

  return {
    mainToken: resolvedMainToken,
    allTokens,
    backupTokens,
    currentBandKeyIndex,
  };
};

const buildMaskedPayload = (userData) => {
  const { mainToken, allTokens, backupTokens, currentBandKeyIndex } = deriveTokenState(userData);

  return {
    target_user_id: userData.user_id,
    login_id: userData.login_id || "",
    store_name: userData.store_name || "",
    owner_name: userData.owner_name || "",
    band_key_masked: maskToken(userData.band_key || ""),
    band_key_set: Boolean(normalizeToken(userData.band_key)),
    main_token_masked: maskToken(mainToken),
    key_status: {
      has_main_token: Boolean(mainToken),
      total_keys: allTokens.length,
      backup_count: backupTokens.length,
      current_band_key_index: currentBandKeyIndex,
    },
    backup_tokens: backupTokens.map((token, index) => ({
      token_id: buildTokenId(token),
      masked_token: maskToken(token),
      order_index: index + 1,
    })),
    updated_at: userData.updated_at || null,
  };
};

const loadTargetUser = async (supabaseAdmin, targetUserId) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(TARGET_USER_SELECT_COLUMNS)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      message: error.message || "사용자 정보를 조회하지 못했습니다.",
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      message: "대상 사용자를 찾을 수 없습니다.",
    };
  }

  return { ok: true, data };
};

const validatePatchBody = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, message: "JSON 객체 본문이 필요합니다." };
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "band_access_token") ||
    Object.prototype.hasOwnProperty.call(body, "band_key")
  ) {
    return {
      ok: false,
      status: 400,
      message: "band_access_token과 band_key는 이 API에서 수정할 수 없습니다.",
    };
  }

  const allowedFields = new Set([
    "target_user_id",
    "backup_tokens",
    "current_band_key_index",
  ]);

  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) {
      return {
        ok: false,
        status: 400,
        message: `허용되지 않은 필드입니다: ${key}`,
      };
    }
  }

  const targetUserId = normalizeToken(body.target_user_id);
  if (!isUuid(targetUserId)) {
    return {
      ok: false,
      status: 400,
      message: "target_user_id는 UUID 형식이어야 합니다.",
    };
  }

  if (!Array.isArray(body.backup_tokens)) {
    return {
      ok: false,
      status: 400,
      message: "backup_tokens는 배열이어야 합니다.",
    };
  }

  const currentBandKeyIndex = Number.parseInt(body.current_band_key_index, 10);
  if (!Number.isInteger(currentBandKeyIndex)) {
    return {
      ok: false,
      status: 400,
      message: "current_band_key_index는 정수여야 합니다.",
    };
  }

  return {
    ok: true,
    targetUserId,
    backupTokensInput: body.backup_tokens,
    currentBandKeyIndex,
  };
};

const resolveBackupTokens = ({
  backupTokensInput,
  existingBackupTokens,
  mainToken,
}) => {
  const existingTokenMap = new Map(
    existingBackupTokens.map((token) => [buildTokenId(token), token])
  );

  const dedupe = new Set();
  const result = [];

  for (const entry of backupTokensInput) {
    let token = "";

    if (typeof entry === "string") {
      token = normalizeToken(entry);
    } else if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof entry.token_id === "string"
    ) {
      token = existingTokenMap.get(entry.token_id) || "";
      if (!token) {
        return {
          ok: false,
          status: 400,
          message: `알 수 없는 token_id 입니다: ${entry.token_id}`,
        };
      }
    } else {
      return {
        ok: false,
        status: 400,
        message: "backup_tokens 항목 형식이 올바르지 않습니다.",
      };
    }

    if (!token) {
      return {
        ok: false,
        status: 400,
        message: "backup_tokens에는 빈 값을 포함할 수 없습니다.",
      };
    }

    if (token.length > MAX_TOKEN_LENGTH) {
      return {
        ok: false,
        status: 400,
        message: `토큰 길이는 ${MAX_TOKEN_LENGTH}자를 초과할 수 없습니다.`,
      };
    }

    if (token === mainToken) {
      return {
        ok: false,
        status: 400,
        message: "메인 토큰은 백업 토큰 목록에 포함할 수 없습니다.",
      };
    }

    if (dedupe.has(token)) {
      continue;
    }

    dedupe.add(token);
    result.push(token);
  }

  if (result.length > MAX_BACKUP_TOKENS) {
    return {
      ok: false,
      status: 400,
      message: `백업 토큰은 최대 ${MAX_BACKUP_TOKENS}개까지 허용됩니다.`,
    };
  }

  return { ok: true, backupTokens: result };
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

  if (auth.user.role !== "admin") {
    return buildJson(
      { success: false, message: "관리자만 접근할 수 있습니다." },
      403
    );
  }

  const rl = checkRateLimit(
    `admin-band-keys:get:${auth.user.user_id}:${getClientIp(request)}`
  );
  if (!rl.allowed) {
    return buildJson(
      { success: false, message: "요청이 너무 많습니다." },
      429,
      { "Retry-After": String(Math.ceil((rl.retryAfterMs || 0) / 1000)) }
    );
  }

  const { searchParams } = new URL(request.url);
  const targetUserId = normalizeToken(searchParams.get("target_user_id"));
  if (!isUuid(targetUserId)) {
    return buildJson(
      { success: false, message: "target_user_id는 UUID 형식이어야 합니다." },
      400
    );
  }

  const targetUserResult = await loadTargetUser(supabaseAdmin, targetUserId);
  if (!targetUserResult.ok) {
    return buildJson(
      { success: false, message: targetUserResult.message },
      targetUserResult.status
    );
  }

  return buildJson(
    {
      success: true,
      data: buildMaskedPayload(targetUserResult.data),
    },
    200
  );
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

  if (auth.user.role !== "admin") {
    return buildJson(
      { success: false, message: "관리자만 접근할 수 있습니다." },
      403
    );
  }

  const rl = checkRateLimit(
    `admin-band-keys:patch:${auth.user.user_id}:${getClientIp(request)}`
  );
  if (!rl.allowed) {
    return buildJson(
      { success: false, message: "요청이 너무 많습니다." },
      429,
      { "Retry-After": String(Math.ceil((rl.retryAfterMs || 0) / 1000)) }
    );
  }

  const body = await request.json().catch(() => null);
  const validatedBody = validatePatchBody(body);
  if (!validatedBody.ok) {
    return buildJson(
      { success: false, message: validatedBody.message },
      validatedBody.status
    );
  }

  const targetUserResult = await loadTargetUser(
    supabaseAdmin,
    validatedBody.targetUserId
  );
  if (!targetUserResult.ok) {
    return buildJson(
      { success: false, message: targetUserResult.message },
      targetUserResult.status
    );
  }

  const tokenState = deriveTokenState(targetUserResult.data);
  if (!tokenState.mainToken) {
    return buildJson(
      {
        success: false,
        message:
          "메인 토큰이 없는 사용자는 이 API로 백업키를 관리할 수 없습니다.",
      },
      400
    );
  }

  const resolvedBackup = resolveBackupTokens({
    backupTokensInput: validatedBody.backupTokensInput,
    existingBackupTokens: tokenState.backupTokens,
    mainToken: tokenState.mainToken,
  });

  if (!resolvedBackup.ok) {
    return buildJson(
      { success: false, message: resolvedBackup.message },
      resolvedBackup.status
    );
  }

  const maxAllowedIndex = resolvedBackup.backupTokens.length;
  if (
    validatedBody.currentBandKeyIndex < 0 ||
    validatedBody.currentBandKeyIndex > maxAllowedIndex
  ) {
    return buildJson(
      {
        success: false,
        message: `current_band_key_index는 0~${maxAllowedIndex} 범위여야 합니다.`,
      },
      400
    );
  }

  const updatedAt = new Date().toISOString();
  const updates = {
    band_access_tokens: [tokenState.mainToken, ...resolvedBackup.backupTokens],
    backup_band_keys: resolvedBackup.backupTokens,
    current_band_key_index: validatedBody.currentBandKeyIndex,
    updated_at: updatedAt,
  };

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update(updates)
    .eq("user_id", validatedBody.targetUserId);

  if (updateError) {
    return buildJson(
      {
        success: false,
        message: updateError.message || "백업 키 저장에 실패했습니다.",
      },
      500
    );
  }

  const refreshedTargetResult = await loadTargetUser(
    supabaseAdmin,
    validatedBody.targetUserId
  );

  if (!refreshedTargetResult.ok) {
    return buildJson(
      { success: false, message: refreshedTargetResult.message },
      refreshedTargetResult.status
    );
  }

  return buildJson(
    {
      success: true,
      data: buildMaskedPayload(refreshedTargetResult.data),
    },
    200
  );
}
