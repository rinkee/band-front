// app/api/image-proxy/route.js
// Proxies remote images (restricted to naver/pstatic) to avoid mixed content and hotlink blocks.

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");
    if (!target) {
      return new Response("Missing 'url' query parameter", { status: 400 });
    }

    let remoteUrl;
    try {
      remoteUrl = new URL(target);
    } catch (e) {
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
    const res = await fetch(remoteUrl.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!res.ok || !res.body) {
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
    return new Response("Proxy error", { status: 500 });
  }
}

