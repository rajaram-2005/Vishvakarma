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
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
