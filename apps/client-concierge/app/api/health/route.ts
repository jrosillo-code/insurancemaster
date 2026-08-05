import { NextResponse } from 'next/server';
import { datasetSummary } from '@rosillo/customer-360';

/**
 * Liveness probe. Reports dataset shape so a deployment can be checked without
 * authenticating — it exposes counts only, never a record.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    surface: 'client-concierge',
    syntheticDataOnly: true,
    dataset: datasetSummary(),
  });
}
