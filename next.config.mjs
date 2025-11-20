/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // GitHub Pages(정적 호스팅) 빌드 시에만 정적 export + basePath 적용
  ...(isGithubPages
    ? {
        output: "export",
        // 리포지토리명이 band-front 이므로 basePath/assetPrefix 설정
        basePath: "/band-front",
        assetPrefix: "/band-front/",
        // GitHub Pages에서는 이미지 최적화 서버가 없으므로 비활성화
        images: { unoptimized: true },
        // export 시 라우팅 호환을 위해 권장
        trailingSlash: true,
      }
    : {}),
  async redirects() {
    return [
      {
        source: '/orders',
        destination: '/orders-test',
        permanent: false, // 임시 리다이렉트 (307)
      },
      {
        source: '/orders/:path*',
        destination: '/orders-test/:path*',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    // Vercel 시스템 환경 변수를 사용하는 것이 더 안정적일 수 있습니다.
    const isVercel = !!process.env.VERCEL_ENV; // Vercel 환경인지 확인 (production, preview, development 중 하나)

    // if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "preview") { // 이것도 작동은 하겠지만 VERCEL_ENV가 더 명확함
    if (isVercel) {
      // Vercel 환경 (Production 또는 Preview)에서는 프록시 적용
      console.log(
        `[next.config.js] Applying rewrites for Vercel environment: ${process.env.VERCEL_ENV}`
      );
      return [
        {
          source: "/api/proxy/:path*",
          // 👇 여기가 중요! 실제 백엔드 주소를 가진 환경 변수 사용
          destination: `${process.env.BACKEND_API_URL}/api/:path*`,
        },
      ];
    }

    // 로컬 개발/GitHub Pages 등 Vercel이 아닐 경우 프록시 없음
    console.log(
      "[next.config.js] Not applying rewrites (Non-Vercel environment)"
    );
    return [];
  },
  // 배포 시 HTML은 항상 새로 받고, 해시된 정적 자산만 장기 캐싱
  async headers() {
    return [
      // Next 빌드 산출물: 파일명에 해시가 포함되므로 강력 캐싱
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // 폰트 등 정적 리소스도 동일하게 캐싱 (경로에 맞게 추가)
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // 나머지 응답(HTML 등)은 캐시 금지
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
  // env 블록은 build-time 환경 변수 주입용. rewrites의 런타임 변수와는 직접 관련 없음.
  // 필요 없다면 제거해도 무방.
  // env: {
  //   API_URL: process.env.API_URL || "http://localhost:8000/api",
  // },
  //
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
