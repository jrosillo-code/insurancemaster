import { join } from 'node:path';

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
  serverExternalPackages: ['@anthropic-ai/sdk', 'postgres'],
  // The workspace root, not the app directory. Without it Next traces from the app
  // folder and a monorepo deployment ships without its workspace packages.
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
};

export default nextConfig;
