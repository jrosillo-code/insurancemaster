# ADR-0014 — A memory is something a person said

**Status:** accepted · **Date:** 2026-08-05

## Context

The product is repositioning from an AI insurance assistant to *Juan by Rosillo* — the
continuation of what Juan Rosillo built, where the broker knows the client, their
family and their situation, and looks after them proactively. The client should feel
"Rosillo knows me", not "I am talking to software".

That claim is easy to make in a prompt and hard to earn in a system. A product that
says it remembers your family fails in three specific ways, and each of them is worse
than the feature is good:

**It can invent.** "I remember you bought a car" when nobody said so is not a wrong
answer — it is a lie told warmly. A client cannot distinguish a fabricated memory from
a real one, which means a single hallucination poisons every true thing the assistant
ever says. An assistant that occasionally invents a detail about your daughter is
worse than one that knows nothing about her.

**It can over-reach.** A child's age is useful for checking travel cover and unwelcome
in an unsolicited sales approach. The same fact is appropriate or invasive depending
entirely on why it is being used.

**It holds other people's data.** A child's name and age is personal data about
someone who is not our client and has consented to nothing. So is a partner's
birthday. Storing it under the account holder's record does not make it theirs.

The existing platform already answers a structurally identical problem. `AuthorisedScope`
is computed before the model runs, so a record the caller may not see was never in the
list rather than filtered from a draft. `ALLOWED_ACTIONS` contains no prohibited action,
so the model cannot request one. The same shape applies here.

## Decision

**A memory is something a person said, and the type system says so.**

`MemorySource` has exactly three members: `CLIENT_STATED`, `ADVISER_RECORDED`,
`CLIENT_PROFILE_FORM`. There is no `MODEL_INFERRED`, so there is no way to spell one.
Every memory carries provenance naming the origin — a conversation id, a form, an
adviser — and the date the person said it, not the date the row was written.

A pattern the model notices is a hypothesis for an adviser. It is never a memory
recited back to the client.

**A proactive moment is a finding, not a sentence.**

`findMoments()` is deterministic code over stored records. It returns a moment code,
the record ids the moment rests on, the consent it requires, and the facts already
resolved. The model receives that object and nothing else about the client, so it
cannot reach for a memory it was not given. Wording comes afterwards and may only
restate what the finding contains.

A moment with an empty basis is refused, because a moment that cannot be explained to
the client cannot be sent to them.

**Consent is scoped by purpose, and checked first.**

`ANSWER_IN_CONVERSATION`, `COVERAGE_REVIEW`, `PROACTIVE_CONTACT` and `ADVISER_CONTEXT`
are granted separately. "You may use my daughter's age to check her travel cover" is
not "you may use it to sell me things". The proactive switch is checked before any
rule runs, not applied to the output — so a bug in a rule cannot leak past it.

**Special-category data never initiates contact.** A client may volunteer a health
detail so the assistant can answer them. That is not permission to raise it unprompted,
whatever the consent list says.

**Memories go stale rather than being assumed true.** After 540 unconfirmed days a
memory stops justifying an approach and instead prompts a question. "How is the
renovation going?" two years after it finished is worse than never asking.

**Restraint is a feature.** At most two approaches per run, none repeated within 60
days, at most one "is this still true?" at a time, and the claim follow-up ordered
ahead of anything commercial. Someone who has just had a loss hears "how are you?"
before "shall we review your premium?" — and a test fails if that inverts.

## Consequences

The warm, knowing tone the repositioning asks for is now something the platform can
support without lying. Everything the assistant claims to remember is attributable to a
person and a date, and the attribution is rendered by the surface rather than phrased
by the model — a model asked to say where something came from will eventually say
something plausible instead of something true.

The cost is that the assistant knows less than a system willing to infer. It will not
notice that a client's messages suggest a new baby; it will only know once somebody
says so. That is the intended trade: this product's value is that what it says can be
relied on, and inference is where that guarantee ends.

Third-party records carry a narrower licence than the account holder's own, and the
account holder can delete them. That is not sufficient for a pilot on its own — the
lawful basis for each purpose needs the DPO's sign-off before any real person is
described in this model, and the retention period for a child's data needs an explicit
answer that this ADR does not give.

## What this does not yet cover

The layer is built and tested; the surfaces on top of it are not. Still open: the
client-facing memory manager (view, correct, delete), the consent onboarding flow, the
notification channel and its quiet hours, the adviser's view of why a moment fired, and
the drafting prompt that turns a finding into a sentence. Each of those is a place the
guarantees above can be undermined by a careless implementation, so each needs the same
treatment rather than a convenient shortcut.
