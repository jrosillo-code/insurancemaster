/**
 * The Rosillo mark.
 *
 * The artwork is **not** in this file. It lives at `public/rosillo-mark.svg` in each
 * application and is rendered by URL, which makes replacing the logo a file swap
 * rather than a code change — drop the real artwork over that file, keep the name and
 * a square viewBox, and every toolbar and sign-in screen follows.
 *
 * That indirection is the point, and it is a correction of how this started. A logo
 * is data; a monogram transcribed into Bézier coordinates inside a React component is
 * data pretending to be code. Nobody can change it without a developer, and a
 * hand-transcription of a designer's file will never be quite right — which is
 * exactly what happened here across four attempts. A file the design tool exports is
 * exact by construction.
 *
 * A same-origin asset is also the only kind that renders: the CSP allows
 * `img-src 'self' data:` and no remote origin at all, so a CDN URL would silently
 * fail. SVG is preferred for crispness at every size; a PNG at the same path works
 * equally well if that is what exists.
 *
 * `packages/brand/test/mark.test.ts` checks the asset is present in both applications
 * and that it asks nothing of the outside world.
 */

/** Where each application serves the mark from. Same path in both, by convention. */
export const MARK_SRC = '/rosillo-mark.svg';

export interface MarkProps {
  /** Rendered size in px. The mark is square. */
  size?: number;
  className?: string;
  /** Override the asset path, for a surface that wants different artwork. */
  src?: string;
  /**
   * Accepted for call-site compatibility with the previous inline-SVG mark, and
   * ignored: there is no longer an inline gradient id to collide over.
   */
  idPrefix?: string;
}

/**
 * The mark on its own, with no wordmark.
 *
 * `alt=""` and `aria-hidden`: it always appears beside the name in text, and a screen
 * reader that announced both would say "Rosillo Rosillo".
 *
 * Width and height are set so the space is reserved before the asset loads. A logo
 * that reflows the toolbar on arrival is the cheapest possible layout shift to avoid.
 */
export function RosilloMark({ size = 26, className, src = MARK_SRC }: MarkProps) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
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
export function RosilloLockup({ qualifier, size = 26, className, src }: LockupProps) {
  return (
    <span className={['lockup', className].filter(Boolean).join(' ')}>
      <RosilloMark size={size} {...(src ? { src } : {})} />
      <span className="lockup-name">
        Rosillo
        {qualifier ? <span className="lockup-qualifier"> · {qualifier}</span> : null}
      </span>
    </span>
  );
}
