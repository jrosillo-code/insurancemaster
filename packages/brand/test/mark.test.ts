import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARK_SRC } from '../src/index';

/**
 * The mark is an asset, not code, so what is worth testing changed with it.
 *
 * There is no longer any geometry to keep in sync — the previous version of this file
 * asserted that three hand-transcribed copies of the same Bézier paths still agreed,
 * which was a test for a problem that should not have existed. What matters now is
 * that both applications actually serve something at the path the components request,
 * that it is a square so the toolbar lockup does not skew, and that it reaches for
 * nothing outside itself, since the CSP would refuse it silently and leave a hole
 * where the logo should be.
 */

const APPS = ['client-concierge', 'employee-copilot'] as const;

const ASSETS = APPS.map((app) => {
  const path = `apps/${app}/public${MARK_SRC}`;
  return { app, path, source: readFileSync(resolve(import.meta.dirname, '../../..', path), 'utf8') };
});

describe('both applications serve the mark', () => {
  for (const asset of ASSETS) {
    describe(asset.path, () => {
      it('exists and is not empty', () => {
        expect(asset.source.trim().length).toBeGreaterThan(0);
      });

      it('is square, so the lockup cannot skew it', () => {
        // Replacing the file is meant to need no code change, which only holds if the
        // replacement keeps the aspect ratio the components assume.
        const box = asset.source.match(/viewBox="([\d.\s-]+)"/)?.[1]?.trim().split(/\s+/);
        expect(box, 'an SVG mark needs a viewBox to scale').toBeDefined();
        const [, , width, height] = (box ?? []).map(Number);
        expect(width).toBe(height);
      });

      it('requests nothing from outside itself', () => {
        // An <image href> or an @import would fail silently under the CSP and leave a
        // gap where the logo should be — the kind of break nobody notices in review.
        expect(asset.source).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
        expect(asset.source).not.toContain('@import');
      });

      it('carries literal colours rather than tokens it cannot resolve', () => {
        // The favicon renders outside the page and cannot see the stylesheet, so a
        // `var(--…)` here resolves to nothing and the mark renders black.
        expect(asset.source).not.toContain('var(--');
      });
    });
  }

  it('both applications serve the identical mark', () => {
    const [client, employee] = ASSETS;
    expect(client?.source).toBe(employee?.source);
  });
});
