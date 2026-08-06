import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../../playwright.config';

/**
 * The glass material, asserted against a real browser rather than against the source.
 *
 * This file exists because of a defect that source review could not have caught. Both
 * stylesheets declared `backdrop-filter` *and* a hand-written `-webkit-backdrop-filter`
 * beside it. Lightning CSS — Next's minifier — prefixes that property from the build's
 * browser targets, and when it finds the prefixed form already present it collapses the
 * pair down to the prefixed declaration alone. Chrome has since dropped the
 * `-webkit-backdrop-filter` alias, so the shipped build had no blur at all in every
 * Chromium browser while the source still read as though it did.
 *
 * The lesson generalises past this one property: a design expressed through a build
 * pipeline is only actually shipped if something reads the computed value back. So
 * these assertions deliberately do not look at the CSS file. They ask the browser what
 * it resolved, on the built output, on the surfaces a user actually lands on.
 */

const PASSWORD = 'demo';

/** Every element in the design that is supposed to be frosted. */
const CLIENT_GLASS = ['.synthetic-banner', '.topbar', '.composer', '.bubble.assistant'];
const EMPLOYEE_GLASS = ['.synthetic-banner', '.topbar'];

async function computed(page: Page, selector: string, property: string): Promise<string> {
  return page.locator(selector).first().evaluate(
    (element, prop) => getComputedStyle(element).getPropertyValue(prop),
    property,
  );
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /^(Entrar|Sign in)$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test.describe('the frosted material survives the build', () => {
  test('the client surface resolves a real backdrop-filter on every glass panel', async ({
    page,
  }) => {
    await page.goto('/login');
    await signIn(page, 'ana@cliente.test');
    await page.locator('textarea[name="message"]').fill('¿Cuál es la franquicia de mi coche?');
    await page.getByRole('button', { name: /^(Enviar|Send)$/ }).click();
    await expect(page.locator('.bubble.assistant').last()).toBeVisible();

    for (const selector of CLIENT_GLASS) {
      const filter = await computed(page, selector, 'backdrop-filter');
      // `none` is what the property computes to when the declaration was dropped,
      // and it is indistinguishable from "no blur was ever asked for" — which is
      // exactly why the original defect was invisible.
      expect(filter, `${selector} should be frosted`).not.toBe('none');
      expect(filter, `${selector} should blur`).toContain('blur');
    }
  });

  test('the employee surface resolves a real backdrop-filter too', async ({ page }) => {
    await page.goto(`${E2E.employeeUrl}/login`);
    await signIn(page, 'carlos@rosillo.test');

    for (const selector of EMPLOYEE_GLASS) {
      const filter = await computed(page, selector, 'backdrop-filter');
      expect(filter, `${selector} should be frosted`).not.toBe('none');
    }
  });

  test('the ambient field behind the glass is actually painted', async ({ page }) => {
    await page.goto('/login');
    // Without a field there is nothing to blur, and every frosted panel degrades to a
    // flat grey rectangle. The mesh is drawn on body::before, so it is only reachable
    // through the pseudo-element.
    const mesh = await page.evaluate(
      () => getComputedStyle(document.body, '::before').backgroundImage,
    );
    expect(mesh).toContain('radial-gradient');
    expect(mesh, 'the field should be layered, not a single wash').toContain('), radial-gradient');
  });

  test('sticky chrome is more opaque than the cards that scroll under it', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, 'ana@cliente.test');
    // Evidence cards only exist once there is an answer to cite, and the home screen
    // is deliberately empty — so the comparison needs a question asked first.
    await page.locator('textarea[name="message"]').fill('¿Cuál es la franquicia de mi coche?');
    await page.getByRole('button', { name: /^(Enviar|Send)$/ }).click();
    await expect(page.locator('.evidence-card').first()).toBeVisible();

    const alpha = async (selector: string): Promise<number> => {
      const colour = await computed(page, selector, 'background-color');
      const match = colour.match(/rgba?\(([^)]+)\)/);
      const parts = match?.[1]?.split(',').map((value) => Number(value.trim())) ?? [];
      // An rgb() with no fourth component is fully opaque.
      return parts.length === 4 ? (parts[3] ?? 1) : 1;
    };

    // Content slides beneath the topbar and the composer. If they carry the same tint
    // as a resting card, the text underneath stays legible through them and the effect
    // reads as a rendering bug rather than as a material.
    const card = await alpha('.evidence-card');
    expect(await alpha('.topbar')).toBeGreaterThan(card);
    expect(await alpha('.composer')).toBeGreaterThan(card);
  });
});

test.describe('the effect never costs legibility', () => {
  test('anyone who asks for less transparency gets an opaque surface', async ({ page, context }) => {
    await page.goto('/login');

    // `page.emulateMedia()` has no argument for this feature, so it is set through the
    // DevTools protocol directly. Emulating the real media query matters: injecting
    // the fallback's values by hand would assert that the values are opaque without
    // ever proving the media query selects them.
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    });
    // Confirm the emulation took, so a silent no-op cannot make this test vacuous.
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches),
    ).toBe(true);

    // `.login-wrap` is the card. It used to be the form inside it, until a card
    // within a card turned out to be two borders and two shadows describing one
    // thing; the form is now unstyled and the wrapper carries the material.
    const card = page.locator('.login-wrap');
    await expect(card).toBeVisible();
    // It really is the glass element, so the assertions below cannot pass vacuously
    // against something that was never translucent to begin with.
    expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
    expect(
      await card.evaluate((el) => getComputedStyle(el).getPropertyValue('backdrop-filter')),
    ).toBe('none');
    // Fully opaque: an rgb() with no alpha component at all.
    await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    // The layout must be untouched — only the material changes. If reducing
    // transparency also moved things, the token indirection would not be earning
    // its keep.
    await expect(page.locator('.synthetic-banner')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Entrar|Sign in)$/ })).toBeVisible();
  });
});
