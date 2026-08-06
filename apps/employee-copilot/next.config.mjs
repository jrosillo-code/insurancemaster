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
    '@rosillo/store',
  ],
  serverExternalPackages: ['@anthropic-ai/sdk', 'postgres'],
  // The workspace root, not the app directory. Without it Next traces from the app
  // folder and a monorepo deployment ships without its workspace packages.
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  // Next writes AGENTS.md and CLAUDE.md into the app directory on every run. This
  // repository states its own conventions in docs/ and CONTRIBUTING; a generated
  // pair of files describing the framework is noise in `git status` and would be
  // committed by accident sooner or later.
  agentRules: false,
};

export default nextConfig;
