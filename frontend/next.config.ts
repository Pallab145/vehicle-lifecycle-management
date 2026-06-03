import type { NextConfig } from "next";

// Server-only — used by Next.js to proxy /api/* to the backend internally.
const BACKEND_URL = process.env.INTERNAL_BACKEND_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Proxy /api/* to the backend gateway to avoid CORS and handle cookies properly
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding', 'ws');
    return config;
  },
  turbopack: {
    resolveAlias: {
      ws: './src/lib/ws-stub.ts',
      'pino-pretty': './src/lib/empty-stub.ts',
      lokijs: './src/lib/empty-stub.ts',
      encoding: './src/lib/empty-stub.ts',
    },
  },
};

export default nextConfig;
