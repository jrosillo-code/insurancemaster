import { NextResponse } from 'next/server';
import { buildRef } from '@rosillo/domain';
import { resolveStoreKind } from '@rosillo/store';

/**
 * Liveness probe. See the client surface's route for why `store` and `commit` are
 * here: the first names the failure where a serverless deployment quietly uses a
 * filesystem store it does not share with the other application, and the second says
 * which build is running.
 *
 * Both surfaces must report the same `store`. Two applications on different stores is
 * the exact configuration in which the handoff appears to work on each side and never
 * crosses between them.
 */

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    surface: 'employee-copilot',
    /** A contract this codebase keeps by construction, not a runtime measurement. */
    syntheticDataOnly: true,
    store: resolveStoreKind(),
    commit: buildRef(),
  });
}
