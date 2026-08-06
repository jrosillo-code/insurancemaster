import { z } from 'zod';
import { MEMORY_PURPOSES, type MemoryPurpose } from './memory';

/**
 * What a client has agreed to, and when.
 *
 * Separate from the memories themselves because consent and content have different
 * lifetimes: withdrawing permission to be contacted must not delete what somebody
 * told us, and deleting a memory must not silently re-open a purpose they refused.
 *
 * Every field records *when* it was set. Under GDPR the controller has to be able to
 * demonstrate consent, which means a boolean is not enough — "they agreed" is a claim
 * about a moment, and a column that only says `true` cannot support it.
 *
 * The default for a new account is everything off. Consent that has to be withdrawn
 * was never consent.
 */

export const quietHoursSchema = z.object({
  /** Local hour, 0–23, from which contact is unwelcome. */
  fromHour: z.number().int().min(0).max(23),
  /** Local hour at which it becomes acceptable again. */
  toHour: z.number().int().min(0).max(23),
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

export const consentSettingsSchema = z.object({
  accountId: z.string().min(1).max(120),
  /**
   * Purposes the client has agreed to in general. A memory still carries its own
   * `allowedPurposes`; a purpose must be granted in *both* places to be usable, so
   * turning a purpose off here is a single switch that covers everything at once.
   */
  grantedPurposes: z.array(z.enum(MEMORY_PURPOSES)).max(MEMORY_PURPOSES.length),
  /** When each purpose was granted, so the grant is demonstrable rather than asserted. */
  grantedAt: z.record(z.string(), z.string().datetime()),
  /** Hours during which nothing is sent, whatever a rule finds. */
  quietHours: quietHoursSchema.optional(),
  /** Set when the client has been through onboarding, so it is not asked again. */
  reviewedAt: z.string().datetime().optional(),
});
export type ConsentSettings = z.infer<typeof consentSettingsSchema>;

/** A new account consents to nothing. */
export function defaultConsent(accountId: string): ConsentSettings {
  return { accountId, grantedPurposes: [], grantedAt: {} };
}

/**
 * Both gates must be open.
 *
 * The account-level switch is deliberately an AND rather than an override: a client
 * who turns off proactive contact expects that to hold for every memory, including
 * ones they granted individually months ago and have forgotten about.
 */
export function consentAllows(settings: ConsentSettings, purpose: MemoryPurpose): boolean {
  return settings.grantedPurposes.includes(purpose);
}

/**
 * Is now inside the client's quiet hours?
 *
 * `hour` is the client's local hour, resolved by the caller — this function does not
 * guess a timezone, because guessing one is how a system ends up messaging somebody
 * at three in the morning about their renewal.
 */
export function inQuietHours(settings: ConsentSettings, hour: number): boolean {
  const quiet = settings.quietHours;
  if (!quiet) return false;
  // A window that wraps midnight (22 → 8) is the normal case, so handle it first.
  if (quiet.fromHour > quiet.toHour) return hour >= quiet.fromHour || hour < quiet.toHour;
  return hour >= quiet.fromHour && hour < quiet.toHour;
}

/** Grant a purpose, stamping the moment so the grant can be demonstrated later. */
export function grant(
  settings: ConsentSettings,
  purpose: MemoryPurpose,
  at: string,
): ConsentSettings {
  if (settings.grantedPurposes.includes(purpose)) return settings;
  return {
    ...settings,
    grantedPurposes: [...settings.grantedPurposes, purpose],
    grantedAt: { ...settings.grantedAt, [purpose]: at },
  };
}

/**
 * Withdraw a purpose.
 *
 * The timestamp is dropped with it: keeping "granted at" for a purpose that is no
 * longer granted invites a later reader to treat a stale date as a live permission.
 */
export function withdraw(settings: ConsentSettings, purpose: MemoryPurpose): ConsentSettings {
  const { [purpose]: _removed, ...rest } = settings.grantedAt;
  return {
    ...settings,
    grantedPurposes: settings.grantedPurposes.filter((granted) => granted !== purpose),
    grantedAt: rest,
  };
}
