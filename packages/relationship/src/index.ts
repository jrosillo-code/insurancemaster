/**
 * @rosillo/relationship — the Client Relationship Intelligence Layer.
 *
 * "Juan by Rosillo" rests on a claim that is easy to make and hard to earn: that the
 * assistant knows you. This package is what makes the claim safe to make.
 *
 * Two rules do most of the work, and both are structural rather than instructional:
 *
 *   - **A memory is something a person said.** `MemorySource` has no member for
 *     model inference, so there is no way to write one down. A pattern the model
 *     notices is a hypothesis for an adviser, never a memory recited to the client.
 *   - **A moment is a finding, not a sentence.** `findMoments()` returns codes,
 *     the record ids they rest on, and resolved facts. The wording comes afterwards
 *     and may only restate what the finding contains, so the assistant cannot warmly
 *     invent a detail about somebody's family.
 *
 * Everything else follows: consent is scoped per purpose and checked before the model
 * runs; special-category data never justifies an approach; records about third
 * parties — a child's name, a partner's birthday — carry a narrower licence than
 * records about the account holder; stale memories prompt a question instead of an
 * assumption; and every memory can be shown, corrected and deleted by the person it
 * describes.
 *
 * SYNTHETIC DATA ONLY. No real Rosillo client has a record here, and the consent
 * model below is a design, not a legal opinion — a pilot needs the DPO's sign-off on
 * the lawful basis for each purpose before any of it touches a real person.
 */

export * from './memory';
export * from './moments';
