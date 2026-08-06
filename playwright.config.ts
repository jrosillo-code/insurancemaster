import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * Both applications are started against one shared JSONL data directory, because the
 * property most worth testing end to end is the handoff: a task created by the client
 * has to appear in the employee workspace, and the employee's decision has to reach
 * the client. Two processes sharing a directory is what the prototype actually does
 * (ADR-0011), so the test exercises the real path rather than a stub.
 *
 * Ports are deliberately not the dev defaults, so a running `npm run dev` does not
 * collide with a test run.
 */

const CLIENT_PORT = 3210;
const EMPLOYEE_PORT = 3211;
/**
 * Absolute on purpose. `npm run start -w <package>` runs with the package directory
 * as its cwd, so a relative path would give each application its own private data
 * directory and the handoff would silently never happen.
 */
const DATA_DIR = resolve(__dirname, '.data/e2e');

/**
 * The environment ships Chromium at a fixed path with a pinned revision that will
 * not match whatever Playwright expects; `executablePath` avoids a download attempt
 * that the sandbox would refuse anyway.
 */
const chromiumPath = process.env['PLAYWRIGHT_CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium';

/**
 * `next start` runs with NODE_ENV=production, where the platform refuses to sign a
 * session with the placeholder secret. A fixed test value keeps the run reproducible
 * and is worthless outside this suite.
 */
const TEST_AUTH_SECRET = 'e2e-only-secret-not-used-anywhere-else-0123456789';

/**
 * The suite drives one synthetic account far harder than a person could.
 *
 * Twenty messages a minute is the shipped guard against runaway loops, and it is
 * generous for somebody typing. It is not generous for two browser projects running
 * the same conversations against the same account inside half a minute, which is
 * what happens here — a suite that fails on its own throughput is telling you about
 * itself rather than about the product.
 *
 * Raised only for the servers this file starts. `tests/security` still asserts the
 * shipped default, so this cannot quietly become the product's limit.
 */
const TEST_RATE_LIMIT = '500';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${CLIENT_PORT}`,
    trace: 'retain-on-failure',
    locale: 'es-ES',
    launchOptions: { executablePath: chromiumPath },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: chromiumPath } },
    },
    {
      // Milestone C is mobile-first, so the client surface is also exercised at
      // phone width rather than only on a desktop viewport.
      name: 'mobile',
      testMatch: /client-concierge\.spec\.ts/,
      use: { ...devices['Pixel 7'], launchOptions: { executablePath: chromiumPath } },
    },
  ],
  webServer: [
    {
      command: `npm run start -w @rosillo/client-concierge -- -p ${CLIENT_PORT}`,
      url: `http://127.0.0.1:${CLIENT_PORT}/api/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: {
        ROSILLO_DATA_DIR: DATA_DIR,
        AUTH_SECRET: TEST_AUTH_SECRET,
        RATE_LIMIT_MAX_MESSAGES: TEST_RATE_LIMIT,
      },
    },
    {
      command: `npm run start -w @rosillo/employee-copilot -- -p ${EMPLOYEE_PORT}`,
      url: `http://127.0.0.1:${EMPLOYEE_PORT}/api/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: {
        ROSILLO_DATA_DIR: DATA_DIR,
        AUTH_SECRET: TEST_AUTH_SECRET,
        RATE_LIMIT_MAX_MESSAGES: TEST_RATE_LIMIT,
      },
    },
  ],
});

export const E2E = {
  clientUrl: `http://127.0.0.1:${CLIENT_PORT}`,
  employeeUrl: `http://127.0.0.1:${EMPLOYEE_PORT}`,
  dataDir: DATA_DIR,
};
