import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARK_SRC } from '../src/index';

/**
 * The mark is an asset, not code, so what is worth testing changed with it.
 *
 * An earlier version of this file asserted that three hand-transcribed copies of the
 * same Bézier paths still agreed — a test for a problem that should not have existed.
 * Now that replacing the logo is a file swap, the risks are different and smaller:
 * the file is missing, it is the wrong shape, it is enormous, or it reaches for
 * something the CSP will refuse.
 *
 * Deliberately format-agnostic. The point of the indirection is that a designer can
 * drop in whatever they exported, so a test that only understands SVG would undo it.
 */

const APPS = ['client-concierge', 'employee-copilot'] as const;

const ASSETS = APPS.map((app) => {
  const path = `apps/${app}/public${MARK_SRC}`;
  return { app, path, bytes: readFileSync(resolve(import.meta.dirname, '../../..', path)) };
});

/** Width and height, for the two formats a logo actually arrives in. */
function dimensions(bytes: Buffer): { width: number; height: number } | null {
  // PNG: an IHDR chunk at a fixed offset.
  if (bytes.subarray(1, 4).toString('latin1') === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  const text = bytes.toString('utf8');
  const box = text.match(/viewBox="([\d.\s-]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
  if (box?.length === 4) return { width: box[2] as number, height: box[3] as number };
  return null;
}

describe('both applications serve the mark', () => {
  for (const asset of ASSETS) {
    describe(asset.path, () => {
      it('exists and is not empty', () => {
        expect(asset.bytes.byteLength).toBeGreaterThan(0);
      });

      it('is square, so the toolbar lockup cannot skew it', () => {
        // Replacing the file is meant to need no code change, which only holds if the
        // replacement keeps the aspect ratio the components assume.
        const size = dimensions(asset.bytes);
        expect(size, 'could not read the asset dimensions').not.toBeNull();
        expect(size?.width).toBe(size?.height);
      });

      it('is small enough to sit in a toolbar', () => {
        // The largest use is 56px at 3× density. A multi-megabyte original would load
        // after the layout and shift it, which is the one thing a logo must not do.
        expect(asset.bytes.byteLength).toBeLessThan(250_000);
      });

      it('requests nothing from outside itself', () => {
        // Only meaningful for a vector asset; a raster cannot reference anything. An
        // <image href> or an @import would fail silently under the CSP and leave a
        // gap where the logo should be — the kind of break nobody notices in review.
        if (asset.bytes.subarray(1, 4).toString('latin1') === 'PNG') return;
        const text = asset.bytes.toString('utf8');
        expect(text).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
        expect(text).not.toContain('@import');
        // A favicon renders outside the page and cannot see the stylesheet, so a
        // `var(--…)` here resolves to nothing and the mark renders black.
        expect(text).not.toContain('var(--');
      });
    });
  }

  it('both applications serve the identical mark', () => {
    const [client, employee] = ASSETS;
    expect(client?.bytes.equals(employee?.bytes ?? Buffer.alloc(0))).toBe(true);
  });
});
