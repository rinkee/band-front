/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/proxy/:path*",
        // 👇 실제 백엔드 주소를 가진 BACKEND_API_URL 사용
        destination: `${process.env.BACKEND_API_URL}/:path*`,
      },
    ];
  },
  env: {
    API_URL: process.env.API_URL || "http://localhost:8000/api",
  },
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
