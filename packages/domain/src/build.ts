/**
 * Which build is actually running.
 *
 * "I don't think the updated version is live" is not a question anyone should have to
 * answer by looking at the interface and squinting, so both health probes report the
 * commit they were built from.
 *
 * Vercel sets `VERCEL_GIT_COMMIT_SHA` at build time. `ROSILLO_BUILD` overrides it for
 * hosts that do not, and `unknown` is the honest answer when neither is present —
 * better than a plausible-looking placeholder that would be mistaken for a real one.
 *
 * Seven characters: enough to identify a commit, and short enough that this is not a
 * meaningful disclosure to an unauthenticated caller. The repository is private and
 * the value names a revision, not its contents.
 */
export function buildRef(env: NodeJS.ProcessEnv = process.env): string {
  const sha = env['ROSILLO_BUILD']?.trim() || env['VERCEL_GIT_COMMIT_SHA']?.trim();
  if (!sha) return 'unknown';
  return sha.slice(0, 7);
}
