import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIGHT_PATH, MARK_VIEWBOX, RECORD_PATHS, SHIELD_PATH } from '../src/index.js';

/**
 * The mark is drawn in three places — the React component here, and a static
 * `app/icon.svg` in each application — because a favicon is rendered outside the page
 * and cannot reach a component or a CSS token. Three copies of the same geometry is a
 * standing invitation to drift: someone adjusts the shield, the toolbar updates, and
 * the browser tab quietly keeps the old one for months.
 *
 * So the copies are asserted rather than trusted.
 */

const ICONS = [
  'apps/client-concierge/app/icon.svg',
  'apps/employee-copilot/app/icon.svg',
].map((relative) => ({
  path: relative,
  source: readFileSync(resolve(import.meta.dirname, '../../..', relative), 'utf8'),
}));

describe('the favicon matches the component', () => {
  for (const icon of ICONS) {
    describe(icon.path, () => {
      it('uses the same shield', () => {
        expect(icon.source).toContain(SHIELD_PATH);
      });

      it('uses the same light catch and record', () => {
        expect(icon.source).toContain(LIGHT_PATH);
        for (const line of RECORD_PATHS) {
          expect(icon.source).toContain(line);
        }
      });

      it('uses the same coordinate space, so nothing is cropped or floating', () => {
        expect(icon.source).toContain(`viewBox="${MARK_VIEWBOX}"`);
      });

      it('carries literal colours rather than tokens it cannot resolve', () => {
        // `var(--…)` in a favicon resolves to nothing and the shield renders black.
        expect(icon.source).not.toContain('var(--');
        expect(icon.source).toContain('#0a6b74');
      });

      it('requests nothing from outside itself', () => {
        // The CSP allows no remote origin; an <image href> or @import would fail
        // silently and leave an empty tab icon.
        expect(icon.source).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
      });
    });
  }

  it('both applications ship the identical mark', () => {
    const [client, employee] = ICONS;
    expect(client?.source).toBe(employee?.source);
  });
});
