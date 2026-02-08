import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const ALLOWED_UPDATE_FIELDS = new Set([
  "title",
  "is_product",
  "comment_sync_status",
  "last_sync_attempt",
  "sync_retry_count",
]);
const ALLOWED_COMMENT_SYNC_STATUS = new Set(["pending", "completed", "failed", "success"]);

const getRateLimitStore = () => {
  if (!globalThis.__manualUpdateRateLimitStore) {
    globalThis.__manualUpdateRateLimitStore = new Map();
  }
  return globalThis.__manualUpdateRateLimitStore;
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

  // 현재 클라이언트 호환을 위한 최소 인증 규칙.
  if (token !== headerUserId) {
    return { ok: false, status: 403, message: "인증 정보가 사용자 식별자와 일치하지 않습니다." };
  }

  return { ok: true, userId: headerUserId };
};

const parseAndValidateBody = async (request) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return { ok: false, status: 400, message: "유효하지 않은 JSON 본문입니다." };
  }

  const postKey = typeof body?.postKey === "string" ? body.postKey.trim() : "";
  const updates = body?.updates;
  const bodyUserId = typeof body?.userId === "string" ? body.userId.trim() : "";

  if (!postKey) {
    return { ok: false, status: 400, message: "postKey가 필요합니다." };
  }

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return { ok: false, status: 400, message: "updates 객체가 필요합니다." };
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, message: "updates는 비어 있을 수 없습니다." };
  }

  return { ok: true, body: { postKey, updates, bodyUserId } };
};

const sanitizeUpdates = (updates) => {
  const sanitized = {};

  for (const [field, rawValue] of Object.entries(updates)) {
    if (!ALLOWED_UPDATE_FIELDS.has(field)) {
      return { ok: false, message: `허용되지 않은 필드입니다: ${field}` };
    }

    if (field === "title") {
      if (typeof rawValue !== "string") {
        return { ok: false, message: "title은 문자열이어야 합니다." };
      }
      const title = rawValue.trim();
      if (!title || title.length > 200) {
        return { ok: false, message: "title은 1~200자여야 합니다." };
      }
      sanitized.title = title;
      continue;
    }

    if (field === "is_product") {
      if (typeof rawValue !== "boolean") {
        return { ok: false, message: "is_product는 boolean이어야 합니다." };
      }
      sanitized.is_product = rawValue;
      continue;
    }

    if (field === "comment_sync_status") {
      if (typeof rawValue !== "string" || !ALLOWED_COMMENT_SYNC_STATUS.has(rawValue)) {
        return { ok: false, message: "comment_sync_status 값이 유효하지 않습니다." };
      }
      sanitized.comment_sync_status = rawValue;
      continue;
    }

    if (field === "last_sync_attempt") {
      if (rawValue === null) {
        sanitized.last_sync_attempt = null;
        continue;
      }
      if (typeof rawValue !== "string" || Number.isNaN(Date.parse(rawValue))) {
        return { ok: false, message: "last_sync_attempt는 null 또는 ISO datetime이어야 합니다." };
      }
      sanitized.last_sync_attempt = rawValue;
      continue;
    }

    if (field === "sync_retry_count") {
      if (!Number.isInteger(rawValue) || rawValue < 0 || rawValue > 1000) {
        return { ok: false, message: "sync_retry_count는 0~1000 정수여야 합니다." };
      }
      sanitized.sync_retry_count = rawValue;
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return { ok: false, message: "허용 가능한 변경 필드가 없습니다." };
  }

  sanitized.updated_at = new Date().toISOString();
  return { ok: true, sanitized };
};

export async function POST(request) {
  try {
    const auth = parseAuthUserId(request);
    if (!auth.ok) {
      return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    const clientIp = getClientIp(request);
    const rl = checkRateLimit(`manual-update:${auth.userId}:${clientIp}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        }
      );
    }

    const parsed = await parseAndValidateBody(request);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, message: parsed.message }, { status: parsed.status });
    }

    const { postKey, updates, bodyUserId } = parsed.body;

    if (bodyUserId && bodyUserId !== auth.userId) {
      return NextResponse.json(
        { success: false, message: "요청 본문의 userId와 인증 사용자 정보가 일치하지 않습니다." },
        { status: 403 }
      );
    }

    const sanitized = sanitizeUpdates(updates);
    if (!sanitized.ok) {
      return NextResponse.json({ success: false, message: sanitized.message }, { status: 400 });
    }

    if (!supabase) {
      return NextResponse.json(
        { success: false, message: "Service key가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from("posts")
      .update(sanitized.sanitized)
      .eq("post_key", postKey)
      .eq("user_id", auth.userId)
      .select("post_key");

    if (error) {
      console.error("Service update posts 실패:", error);
      return NextResponse.json(
        { success: false, message: "업데이트 실패", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updatedCount: Array.isArray(data) ? data.length : 0,
    });
  } catch (e) {
    console.error("Service update posts 예외:", e);
    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}
