/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    API_URL: process.env.API_URL || "http://localhost:8000/api",
  },
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
