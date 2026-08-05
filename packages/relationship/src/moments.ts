import { z } from 'zod';
import { type ClientMemory, type MemoryPurpose, isStale, memoriesFor } from './memory';

/**
 * The proactive relationship engine.
 *
 * "Tu hijo cumple 18 años próximamente. Hay algunas coberturas que pueden cambiar."
 * is the product. The engineering question is who decides that sentence is warranted,
 * and the answer here is: deterministic rules over stored records, never the model.
 *
 * This is the same division that governs the rest of the platform. The model drafts
 * language; code decides what is true and what is permitted. Applied to proactive
 * contact, that matters more than anywhere else, because the failure mode is not a
 * wrong answer to a question the client asked — it is Rosillo appearing to know
 * something about your family that nobody told it. One of those is a bug. The other
 * ends the relationship the feature exists to protect.
 *
 * So a moment is a *finding*: a code, the record ids it rests on, and the consent it
 * requires. The wording comes later and may only restate what the finding contains.
 *
 * SYNTHETIC DATA ONLY.
 */

export const MOMENT_CODES = [
  'RENEWAL_APPROACHING',
  'CHILD_REACHES_18',
  'TRAVEL_PLANNED',
  'CLAIM_FOLLOW_UP',
  'CIRCUMSTANCE_REVIEW',
  'MEMORY_NEEDS_CONFIRMING',
] as const;
export const momentCodeSchema = z.enum(MOMENT_CODES);
export type MomentCode = z.infer<typeof momentCodeSchema>;

/**
 * Why a moment is worth a person's attention. Not a priority score — a reason, so a
 * supervisor reviewing the queue can disagree with it.
 */
export const MOMENT_REASONS: Record<MomentCode, string> = {
  RENEWAL_APPROACHING: 'A policy renews soon and the terms are worth reviewing together.',
  CHILD_REACHES_18: 'A family member reaches an age at which cover commonly changes.',
  TRAVEL_PLANNED: 'The client mentioned a trip; international cover may need checking.',
  CLAIM_FOLLOW_UP: 'A claim was opened recently and nobody has asked how they are.',
  CIRCUMSTANCE_REVIEW: 'The client described a change that may affect whether cover still fits.',
  MEMORY_NEEDS_CONFIRMING: 'Something on file is old enough that it should be confirmed, not assumed.',
};

export interface ProactiveMoment {
  code: MomentCode;
  /** The account this concerns. */
  accountId: string;
  /**
   * Every record this rests on: memory ids and policy/claim ids. The client can be
   * shown exactly this list — "here is why I got in touch" — and an adviser can check
   * it. A moment with an empty basis is a bug and is refused below.
   */
  basis: string[];
  /** The consent that must be held before anyone acts on it. */
  requiresPurpose: MemoryPurpose;
  /** Earliest sensible contact date, so nothing fires the instant a record appears. */
  notBefore: string;
  /** The date the moment is about, where it has one. */
  onDate?: string;
  reason: string;
  /**
   * Facts the drafter may use, already resolved. The model receives this and nothing
   * else about the client — it cannot reach for a memory that is not here, because it
   * is never given one.
   */
  facts: Record<string, string>;
}

export interface RelationshipInput {
  accountId: string;
  today: string;
  memories: ClientMemory[];
  /** Renewal dates by policy id — from the authorised read model, never from a memory. */
  renewals: { policyId: string; renewsOn: string; productName: string }[];
  /** Claims opened recently, for the follow-up rule. */
  recentClaims: { claimId: string; openedOn: string; description: string }[];
  /** Whether the client has switched proactive contact on at all. */
  proactiveContactEnabled: boolean;
  /** Moment codes already sent recently, so nothing repeats. */
  recentlySent: { code: MomentCode; sentOn: string }[];
}

/** Days before a renewal that a conversation is useful rather than premature. */
export const RENEWAL_WINDOW_DAYS = 30;
/** A claim follow-up lands after the shock, not during it. */
export const CLAIM_FOLLOW_UP_DAYS = 7;
/** Nothing repeats inside this window, whatever the rule says. */
export const REPEAT_SUPPRESSION_DAYS = 60;
/** No more than this many approaches at once, however many rules fire. */
export const MAX_MOMENTS_PER_RUN = 2;

