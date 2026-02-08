import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

const createServiceSupabaseClient = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin credentials are not configured");
  }

  return createClient(url, key);
};

const getRateLimitStore = () => {
  if (!globalThis.__bandBandsRouteRateLimitStore) {
    globalThis.__bandBandsRouteRateLimitStore = new Map();
  }
  return globalThis.__bandBandsRouteRateLimitStore;
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

export async function GET(request) {
  try {
    const auth = parseAuthUserId(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const rl = checkRateLimit(`band-bands:${auth.userId}:${getClientIp(request)}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedUserId = (searchParams.get("userId") || "").trim();

    if (requestedUserId && requestedUserId !== auth.userId) {
      return NextResponse.json(
        { error: "요청 사용자와 인증 사용자 정보가 일치하지 않습니다." },
        { status: 403 }
      );
    }

    const supabase = createServiceSupabaseClient();

    // 1) Supabase에서 band_access_token 조회
    const { data: user, error: supaError } = await supabase
      .from("users")
      .select("band_access_token")
      .eq("user_id", auth.userId)
      .single();

    if (supaError || !user?.band_access_token) {
      return NextResponse.json(
        {
          error:
            supaError?.message || "Band Access Token이 설정되지 않았습니다.",
          detail: "Band API 인증 정보가 없습니다.",
        },
        { status: 400 }
      );
    }

    // 2) Band Open API 호출
    const bandApiUrl = `https://openapi.band.us/v2.1/bands?access_token=${user.band_access_token}`;

    const response = await fetch(bandApiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; BandAPIClient/1.0)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Band Bands API 에러]", response.status, errorText);
      return NextResponse.json(
        {
          error: `Band API 오류: ${response.status}`,
          detail: errorText,
        },
        { status: response.status }
      );
    }

    // 3) JSON 파싱 및 응답
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Band Bands API 처리 오류]", error);
    return NextResponse.json(
      {
        error: "서버 내부 오류",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}
