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
    '@rosillo/retrieval',
    '@rosillo/store',
  ],
  // The Anthropic SDK is an optional dependency loaded at runtime only when
  // AI_PROVIDER=anthropic; keep the bundler from trying to trace it.
  serverExternalPackages: ['@anthropic-ai/sdk'],
};

export default nextConfig;
