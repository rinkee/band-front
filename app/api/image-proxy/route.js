// app/api/image-proxy/route.js
// Proxies remote images from trusted hosts with abuse guards.

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 180;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;

const rateLimitStore = new Map();

const isAllowedHost = (hostname) => {
  const host = hostname.toLowerCase();
  return (
    host.endsWith(".naver.net") ||
    host.endsWith(".naver.com") ||
    host.endsWith(".pstatic.net") ||
    host === "naver.net" ||
    host === "naver.com" ||
    host === "pstatic.net"
  );
};

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
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - bucket.count };
};

const parseAndValidateTargetUrl = (target) => {
  if (!target || typeof target !== "string") {
    return { error: "Missing 'url' query parameter", status: 400 };
  }

  if (target.length > MAX_URL_LENGTH) {
    return { error: "URL too long", status: 414 };
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return { error: "Invalid URL", status: 400 };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http/https URLs are allowed", status: 400 };
  }

  if (!isAllowedHost(parsed.hostname)) {
    return { error: "Host not allowed", status: 403 };
  }

  return { url: parsed };
};

const buildUpstreamHeaders = (targetUrl) => {
  const upstreamHeaders = new Headers();
  upstreamHeaders.set(
    "User-Agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  );
  upstreamHeaders.set("Referer", `${targetUrl.protocol}//${targetUrl.hostname}/`);
  return upstreamHeaders;
};

const fetchWithValidatedRedirects = async (initialUrl) => {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const res = await fetch(currentUrl.toString(), {
      method: "GET",
      headers: buildUpstreamHeaders(currentUrl),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { error: "Upstream redirect missing location", status: 502 };
      }

      if (redirectCount === MAX_REDIRECTS) {
        return { error: "Too many redirects", status: 502 };
      }

      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        return { error: "Invalid redirect URL", status: 502 };
      }

      if ((nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") || !isAllowedHost(nextUrl.hostname)) {
        return { error: "Redirect host not allowed", status: 403 };
      }

      currentUrl = nextUrl;
      continue;
    }

    return { response: res, finalUrl: currentUrl };
  }

  return { error: "Redirect resolution failed", status: 502 };
};

const readResponseBodyWithLimit = async (response, maxBytes) => {
  if (!response.body) {
    throw new Error("UPSTREAM_EMPTY_BODY");
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error("MAX_BYTES_EXCEEDED");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
};

export async function GET(request) {
  try {
    const clientIp = getClientIp(request);
    const rl = checkRateLimit(`image-proxy:${clientIp}`);
    if (!rl.allowed) {
      return new Response("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.retryAfterMs || 0) / 1000)),
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");
    const parsed = parseAndValidateTargetUrl(target);
    if (parsed.error) {
      return new Response(parsed.error, { status: parsed.status });
    }

    const upstream = await fetchWithValidatedRedirects(parsed.url);
    if (upstream.error) {
      return new Response(upstream.error, { status: upstream.status });
    }

    const res = upstream.response;
    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, { status: res.status || 502 });
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return new Response("Upstream content is not an image", { status: 415 });
    }

    const contentLengthHeader = res.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        return new Response("Upstream image too large", { status: 413 });
      }
    }

    const bufferedImage = await readResponseBodyWithLimit(res, MAX_RESPONSE_BYTES);
    const cacheControl = res.headers.get("cache-control") || "public, max-age=86400, s-maxage=86400";

    return new Response(bufferedImage, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "Content-Length": String(bufferedImage.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return new Response("Upstream timeout", { status: 504 });
    }
    if (err?.message === "MAX_BYTES_EXCEEDED") {
      return new Response("Upstream image too large", { status: 413 });
    }
    if (err?.message === "UPSTREAM_EMPTY_BODY") {
      return new Response("Upstream empty body", { status: 502 });
    }

    console.error("[image-proxy] Error:", err);
    return new Response("Proxy error", { status: 500 });
  }
}
