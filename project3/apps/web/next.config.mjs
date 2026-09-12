/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone output is only for container images (Dockerfile.web sets
  // Aetherion_STANDALONE=1); local `next start` requires the default output.
  ...(process.env.Aetherion_STANDALONE ? { output: 'standalone' } : {}),
  transpilePackages: [
    '@sutra/shared',
    '@sutra/model-adapters',
    '@sutra/tool-adapters',
    '@sutra/puter-adapter',
    '@sutra/workflow-sdk',
    '@sutra/evaluation-sdk',
    '@sutra/plugin-sdk',
    '@sutra/sdk',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // NOTE: no X-Frame-Options header. It was set to DENY, which made the
          // browser refuse to render the app inside the Arena live-preview
          // iframe (and any site embedding the workspace). The workspace is
          // meant to be embeddable, so framing is explicitly allowed.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Public API surface: the embedded Aetheris core (/api/health,
      // /api/capabilities, /api/chat, …) and the own-model family
      // (/api/localmodels/…) are callable from any origin, so Aetherion
      // works as an online AI backend for other apps too.
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With, Last-Event-ID' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
