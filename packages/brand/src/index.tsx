/**
 * The Rosillo mark.
 *
 * Drawn in code rather than shipped as an asset, for a reason that is not aesthetic:
 * the Content-Security-Policy on both surfaces allows `img-src 'self' data:` and no
 * remote origin at all, so anything fetched from a CDN would simply not render. An
 * inline SVG also scales without a second file and inherits the page's colours.
 *
 * What it is: a shield, because that is the honest signifier for insurance and it
 * still reads at 18px in a toolbar. Two things make it this platform's shield rather
 * than a generic one:
 *
 *   - A light-catch plane across the upper left, the same gesture the interface makes
 *     with `--edge` on every frosted panel. The mark is made of the same material as
 *     the thing it labels.
 *   - Three knocked-out lines that taper as the shield tapers — a record, not a
 *     padlock. What this product actually does is show you the paperwork behind an
 *     answer; a padlock would promise security, and a speech bubble would promise
 *     a chatbot. Neither is the claim being made.
 *
 * The geometry lives here as exported constants because it is used in three places
 * that must never drift: this component, and the static `app/icon.svg` in each
 * application. `packages/brand/test/mark.test.ts` asserts they still agree.
 */

export const MARK_VIEWBOX = '0 0 32 32';

/** The shield outline. Rounded shoulders, a soft point, no bevel. */
export const SHIELD_PATH =
  'M16 2.4 L27.8 6.6 C28.5 6.85 29 7.5 29 8.25 V15.6 C29 22.6 23.6 27.6 16.5 29.9 ' +
  'A1.6 1.6 0 0 1 15.5 29.9 C8.4 27.6 3 22.6 3 15.6 V8.25 C3 7.5 3.5 6.85 4.2 6.6 Z';

/** The light catch: a plane across the upper left, clipped to the shield. */
export const LIGHT_PATH = 'M3 7.4 L29 3 V12.6 L3 20.6 Z';

/**
 * The record knocked out of the shield: three centred lines, each narrower than the
 * one above, so the block tapers the way the shield does. Ordered top to bottom.
 */
export const RECORD_PATHS = [
  'M9.4 13.3 H22.6 A1.3 1.3 0 0 1 22.6 15.9 H9.4 A1.3 1.3 0 0 1 9.4 13.3 Z',
  'M10.9 17.6 H21.1 A1.3 1.3 0 0 1 21.1 20.2 H10.9 A1.3 1.3 0 0 1 10.9 17.6 Z',
  'M12.7 21.9 H19.3 A1.3 1.3 0 0 1 19.3 24.5 H12.7 A1.3 1.3 0 0 1 12.7 21.9 Z',
] as const;

/** Each line is a shade fainter than the last, so the taper reads even in monochrome. */
const RECORD_OPACITY = [0.96, 0.82, 0.66] as const;

export interface MarkProps {
  /** Rendered size in px. The mark is square. */
  size?: number;
  /**
   * Ids inside an SVG are document-global, so two marks on one page would share a
   * gradient. Callers that render more than one must pass distinct prefixes.
   */
  idPrefix?: string;
  className?: string;
}

/**
 * The mark on its own, with no wordmark.
 *
 * Presentational: `aria-hidden`, because it always appears beside the name in text.
 * A screen reader that announced both would say "Rosillo Rosillo".
 */
export function RosilloMark({ size = 26, idPrefix = 'rosillo', className }: MarkProps) {
  const gradient = `${idPrefix}-g`;
  const clip = `${idPrefix}-c`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0%" stopColor="var(--mark-top, #23a3ad)" />
          <stop offset="100%" stopColor="var(--mark-bottom, #0a6b74)" />
        </linearGradient>
        <clipPath id={clip}>
          <path d={SHIELD_PATH} />
        </clipPath>
      </defs>
      <path d={SHIELD_PATH} fill={`url(#${gradient})`} />
      <path d={LIGHT_PATH} fill="#ffffff" fillOpacity="0.26" clipPath={`url(#${clip})`} />
      {RECORD_PATHS.map((d, index) => (
        <path key={d} d={d} fill="#ffffff" fillOpacity={RECORD_OPACITY[index] ?? 0.7} />
      ))}
    </svg>
  );
}

export interface LockupProps extends MarkProps {
  /** The qualifier after the name — "Asistente" on the client surface, "Empleado" on the other. */
  qualifier?: string;
}

/**
 * Mark plus wordmark, as it appears in a toolbar or above a sign-in form.
 *
 * The name is set in the display face at a tighter tracking than body text, which is
 * what makes it read as a wordmark rather than as a heading that happens to be bold.
 */
export function RosilloLockup({ qualifier, size = 26, idPrefix = 'rosillo', className }: LockupProps) {
  return (
    <span className={['lockup', className].filter(Boolean).join(' ')}>
      <RosilloMark size={size} idPrefix={idPrefix} />
      <span className="lockup-name">
        Rosillo
        {qualifier ? <span className="lockup-qualifier"> · {qualifier}</span> : null}
      </span>
    </span>
  );
}
