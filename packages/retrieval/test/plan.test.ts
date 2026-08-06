import { describe, expect, it } from 'vitest';
import { extractTerms, planRetrieval } from '../src/plan';

/**
 * Retrieval planning, and specifically what happens when a conversation continues.
 *
 * The plan's sources come from a fixed table keyed on the intent — a model never
 * names a data source — so the only part with any judgement in it is term extraction,
 * and the only recent change is that terms may now come from earlier turns as well as
 * from the current message. These pin down the three properties that makes safe:
 * the current message always wins, the carry is bounded, and nothing is retrieved
 * that the fixed table did not already permit.
 */

describe('the plan comes from the intent, not from the words', () => {
  it('reads the same sources however the question is phrased', () => {
    const a = planRetrieval('POLICY_FACT', '¿Cuál es la franquicia del coche?');
    const b = planRetrieval('POLICY_FACT', 'deducible', { priorClientTurns: ['una cosa', 'otra cosa'] });
    expect(a.sources).toEqual(b.sources);
    expect(a.includeSuperseded).toBe(b.includeSuperseded);
  });

  it('retrieves nothing client-specific for an out-of-scope question', () => {
    // Carried terms must not open a door the intent table closed.
    const plan = planRetrieval('OUT_OF_SCOPE', '¿Qué me recomiendas invertir?', {
      priorClientTurns: ['¿Cuál es la franquicia de mi seguro de hogar?'],
    });
    expect(plan.sources).toEqual([]);
  });
});

describe('a follow-up inherits the subject of the conversation', () => {
  it('carries terms from earlier client turns', () => {
    const alone = planRetrieval('POLICY_FACT', '¿Y esa?');
    expect(alone.terms).toEqual([]);

    const inThread = planRetrieval('POLICY_FACT', '¿Y esa?', {
      priorClientTurns: ['¿Qué cubre mi seguro de hogar en caso de inundación?'],
    });
    expect(inThread.terms).toContain('inundacion');
  });

  it('puts the current message first, so the thread can never displace it', () => {
    const plan = planRetrieval('POLICY_FACT', 'franquicia del coche', {
      priorClientTurns: ['inundación en el salón de mi casa'],
    });
    expect(plan.terms.indexOf('franquicia')).toBeLessThan(plan.terms.indexOf('inundacion'));
  });

  it('does not repeat a term the current message already supplied', () => {
    const plan = planRetrieval('POLICY_FACT', 'franquicia', {
      priorClientTurns: ['franquicia', 'franquicia'],
    });
    expect(plan.terms.filter((t) => t === 'franquicia')).toHaveLength(1);
  });

  it('reads only the last few turns, and never grows past the cap', () => {
    // A long conversation must not end up retrieving on the union of everything ever
    // said in it — that is not context, it is noise with a scope attached.
    const many = Array.from({ length: 40 }, (_, i) => `pregunta sobre asunto${i}xyz distinto`);
    const plan = planRetrieval('POLICY_FACT', 'franquicia coche', { priorClientTurns: many });
    expect(plan.terms.length).toBeLessThanOrEqual(12);
    // Only the tail is read: the first turns are gone.
    expect(plan.terms).not.toContain('asunto0xyz');
  });

  it('accepts the old numeric third argument rather than silently ignoring it', () => {
    // It used to be `maxPerSource`. A caller that still passes a number must not end
    // up planning with the default and a quietly different page size.
    expect(planRetrieval('POLICY_FACT', 'franquicia', 5).maxPerSource).toBe(5);
    expect(planRetrieval('POLICY_FACT', 'franquicia', { maxPerSource: 5 }).maxPerSource).toBe(5);
    expect(planRetrieval('POLICY_FACT', 'franquicia').maxPerSource).toBe(20);
  });
});

describe('term extraction stays deterministic', () => {
  it('produces the same terms for the same text, every time', () => {
    const text = '¿Cuánto pago por el seguro del coche este año?';
    expect(extractTerms(text)).toEqual(extractTerms(text));
  });

  it('drops words too common to discriminate between records', () => {
    expect(extractTerms('quiero saber sobre mi poliza')).toEqual([]);
  });
});
