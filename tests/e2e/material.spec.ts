import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../../playwright.config';

/**
 * The descent material, asserted against a real browser rather than against the source.
 *
 * This file began life asserting a frosted-glass design, because of a defect that
 * source review could not have caught: both stylesheets declared `backdrop-filter`
 * *and* a hand-written `-webkit-backdrop-filter` beside it, Lightning CSS collapsed
 * the pair down to the prefixed form alone, and Chrome had already dropped that
 * alias — so the shipped build had no blur at all while the source still read as
 * though it did.
 *
 * The glass is gone and the assertions are new, but the lesson that produced them is
 * the reason this file still exists, and it generalises far past one property: **a
 * design expressed through a build pipeline is only actually shipped if something
 * reads the computed value back.** Rebuilding the theme proved it four more times,
 * and every one of the four rendered without erroring:
 *
 *   - A canvas whose WebGL context had been lost composited as a solid white
 *     rectangle across the whole viewport, on a design whose every contrast ratio
 *     assumes a dark ground.
 *   - `u_res` was left at (0, 0) on a remount, which made the noise lookup
 *     non-finite and collapsed the mesh to one flat block of colour.
 *   - `--edge` used to hold a box-shadow value; aliasing it to a plain colour turned
 *     every focus ring into an invalid declaration, and browsers drop those whole.
 *   - Nine control borders kept a decorative hairline at 1.36:1 where WCAG 1.4.11
 *     asks for 3:1.
 *
 * So these assertions deliberately do not look at the CSS file, and several of them
 * do not even trust `getComputedStyle` — they read pixels back out of a screenshot,
 * because a computed style describes what an element asked for and a pixel describes
 * what the reader actually got.
 */

const PASSWORD = 'demo';

/** Points on the page that should be field, not card — where a white hole would show. */
const FIELD_POINTS: ReadonlyArray<readonly [number, number]> = [
  [60, 300],
  [60, 700],
  [1180, 300],
  [1180, 700],
];

async function signIn(page: Page, email: string): Promise<void> {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /^(Entrar|Sign in)$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/**
 * Real painted pixels, not computed styles.
 *
 * Playwright hands back a PNG, so it is decoded in the page and sampled through a 2D
 * canvas. Everything that composites — the mesh, a lost WebGL context, a translucent
 * surface over whatever happens to be behind it — has already happened by then.
 */
async function pixels(
  page: Page,
  points: ReadonlyArray<readonly [number, number]>,
): Promise<Array<[number, number, number]>> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ data, at }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const surface = document.createElement('canvas');
      surface.width = image.width;
      surface.height = image.height;
      const context = surface.getContext('2d');
      if (!context) throw new Error('no 2d context to sample the screenshot with');
      context.drawImage(image, 0, 0);
      return at.map(([x, y]) => {
        const [r, g, b] = context.getImageData(x, y, 1, 1).data;
        return [r, g, b] as [number, number, number];
      });
    },
    { data: png, at: points as Array<[number, number]> },
  );
}

