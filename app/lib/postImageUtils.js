const isNaverHost = (urlString) => {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    return (
      host.endsWith(".naver.net") ||
      host.endsWith(".naver.com") ||
      host.endsWith(".pstatic.net") ||
      host === "naver.net" ||
      host === "naver.com" ||
      host === "pstatic.net"
    );
  } catch (_) {
    return false;
  }
};

const normalizeUrlArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((url) => typeof url === "string" && url);
  }
  if (typeof value === "string" && value !== "null" && value !== "[]") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((url) => typeof url === "string" && url);
      }
      if (parsed && typeof parsed === "object" && parsed.url) {
        return [parsed.url].filter((url) => typeof url === "string" && url);
      }
    } catch (_) {
      return [];
    }
  }
  return [];
};

const normalizePhotoUrls = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((photo) => {
        if (photo && typeof photo === "object" && photo.url) return photo.url;
        if (typeof photo === "string") return photo;
        return null;
      })
      .filter((url) => typeof url === "string" && url);
  }
  if (typeof value === "string" && value !== "null" && value !== "[]") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((photo) => {
            if (photo && typeof photo === "object" && photo.url)
              return photo.url;
            if (typeof photo === "string") return photo;
            return null;
          })
          .filter((url) => typeof url === "string" && url);
      }
    } catch (_) {
      return [];
    }
  }
  return [];
};

export const getProxiedImageUrl = (url, options = {}) => {
  if (!url) return null;
  const { thumbnail } = options;

  if (!isNaverHost(url)) {
    return url;
  }

  let targetUrl = url;
  if (thumbnail) {
    try {
      const u = new URL(url);
      u.searchParams.delete("type");
      u.searchParams.set("type", thumbnail);
      targetUrl = u.toString();
    } catch (_) {
      targetUrl = url.includes("?")
        ? `${url}&type=${thumbnail}`
        : `${url}?type=${thumbnail}`;
    }
  }

  return `/api/image-proxy?url=${encodeURIComponent(targetUrl)}`;
};

export const getPostImageUrls = (post) => {
  const imageUrls = normalizeUrlArray(post?.image_urls);
  if (imageUrls.length > 0) return imageUrls;
  return normalizePhotoUrls(post?.photos_data);
};

export const getPostPrimaryImageUrl = (post, options = {}) => {
  const urls = getPostImageUrls(post);
  if (!urls.length) return null;
  return getProxiedImageUrl(urls[0], options);
};
