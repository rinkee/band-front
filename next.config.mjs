/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
          destination: `${process.env.BACKEND_API_URL}/:path*`,
        },
      ];
    }

    // 로컬 개발 환경 등 Vercel이 아닐 경우 프록시 없음
    console.log(
      "[next.config.js] Not applying rewrites (Non-Vercel environment)"
    );
    return [];
  },
  // env 블록은 build-time 환경 변수 주입용. rewrites의 런타임 변수와는 직접 관련 없음.
  // 필요 없다면 제거해도 무방.
  // env: {
  //   API_URL: process.env.API_URL || "http://localhost:8000/api",
  // },
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
