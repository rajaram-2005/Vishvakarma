/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
