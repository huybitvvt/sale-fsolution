import type { NextConfig } from 'next';

const apiProxyBase = (process.env.API_PROXY_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
