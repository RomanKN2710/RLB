/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '4mb' }, outputFileTracingIncludes: { '/api/setup': ['./db/**/*'], '/admin': ['./db/seed/**/*'], '/api/handbuch': ['./docs/handbuch/rlb-admin-handbuch.pdf'] } },
};
module.exports = nextConfig;
