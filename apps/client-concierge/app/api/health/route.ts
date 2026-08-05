import { NextResponse } from 'next/server';
import { datasetSummary } from '@rosillo/customer-360';
import { buildRef } from '@rosillo/domain';
import { resolveStoreKind } from '@rosillo/store';

/**
 * Liveness probe. Counts only, never a record.
 *
 * It reports two things beyond `ok`, because both answer questions that are otherwise
 * only answerable by guessing at a running deployment:
 *
 *   - `store`. `DATABASE_URL` unset on a serverless host selects the JSONL store,
 *     whose filesystem is neither shared between the two applications nor durable
 *     between requests. The deployment appears to work, silently loses every
 *     conversation, and the handoff to the employee workspace never happens. Seeing
 *     `jsonl` here names that in one request.
 *   - `commit`. Whether the version someone just pushed is the version running.
 *
 * `syntheticDataOnly` is a literal, not a measurement, and is marked as such below. It
 * states the platform's contract; it does not verify it. The evidence for that claim
 * is structural: the dataset is generated in `packages/customer-360` and no connector
 * to a real source exists anywhere in the codebase.
 *
 * The store kind reported is the *configured* one, not a proven-reachable one —
 * probing the database on every liveness hit would turn a cheap check into one that
 * can hang. `scripts/check-deployment.mjs` proves the database genuinely works, by the
 * only means that cannot be faked: creating a task in one application and finding it
 * in the other.
 */

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    surface: 'client-concierge',
    /** A contract this codebase keeps by construction, not a runtime measurement. */
    syntheticDataOnly: true,
    store: resolveStoreKind(),
    commit: buildRef(),
    dataset: datasetSummary(),
  });
}