function daysBetween(from: string, to: string): number {
  return (
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
    86_400_000
  );
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Find the moments worth a conversation today.
 *
 * Returns at most `MAX_MOMENTS_PER_RUN`, ordered by how time-critical they are.
 * Restraint is a feature: a relationship product that contacts you weekly is a
 * marketing list, and the brief for this one is care, not notifications.
 */
export function findMoments(input: RelationshipInput): ProactiveMoment[] {
  // No consent, no contact. Checked first so nothing below can leak through a bug.
  if (!input.proactiveContactEnabled) return [];

  const { accountId, today } = input;
  const usable = memoriesFor(input.memories, 'PROACTIVE_CONTACT');
  const found: ProactiveMoment[] = [];

  const suppressed = (code: MomentCode): boolean =>
    input.recentlySent.some(
      (sent) => sent.code === code && daysBetween(sent.sentOn, today) < REPEAT_SUPPRESSION_DAYS,
    );

  // ── Renewals ────────────────────────────────────────────────────────────────
  for (const renewal of input.renewals) {
    const days = daysBetween(today, renewal.renewsOn);
    if (days < 0 || days > RENEWAL_WINDOW_DAYS) continue;
    if (suppressed('RENEWAL_APPROACHING')) continue;
    found.push({
      code: 'RENEWAL_APPROACHING',
      accountId,
      basis: [renewal.policyId],
      requiresPurpose: 'PROACTIVE_CONTACT',
      notBefore: today,
      onDate: renewal.renewsOn,
      reason: MOMENT_REASONS.RENEWAL_APPROACHING,
      facts: {
        policyId: renewal.policyId,
        productName: renewal.productName,
        renewsOn: renewal.renewsOn,
        daysUntil: String(Math.round(days)),
      },
    });
  }

  // ── A child reaching 18 ─────────────────────────────────────────────────────
  //
  // Deliberately narrow. This uses a family memory the client volunteered *and*
  // allowed for proactive contact, and it never contacts the child — a person who is
  // not our client and has consented to nothing.
  for (const memory of usable) {
    if (memory.kind !== 'FAMILY_MEMBER' || !memory.onDate) continue;
    if (isStale(memory, today)) continue;
    const eighteenth = `${Number(memory.onDate.slice(0, 4)) + 18}${memory.onDate.slice(4)}`;
    const days = daysBetween(today, eighteenth);
    if (days < 0 || days > 45) continue;
    if (suppressed('CHILD_REACHES_18')) continue;
    found.push({
      code: 'CHILD_REACHES_18',
      accountId,
      basis: [memory.id],
      requiresPurpose: 'PROACTIVE_CONTACT',
      notBefore: today,
      onDate: eighteenth,
      reason: MOMENT_REASONS.CHILD_REACHES_18,
      facts: { relation: memory.label, name: memory.value, turns18On: eighteenth },
    });
  }

  // ── A trip the client mentioned ─────────────────────────────────────────────
  for (const memory of usable) {
    if (memory.kind !== 'LIFE_EVENT' || !memory.onDate) continue;
    if (!/viaj|travel|trip/i.test(`${memory.label} ${memory.value}`)) continue;
    const days = daysBetween(today, memory.onDate);
    if (days < 0 || days > 21) continue;
    if (suppressed('TRAVEL_PLANNED')) continue;
    found.push({
      code: 'TRAVEL_PLANNED',
      accountId,
      basis: [memory.id],
      requiresPurpose: 'PROACTIVE_CONTACT',
      notBefore: today,
      onDate: memory.onDate,
      reason: MOMENT_REASONS.TRAVEL_PLANNED,
      facts: { what: memory.value, when: memory.onDate },
    });
  }

  // ── After a claim ───────────────────────────────────────────────────────────
  //
  // The one moment with no commercial content at all. If it ever acquires any, this
  // rule should be deleted rather than adjusted.
  for (const claim of input.recentClaims) {
    const since = daysBetween(claim.openedOn, today);
    if (since < CLAIM_FOLLOW_UP_DAYS || since > CLAIM_FOLLOW_UP_DAYS + 14) continue;
    if (suppressed('CLAIM_FOLLOW_UP')) continue;
    found.push({
      code: 'CLAIM_FOLLOW_UP',
      accountId,
      basis: [claim.claimId],
      requiresPurpose: 'PROACTIVE_CONTACT',
      notBefore: addDays(claim.openedOn, CLAIM_FOLLOW_UP_DAYS),
      reason: MOMENT_REASONS.CLAIM_FOLLOW_UP,
      facts: { claimId: claim.claimId, openedOn: claim.openedOn },
    });
  }

  // ── Something on file has gone stale ────────────────────────────────────────
  //
  // Asking beats assuming. This is the rule that keeps the others honest over time.
  for (const memory of usable) {
    if (!isStale(memory, today)) continue;
    if (suppressed('MEMORY_NEEDS_CONFIRMING')) continue;
    found.push({
      code: 'MEMORY_NEEDS_CONFIRMING',
      accountId,
      basis: [memory.id],
      requiresPurpose: 'PROACTIVE_CONTACT',
      notBefore: today,
      reason: MOMENT_REASONS.MEMORY_NEEDS_CONFIRMING,
      facts: { label: memory.label, value: memory.value, statedAt: memory.provenance.statedAt.slice(0, 10) },
    });
    break; // One at a time. A list of "is this still true?" is an interrogation.
  }

  // A moment with no basis cannot be explained to the client, so it cannot be sent.
  const explicable = found.filter((moment) => moment.basis.length > 0);

  // Most time-critical first, then cap. A person gets at most two approaches.
  const order: MomentCode[] = [
    'CLAIM_FOLLOW_UP',
    'RENEWAL_APPROACHING',
    'TRAVEL_PLANNED',
    'CHILD_REACHES_18',
    'CIRCUMSTANCE_REVIEW',
    'MEMORY_NEEDS_CONFIRMING',
  ];
  explicable.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  return explicable.slice(0, MAX_MOMENTS_PER_RUN);
}
