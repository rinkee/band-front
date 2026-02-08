import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const ALLOWED_TABLES = new Set(["orders", "comment_orders", "posts"]);
const ALLOWED_OPS = new Set(["upsert"]);
const MAX_ITEMS_PER_REQUEST = 200;
const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

const conflictKeys = [
  "order_id",
  "comment_order_id",
  "product_id",
  "post_id",
  "id",
  "comment_key",
  "post_key",
];

const supabaseAdmin = url && serviceKey ? createClient(url, serviceKey) : null;

const getRateLimitStore = () => {
  if (!globalThis.__syncApiRateLimitStore) {
    globalThis.__syncApiRateLimitStore = new Map();
  }
  return globalThis.__syncApiRateLimitStore;
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

  // 현재 프로젝트의 오프라인 동기화 클라이언트와 호환되는 최소 인증 규칙.
  // (Bearer 값과 x-user-id가 동일해야 요청 허용)
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

export async function POST(request) {
  try {
    const auth = parseAuthUserId(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const clientIp = getClientIp(request);
    const rl = checkRateLimit(`sync:${auth.userId}:${clientIp}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        }
      );
    }

    const parsed = await parseJsonBodyWithLimit(request);
    if (!parsed.ok) {
      return NextResponse.json({ message: parsed.message }, { status: parsed.status });
    }

    const body = parsed.body;
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ results: [], message: "no items" }, { status: 200 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { message: "Service key가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    if (items.length > MAX_ITEMS_PER_REQUEST) {
      return NextResponse.json(
        {
          message: `items 개수가 너무 많습니다. 최대 ${MAX_ITEMS_PER_REQUEST}개까지 허용됩니다.`,
        },
        { status: 400 }
      );
    }

    const results = [];

    for (const item of items) {
      const { table, op = "upsert", payload = {}, pkValue, id } = item || {};

      if (!ALLOWED_TABLES.has(table)) {
        results.push({ id, ok: false, reason: `table '${table}' is not allowed` });
        continue;
      }

      if (!ALLOWED_OPS.has(op)) {
        results.push({ id, ok: false, reason: `op '${op}' is not allowed` });
        continue;
      }

      if (!table || !payload || typeof payload !== "object" || Array.isArray(payload)) {
        results.push({ id, ok: false, reason: "invalid payload" });
        continue;
      }

      if (Object.keys(payload).length === 0) {
        results.push({ id, ok: false, reason: "payload must not be empty" });
        continue;
      }

      const itemUserId = item?.user_id || payload?.user_id || null;
      if (!itemUserId) {
        results.push({ id, ok: false, reason: "user_id is required in item or payload" });
        continue;
      }
      if (itemUserId !== auth.userId) {
        results.push({ id, ok: false, reason: "forbidden: user_id mismatch" });
        continue;
      }

      const conflictKey = conflictKeys.find((k) => Object.prototype.hasOwnProperty.call(payload, k));
      const eqKey = conflictKey || Object.keys(payload)[0];
      const eqValue = pkValue || (conflictKey ? payload[conflictKey] : payload[eqKey]);

      try {
        const { error } = await supabaseAdmin
          .from(table)
          .upsert(payload, { onConflict: conflictKey || eqKey });
        if (error) throw error;
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, reason: err.message });
      }
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    console.error("sync api error", err);
    return NextResponse.json({ message: err.message || "sync error" }, { status: 500 });
  }
}
