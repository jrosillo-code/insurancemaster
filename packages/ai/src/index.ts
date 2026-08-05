import type { ConciergeAIProvider } from './provider';
import { MockConciergeProvider } from './mock/mockProvider';

/**
 * @rosillo/ai — provider abstraction and prompt registry.
 *
 * Providers are untrusted (ADR-0005): every output is schema-validated and
 * policy-enforced by orchestration. The deterministic mock is the default, which is
 * what makes the evaluation suite's numbers comparable between runs.
 */

export * from './provider';
export * from './registry';
export { MockConciergeProvider } from './mock/mockProvider';
export { AnthropicConciergeProvider } from './anthropic/anthropicProvider';

/**
 * Resolves the provider from the environment. Anything other than an explicit
 * `AI_PROVIDER=anthropic` yields the mock — the safe default is the one that
 * cannot send synthetic content anywhere.
 */
export async function createProvider(name = process.env['AI_PROVIDER'] ?? 'mock'): Promise<ConciergeAIProvider> {
  if (name === 'anthropic') {
    const { AnthropicConciergeProvider } = await import('./anthropic/anthropicProvider');
    return new AnthropicConciergeProvider();
  }
  return new MockConciergeProvider();
}
