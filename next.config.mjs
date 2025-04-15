/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.NODE_ENV === "preview"
    ) {
      return [
        {
          source: "/api/proxy/:path*",
          destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
        },
      ];
    }
    return [];
  },
  env: {
    API_URL: process.env.API_URL || "http://localhost:8000/api",
  },
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
