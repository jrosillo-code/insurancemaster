import { expect, test } from '@playwright/test';
import { E2E } from '../../playwright.config';

/**
 * Transport and content security headers, checked against the running applications.
 *
 * A CSP that is defined but not actually emitted, or one so strict the page stops
 * working, are both failures — and only a real request through a real browser
 * distinguishes them. The last test here loads the app and asserts it still functions
 * under the policy.
 */

const SURFACES = [
  { name: 'client concierge', url: `${E2E.clientUrl}/login` },
  { name: 'employee copilot', url: `${E2E.employeeUrl}/login` },
];

for (const surface of SURFACES) {
  test(`${surface.name} sets a nonce-based content security policy`, async ({ page }) => {
    const response = await page.goto(surface.url);
    expect(response).not.toBeNull();
    const csp = response?.headers()['content-security-policy'] ?? '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Nothing in the browser talks to a third party: provider calls are server-side,
    // which is what keeps credentials out of the bundle.
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
  });

  test(`${surface.name} sets the remaining hardening headers`, async ({ page }) => {
    const response = await page.goto(surface.url);
    const headers = response?.headers() ?? {};

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    // A client's policy data must not leak through a referrer, not even as a path.
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['permissions-policy']).toContain('geolocation=()');
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  test(`${surface.name} issues a different nonce on every request`, async ({ page }) => {
    const first = (await page.goto(surface.url))?.headers()['content-security-policy'] ?? '';
    const second = (await page.reload())?.headers()['content-security-policy'] ?? '';
    const nonceOf = (csp: string) => /nonce-([^']+)/.exec(csp)?.[1];

    expect(nonceOf(first)).toBeTruthy();
    // A reused nonce is a nonce that an injected script can simply copy.
    expect(nonceOf(first)).not.toBe(nonceOf(second));
  });
}

test('the employee workspace refuses to be indexed', async ({ page }) => {
  const response = await page.goto(`${E2E.employeeUrl}/login`);
  expect(response?.headers()['x-robots-tag']).toContain('noindex');
});

test('the client app still works with the policy applied', async ({ page }) => {
  // The point of the browser here: a CSP that blocks Next's own scripts produces a
  // page that renders and then does nothing, which no header assertion would catch.
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /content security policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });

  await page.goto(`${E2E.clientUrl}/login`);
  await page.locator('input[name="email"]').fill('ana@cliente.test');
  await page.locator('input[name="password"]').fill('demo');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/chat**');

  await page.locator('textarea[name="message"]').fill('¿Cuál es la franquicia de mi coche?');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('.bubble.assistant').last()).toContainText('300');

  expect(violations, `CSP blocked something the app needs:\n${violations.join('\n')}`).toEqual([]);
});
