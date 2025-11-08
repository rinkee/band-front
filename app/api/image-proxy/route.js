// app/api/image-proxy/route.js
// Proxies remote images (restricted to naver/pstatic) to avoid mixed content and hotlink blocks.

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");
    console.log("[image-proxy] Requested URL:", target);

    if (!target) {
      return new Response("Missing 'url' query parameter", { status: 400 });
    }

    let remoteUrl;
    try {
      remoteUrl = new URL(target);
      // HTTPS를 HTTP로 다운그레이드 (네이버 CDN은 둘 다 지원)
      if (remoteUrl.protocol === 'https:') {
        remoteUrl.protocol = 'http:';
      }
      console.log("[image-proxy] Parsed URL:", remoteUrl.toString());
    } catch (e) {
      console.error("[image-proxy] Invalid URL:", e);
      return new Response("Invalid URL", { status: 400 });
    }

    // Allow only naver/pstatic hosts to avoid open proxy abuse
    const host = remoteUrl.hostname.toLowerCase();
    const allowed =
      host.endsWith(".naver.net") ||
      host.endsWith(".naver.com") ||
      host.endsWith(".pstatic.net") ||
      host === "naver.net" ||
      host === "naver.com" ||
      host === "pstatic.net";
    if (!allowed) {
      return new Response("Host not allowed", { status: 403 });
    }

    // Build headers; many image CDNs block hotlinking based on Referer.
    const upstreamHeaders = new Headers();
    // Spoof a common browser UA to avoid 403 from some CDNs
    upstreamHeaders.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    );
    // Conservative referer: the same origin as the image host usually passes basic checks
    upstreamHeaders.set("Referer", `${remoteUrl.protocol}//${remoteUrl.hostname}/`);

    // Fetch the remote image. Follow redirects.
    console.log("[image-proxy] Fetching from:", remoteUrl.toString());
    const res = await fetch(remoteUrl.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    console.log("[image-proxy] Response status:", res.status);
    if (!res.ok || !res.body) {
      console.error("[image-proxy] Upstream error:", res.status, await res.text().catch(() => ''));
      return new Response(`Upstream error: ${res.status}`, { status: res.status || 502 });
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const cacheControl = res.headers.get("cache-control") || "public, max-age=86400, s-maxage=86400";

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        // Prevent MIME-type sniffing issues
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[image-proxy] Error:", err);
    return new Response(`Proxy error: ${err.message}`, { status: 500 });
  }
}

