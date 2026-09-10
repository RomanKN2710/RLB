/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '4mb' }, outputFileTracingIncludes: { '/api/setup': ['./db/**/*'] } },
};
module.exports = nextConfig;
