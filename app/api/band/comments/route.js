import { NextResponse } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 90;
const MAX_LIMIT = 50;
const MAX_ACCESS_TOKEN_LENGTH = 1024;
const MAX_PARAM_LENGTH = 200;
const ALLOWED_SORT_VALUES = new Set(["created_at", "-created_at"]);

const getRateLimitStore = () => {
  if (!globalThis.__bandCommentsRouteRateLimitStore) {
    globalThis.__bandCommentsRouteRateLimitStore = new Map();
  }
  return globalThis.__bandCommentsRouteRateLimitStore;
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

const validateSimpleParam = (value, fieldName) => {
  if (!value || typeof value !== "string") {
    return { ok: false, message: `${fieldName} 파라미터가 필요합니다.` };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: `${fieldName} 파라미터가 필요합니다.` };
  }

  if (trimmed.length > MAX_PARAM_LENGTH) {
    return { ok: false, message: `${fieldName} 길이가 너무 깁니다.` };
  }

  return { ok: true, value: trimmed };
};

export async function GET(request) {
  try {
    const auth = parseAuthUserId(request);
    if (!auth.ok) {
      return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    const rl = checkRateLimit(`band-comments:${auth.userId}:${getClientIp(request)}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        }
      );
    }

    const { searchParams } = new URL(request.url);

    // 클라이언트에서 전달받은 파라미터들
    const accessTokenRaw = searchParams.get("access_token");
    const bandKeyRaw = searchParams.get("band_key");
    const postKeyRaw = searchParams.get("post_key");
    const sortRaw = searchParams.get("sort") || "-created_at";
    const limitRaw = searchParams.get("limit");
    const afterRaw = searchParams.get("after");
    const beforeRaw = searchParams.get("before");

    const accessToken = typeof accessTokenRaw === "string" ? accessTokenRaw.trim() : "";
    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required parameter: access_token",
        },
        { status: 400 }
      );
    }
    if (accessToken.length > MAX_ACCESS_TOKEN_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          message: "access_token 길이가 너무 깁니다.",
        },
        { status: 400 }
      );
    }

    const bandKeyResult = validateSimpleParam(bandKeyRaw, "band_key");
    if (!bandKeyResult.ok) {
      return NextResponse.json({ success: false, message: bandKeyResult.message }, { status: 400 });
    }

    const postKeyResult = validateSimpleParam(postKeyRaw, "post_key");
    if (!postKeyResult.ok) {
      return NextResponse.json({ success: false, message: postKeyResult.message }, { status: 400 });
    }

    const sort = typeof sortRaw === "string" ? sortRaw.trim() : "";
    if (!ALLOWED_SORT_VALUES.has(sort)) {
      return NextResponse.json(
        {
          success: false,
          message: "sort 값이 유효하지 않습니다.",
        },
        { status: 400 }
      );
    }

    // BAND API에 요청할 URL 구성 (v2.1 사용 - 대댓글 지원)
    const bandApiUrl = new URL("https://openapi.band.us/v2.1/band/post/comments");
    bandApiUrl.searchParams.append("access_token", accessToken);
    bandApiUrl.searchParams.append("band_key", bandKeyResult.value);
    bandApiUrl.searchParams.append("post_key", postKeyResult.value);
    bandApiUrl.searchParams.append("sort", sort);

    if (limitRaw) {
      const parsedLimit = Number(limitRaw);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
        return NextResponse.json(
          {
            success: false,
            message: "limit는 1 이상의 정수여야 합니다.",
          },
          { status: 400 }
        );
      }
      bandApiUrl.searchParams.append("limit", String(Math.min(parsedLimit, MAX_LIMIT)));
    }

    if (afterRaw) {
      const after = String(afterRaw).trim();
      if (!after || after.length > MAX_PARAM_LENGTH) {
        return NextResponse.json(
          {
            success: false,
            message: "after 값이 유효하지 않습니다.",
          },
          { status: 400 }
        );
      }
      bandApiUrl.searchParams.append("after", after);
    }

    if (beforeRaw) {
      const before = String(beforeRaw).trim();
      if (!before || before.length > MAX_PARAM_LENGTH) {
        return NextResponse.json(
          {
            success: false,
            message: "before 값이 유효하지 않습니다.",
          },
          { status: 400 }
        );
      }
      bandApiUrl.searchParams.append("before", before);
    }

    if (process.env.NODE_ENV === "development") {
      const safeUrl = bandApiUrl
        .toString()
        .replace(/access_token=[^&]+/g, "access_token=***");
      console.log("Fetching comments from BAND API:", safeUrl);
    }

    // BAND API 호출
    const response = await fetch(bandApiUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PODER-Web-App/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (process.env.NODE_ENV === "development") {
      console.log(
        "BAND API response status:",
        response.status,
        response.statusText
      );
    }

    if (!response.ok) {
      console.error(
        "BAND API response error:",
        response.status,
        response.statusText
      );
      return NextResponse.json(
        {
          success: false,
          message: `BAND API error: ${response.status} ${response.statusText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    if (process.env.NODE_ENV === "development") {
      console.log("BAND API response meta:", {
        result_code: data?.result_code,
        items: data?.result_data?.items?.length || 0,
        has_next: !!data?.result_data?.paging?.next_params,
      });
    }

    // BAND API 응답 구조 확인 및 에러 처리
    if (data.result_code !== 1) {
      console.error("BAND API result error:", data.result_message || data);
      return NextResponse.json(
        {
          success: false,
          message: data.result_message || "BAND API returned an error",
          debug: data, // 디버깅을 위해 전체 응답 포함
        },
        { status: 400 }
      );
    }

    // 성공적인 응답 반환
    return NextResponse.json({
      success: true,
      data: data.result_data || {},
      message: "Comments fetched successfully",
    });
  } catch (error) {
    console.error("Comments API proxy error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error while fetching comments",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
