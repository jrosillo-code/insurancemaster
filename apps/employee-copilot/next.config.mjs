/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@rosillo/actions',
    '@rosillo/ai',
    '@rosillo/audit',
    '@rosillo/auth',
    '@rosillo/customer-360',
    '@rosillo/domain',
    '@rosillo/orchestration',
    '@rosillo/store',
  ],
  serverExternalPackages: ['@anthropic-ai/sdk'],
};

export default nextConfig;
