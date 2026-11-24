/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '4mb' }, outputFileTracingIncludes: { '/api/setup': ['./db/**/*'], '/admin': ['./db/seed/**/*'], '/api/handbuch': ['./docs/handbuch/rlb-admin-handbuch.pdf'] } },
  // Für alle Seiten: nicht in fremde Seiten einbettbar, kein Raten des Inhaltstyps, Adressen nicht an fremde Seiten weitergeben
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'same-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]; },
};
module.exports = nextConfig;
