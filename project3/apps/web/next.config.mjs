/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone output is only for container images (Dockerfile.web sets
  // SUTRA_STANDALONE=1); local `next start` requires the default output.
  ...(process.env.SUTRA_STANDALONE ? { output: 'standalone' } : {}),
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
    ];
  },
};

export default nextConfig;
