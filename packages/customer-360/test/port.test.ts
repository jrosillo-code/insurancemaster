import { describe } from 'vitest';
import { SyntheticCustomer360, getSyntheticDataset } from '../src/index';
import { DATASET_TODAY } from '../src/synthetic/builders';
import { assertCustomer360Contract } from './conformance';

/**
 * The synthetic adapter against the port contract.
 *
 * It is the reference implementation, so it passing is close to a tautology — the
 * value is that the contract is now written down as executable assertions rather
 * than as prose in `port.ts`, and the second implementation runs the same file.
 */
describe('SyntheticCustomer360 satisfies the Customer360Port contract', () => {
  assertCustomer360Contract(async () => {
    const dataset = getSyntheticDataset();
    return { c360: new SyntheticCustomer360(dataset), dataset, today: DATASET_TODAY };
  });
});