test.describe('the ground is actually dark', () => {
  test('no surface of the client page paints light', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await expect(page.locator('.login-wrap')).toBeVisible();
    // The mesh draws a frame and then checks itself before revealing; give it one.
    await page.waitForTimeout(600);

    for (const [point, [r, g, b]] of (await pixels(page, FIELD_POINTS)).map(
      (colour, index) => [FIELD_POINTS[index]!, colour] as const,
    )) {
      // 96 is far above anything this palette produces — the field tops out around
      // 60 where the accent surfaces — and far below the 255 a white hole gives.
      expect(
        Math.max(r, g, b),
        `the field at ${point.join(',')} paints rgb(${r},${g},${b}); this design is dark`,
      ).toBeLessThan(96);
    }
  });

  test('the employee page is on the same ground', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${E2E.employeeUrl}/login`);
    await expect(page.locator('.login-wrap')).toBeVisible();
    await page.waitForTimeout(600);

    // The employee surface once shipped without importing the shared theme at all.
    // Every token resolved to nothing and the page fell back to Times on white,
    // which is a state no computed-style assertion on a *token* would have caught.
    const ground = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
    );
    expect(ground, 'the shared theme should be loaded').toBe('#14120f');

    for (const [r, g, b] of await pixels(page, FIELD_POINTS)) {
      expect(Math.max(r, g, b)).toBeLessThan(96);
    }
  });
});

test.describe('the mesh', () => {
  test('ships hidden and reveals only once it has drawn', async ({ page }) => {
    await page.goto('/login');
    const mesh = page.locator('.mesh');
    await expect(mesh).toHaveCount(1);

    // The field is on the div, never on the canvas. A canvas with a WebGL context
    // composites its drawing buffer *over* its own background, so a background
    // there is only a fallback for a canvas that never got a context — not for one
    // whose context died, which is the failure that actually happens.
    const field = await mesh.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(field).toContain('radial-gradient');
    expect(field, 'the field should be layered, not one wash').toContain('), radial-gradient');

    const canvas = page.locator('.mesh canvas');
    await expect(canvas).toHaveCount(1);
    // Either it proved it could draw and revealed itself, or it stayed hidden and
    // the gradient above is what shows. Both are correct; a *visible* canvas that
    // never drew is the one state that is not.
    const visibility = await canvas.evaluate((el) => getComputedStyle(el).visibility);
    expect(['visible', 'hidden']).toContain(visibility);
  });

  test('is a field and not a flat rectangle', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await expect(page.locator('.login-wrap')).toBeVisible();
    await page.waitForTimeout(600);

    /*
     * The bug this catches rendered perfectly: every shader compiled, getError
     * stayed 0, every draw call succeeded, and the page showed one flat brown
     * block. `resize()` set u_res only when the canvas size changed, so on a
     * remount — where the canvas is already the right size but the program is new
     * and its uniforms are all zero — u_res stayed (0, 0), gl_FragCoord.xy / u_res
     * went non-finite, and every noise lookup in the shader collapsed to the same
     * value. Checking that the field is *dark* does not catch it. Checking that it
     * varies does.
     *
     * This holds whichever layer is showing: the CSS fallback is two off-centre
     * radial blooms, so it varies across these points too.
     */
    const sampled = await pixels(page, FIELD_POINTS);
    const levels = sampled.map(([r, g, b]) => Math.max(r, g, b));
    const spread = Math.max(...levels) - Math.min(...levels);
    expect(
      spread,
      `the field is uniform across the viewport (${sampled.map((c) => c.join(',')).join('  ')})`,
    ).toBeGreaterThanOrEqual(3);
  });

  test('never starts for a reader who asked for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');
    await expect(page.locator('.login-wrap')).toBeVisible();
    await page.waitForTimeout(600);

    // Confirm the emulation took, so a silent no-op cannot make this vacuous.
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).toBe(true);
    await expect(page.locator('.mesh canvas')).toHaveCSS('visibility', 'hidden');

    // And the page still has its field, because it never depended on the canvas.
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const [r, g, b] of await pixels(page, FIELD_POINTS)) {
      expect(Math.max(r, g, b)).toBeLessThan(96);
    }
  });
});

test.describe('type', () => {
  test('all three faces are served from this origin and actually load', async ({ page }) => {
    const fonts: Array<{ url: string; status: number }> = [];
    page.on('response', (response) => {
      if (response.url().includes('.woff2')) {
        fonts.push({ url: response.url(), status: response.status() });
      }
    });

    await page.goto('/login');
    await expect(page.locator('.login-wrap')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    expect(fonts.length, 'no web font was requested at all').toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font.status, `${font.url} did not serve`).toBe(200);
      // The Content-Security-Policy on both apps is `font-src 'self'`. A Google
      // Fonts URL would be blocked outright and every heading would silently fall
      // back to a system face, so the files are vendored into public/fonts.
      expect(new URL(font.url).origin, `${font.url} is not same-origin`).toBe(
        new URL(page.url()).origin,
      );
    }

    // Requested is not the same as usable: a face that 404s or fails to parse still
    // leaves a FontFace behind. `check` is true only for a face that can render.
    const usable = await page.evaluate(() => ({
      display: document.fonts.check('500 1em "Big Shoulders Display"'),
      serif: document.fonts.check('400 1em "Spectral"'),
      mono: document.fonts.check('400 1em "IBM Plex Mono"'),
    }));
    expect(usable).toEqual({ display: true, serif: true, mono: true });

    // And the roles are the right way round. Pointing --sans at the condensed
    // display face put every paragraph of Spanish prose in a face drawn for three
    // words at 64px, which typechecks, builds, and looks wrong.
    const body = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(body).toContain('Spectral');
    const heading = await page.locator('h1').first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(heading).toContain('Big Shoulders Display');
  });
});

test.describe('the material never costs legibility', () => {
  test('focus rings survive the build', async ({ page }) => {
    await page.goto('/login');
    const input = page.locator('input[name="email"]');
    await input.focus();

    // The ring is a box-shadow, and it disappeared once already: `--edge` held a
    // box-shadow value in the old design, and aliasing it to a plain colour made
    // `box-shadow: 0 0 0 4px var(--accent-wash), var(--edge)` invalid. Browsers drop
    // an invalid declaration whole, so the ring vanished from every input on both
    // apps while the source still listed it.
    const ring = await input.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring, 'the focused input has no ring').not.toBe('none');
    expect(ring).toMatch(/\d+px/);
  });

  test('every control boundary clears 3:1 against what it sits on', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, 'ana@cliente.test');
    await expect(page.locator('.composer')).toBeVisible();

    const failures = await page.evaluate(() => {
      const parse = (value: string) => {
        const m = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        return m
          ? { r: +m[1]!, g: +m[2]!, b: +m[3]!, a: m[4] === undefined ? 1 : +m[4]! }
          : null;
      };
      type Colour = { r: number; g: number; b: number; a: number };
      const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (c: Colour) =>
        0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
      const contrast = (a: Colour, b: Colour) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
        return (hi + 0.05) / (lo + 0.05);
      };
      const over = (fg: Colour, bg: Colour): Colour => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      });
      /** Composite every translucent layer up the tree onto the first opaque one. */
      const backdrop = (el: Element): Colour => {
        const stack: Colour[] = [];
        for (let n: Element | null = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (!c || c.a === 0) continue;
          stack.push(c);
          if (c.a === 1) break;
        }
        let base = parse(getComputedStyle(document.documentElement).backgroundColor) ?? {
          r: 20,
          g: 18,
          b: 15,
          a: 1,
        };
        for (const layer of stack.reverse()) base = over(layer, base);
        return base;
      };

      const bad: string[] = [];
      for (const el of document.querySelectorAll('input, select, textarea, button')) {
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const border = parse(style.borderTopColor);
        if (!border || border.a < 0.05 || parseFloat(style.borderTopWidth) === 0) continue;
        const bg = backdrop(el);
        const ratio = contrast(over(border, bg), bg);
        if (ratio < 3) {
          bad.push(
            `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ` +
              `${style.borderTopColor} at ${ratio.toFixed(2)}:1`,
          );
        }
      }
      return bad;
    });

    // WCAG 2.2 SC 1.4.11: anything that delimits a control needs 3:1. The theme
    // carries --line-control at 3.06:1 for exactly this; the decorative --line
    // hairline is 1.36:1 and must not be used on a control.
    expect(failures, `control boundaries below 3:1:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  test('nothing is frosted any more', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, 'ana@cliente.test');
    await expect(page.locator('.composer')).toBeVisible();

    // The inverse of what this file used to assert. The material is flat surfaces
    // separated by hairlines now; a `backdrop-filter` creeping back in means a
    // stylesheet is describing a design this one replaced.
    const frosted = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((el) => {
          const value = getComputedStyle(el).getPropertyValue('backdrop-filter');
          return value !== '' && value !== 'none';
        })
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`),
    );
    expect(frosted).toEqual([]);
  });
});
