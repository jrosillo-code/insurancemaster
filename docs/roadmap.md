# What to build next

Written after the design and conversation work of August 2026, against the code as it
actually stands rather than against the plan. Two findings drive everything below:

1. **The thing we said we would do next — test with real pólizas — is blocked by
   something that does not exist at all.** There is no way to get a real policy into
   this system. `SyntheticCustomer360` is the only implementation of the read port,
   and the dataset is hand-written TypeScript.
2. **The product's headline idea does not run.** `packages/relationship` has a memory
   model, a consent model, and a proactive-moments engine with sixteen tests. Nothing
   calls `findMoments()`. "Juan by Rosillo" is, today, a well-tested library with no
   consumer.

Neither is a criticism of what was built. The prototype proved the hard parts — that
an assistant can be held to cited evidence, that authority can be computed before a
model runs, that prohibited actions can be absent rather than disabled. Those are the
parts that usually fail. What is left is the unglamorous work of connecting it to
reality.

---

## Where we actually are

**Working, deployed, and tested.** Two surfaces on Vercel over Supabase Postgres. A
nine-stage pipeline with an audit event at every stage and a hash-chained trail that
verifies on render. Evidence-backed answers where a material claim without a tier A or
B citation is downgraded rather than published. Citation by index, so a model cannot
name a record id. An employee queue with approve / approve-with-edits / escalate /
reject, immutable versions, and a supervisor-only override that records its reason.
Spanish and English throughout, enforced at compile time. Sustained multi-turn
conversation. Escalation that only fires when a person has something to do.

**Built and unwired.** The relationship layer: `ClientMemory` with provenance that
cannot express "the model made this up", consent that defaults to everything off,
quiet hours, a moments engine that checks consent first and caps itself at two
findings per run. A client-facing memory manager at `/memoria` with one-click deletion
and tombstoned erasure.

**Not built at all.** Anything that touches a real client.

---

## Gap 1 — there is no way in

This is the largest single piece of work in the project and it blocks everything the
family said they want to do next.

To answer a question about a real policy, the platform needs that policy as a
`Policy` record with `fieldProvenance` on every field, and its wording as a
`PolicyDocument` with extracted `passages`. Today both come from
`packages/customer-360/src/synthetic/`, which is a fixture.

What is missing, in dependency order:

**A document store.** There is none. `PlatformStore` persists conversations,
messages, responses, tasks, decisions, AI runs, memories, consent and audit — no
binary, no attachment. A real póliza is a PDF. It needs somewhere to live with the
same classification and authorisation model the read port already assumes
(`CONFIDENTIAL_CLIENT` / `SPECIAL_CATEGORY` / `INTERNAL`, owner party as the
authorisation anchor, a checksum).

**An ingestion path.** Somebody has to put a policy in. Three options, and they are
not exclusive:

| | What it is | Effort | Why it might be right |
|---|---|---|---|
| Manual entry | An adviser types the policy's fields into a form | Small | Provenance is honest by construction — the source *is* the adviser. Works on day one. |
| Document upload + extraction | Drop the PDF, extract fields and passages | Large | This is the demo that sells the product. Also the one that can be wrong. |
| segElevia integration | Read from the management system | Unknown | Out of scope for the prototype by explicit constraint, and the right long-term answer. |

**Recommendation: build manual entry first, upload second.** Manual entry is small,
it makes the platform usable against a real policy this month, and its provenance is
unimpeachable — `sourceType: 'ADVISER_ENTERED'`, `sourceId` the adviser, `confidence`
1.0. Extraction is where the interesting failure modes live (a model reading a premium
off a schedule and getting it wrong is exactly the harm this whole architecture
exists to prevent), and it deserves to be built second, on top of a working system,
with the extraction itself treated as a *source with a confidence* rather than as
truth. The evidence model already has the vocabulary for that: an extracted field with
`confidence: 0.8` and a conflicting adviser-entered value produces the conflict path
that already works.

**A second `Customer360Port` implementation.** The port is read-only by construction
(ADR-0001) and every accessor already takes an `AuthorisedScope`. A
`PostgresCustomer360` sitting behind the same interface is additive — the pipeline,
the retrieval layer and both surfaces need no change. This is the cleanest part of the
work, and it is clean precisely because of a decision made at the start.

---

## Gap 2 — there is no real identity

The login page publishes the password. It says `demo` in a table, on screen, next to
five accounts.

That is correct for a prototype with synthetic data and wrong the moment a real
person's policy is behind it. Session revocation exists, sign-in attempts are
throttled and locked out, the cookie is signed with a real secret and refuses to work
in production without one — the surrounding machinery is sound. The credential is the
problem.

Three routes, and this one is genuinely a decision for Rosillo rather than for me:

- **Passkeys.** Strongest, no shared secret, no password to phish. Requires a device
  the client already trusts. Best answer for a client-facing product in 2026.
- **Magic link by email.** Weakest of the three but familiar, and it works for an
  older client who will not set up a passkey. Needs an outbound email channel, which
  the platform deliberately does not have.
- **The Rosillo app's own identity.** If the existing customer app has accounts, this
  is one integration instead of a new identity system, and clients are already in it.

**Recommendation: passkeys, with the Rosillo app as the answer if it already holds
identities.** Whichever is chosen, the demo accounts and the password table must be
deleted from the codebase, not hidden — the same rule ADR-0007 applies to prohibited
actions.

---

## Gap 3 — the relationship product does not run

This is the one that matters most for what the product *is*, as opposed to what it
does.

The positioning is a continuation of how Juan Rosillo worked: knowing the family,
noticing what was coming, getting in touch before being asked. The engine for that
exists and is careful — consent is checked before anything else, special-category data
can never start a conversation, a memory goes stale after eighteen months rather than
being assumed true, a claim follow-up is ordered ahead of anything commercial, and no
more than two moments fire per run. It has tests written against its refusals.

Five things stand between that and a working product:

1. **A scheduler.** Nothing runs `findMoments()`. It needs a daily job per account.
2. **A drafter.** A `ProactiveMoment` is a code, a list of basis record ids, and
   resolved facts. It is deliberately not a sentence. Something has to turn
   `{code: 'CHILD_REACHES_18', facts: {name: 'Sofía', turns18On: '2026-09-01'}}` into
   a message that sounds like a person, constrained to exactly those facts.
3. **A channel.** There is no outbound anything, by design. A message has to reach
   the client somehow — in-app first, which needs no new external dependency and no
   new data-protection surface.
4. **Consent onboarding.** `defaultConsent()` returns everything off, and nothing in
   either surface ever asks. Today a client would have to find `/memoria` and switch
   proactive contact on themselves, which nobody will do.
5. **An adviser view of why a moment fired.** A moment carries its basis ids
   specifically so it can be explained. Nobody can see them.

**Recommendation: in-app first, and consent onboarding before anything else.** An
unread in-app note is a much smaller mistake than an unwanted email, and it makes the
whole loop testable without an outbound channel. Consent first because a proactive
feature built before the permission to use it is a feature that ships switched off.

---

## Gap 4 — the paperwork that lets us hold the data

Not optional and not deferrable past the first real client record. Named here so it is
scheduled rather than discovered.

- **A DPIA.** Article 35 UK/EU GDPR — automated processing of personal data at scale,
  with special-category data (health claims are in the model) in scope. It has to
  exist before the first real record, not after.
- **A processor agreement** with any AI provider used against real data, EU region
  pinned. Today `AI_PROVIDER=mock` and nothing leaves; the moment that changes, this
  is required.
- **Retention and erasure end to end.** Memory erasure is done properly — tombstoned,
  so deletion is demonstrable rather than merely claimed. Conversations, tasks and
  audit entries have no retention schedule at all. Audit is hash-chained and therefore
  cannot be edited, which is right, and means a subject access request or erasure has
  to be designed around it rather than bolted on.
- **A subject access request path.** A client can already see and delete what the
  platform remembers about them. They cannot export it.

---

## The sequence I would follow

**Start with a family pilot, not a client pilot.**

Load Guillermo's and his father's own pólizas. Real documents, real questions, real
mess — and the data subjects are the two people running the test, so consent is
trivial and the GDPR exposure is close to zero. It gets the ingestion path built
against reality instead of against imagination, and it will find things no synthetic
dataset ever will: a policy with a mid-term endorsement nobody digitised, a premium
that appears twice with different numbers, a document scanned at an angle.

It also means Gaps 2 and 4 can run in parallel with the work rather than blocking it.

**Phase 1 — a real policy, end to end.**
Document storage → manual policy entry → `PostgresCustomer360` → the family's own
policies loaded → ask it real questions and see what breaks. This is the phase that
turns a demo into a system.

**Phase 2 — real identity.**
Whatever is chosen, plus deleting the demo accounts. Nothing with a real client's name
on it goes behind a published password.

**Phase 3 — the relationship product.**
Consent onboarding → in-app channel → scheduler → drafter → adviser explanation view.
At the end of this phase the product is doing the thing it is named after.

**Phase 4 — extraction.**
Upload a PDF, extract fields and passages, treat the extraction as a source with a
confidence, and let the existing conflict machinery handle disagreement with what an
adviser entered. Built last because it is the most likely to be wrong and the least
costly to defer.

**Phase 5 — quality against reality.**
The intent classifier is a keyword engine and the evaluation corpus is imagined.
Real questions will be stranger than anything written for it. Once there are real
conversations, both should be rebuilt from what people actually asked — and that is
also the point at which a live model can be evaluated against the deterministic one
with a baseline worth trusting.

---

## The one that is a switch, not a project

**The chatbox on the deployed site is not running a model.** `AI_PROVIDER=mock` is
set on both Vercel projects, and the mock is a few hundred regular expressions and a
set of answer templates. It classifies well and writes stiffly, and every sentence it
produces was written by hand. That is deliberate — it is what makes the 78 evaluation
cases and the 332 tests mean something, because a score change is a real regression
rather than model variance — but it is a ceiling on how the assistant *reads*, and no
amount of work on the pattern set lifts it much further.

Turning the live model on is two environment variables on the Client Concierge
project: `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. Nothing else changes. The
provider interface, the prompts, the evidence rules, the citation-by-index
substitution, the policy layer and the audit trail were all built for exactly this
(ADR-0005), and the model remains untrusted at every point: it returns `unknown`,
orchestration validates it, and a claim without a citation is still discarded.

Two things to know before flipping it:

- **It is safe today only because the data is synthetic.** Every message and every
  quoted passage would leave for Anthropic. Against real client pólizas that needs a
  processor agreement with an EU region pinned — Gap 4 above — and it is the single
  reason not to do it the moment real data goes in.
- **The evaluation suite still runs against the mock, and should.** The right way to
  use the live model is to run both: the deterministic provider as the regression
  gate, the live one measured against the same 78 cases so the difference is visible
  rather than assumed.

My recommendation: switch it on now, while the data is synthetic and the only people
using it are the two of you. It is the fastest way to find out whether the register
and the evidence discipline hold up under a model that writes properly, and that
answer changes what Phase 5 should be.

---

## What I would not do yet

- **segElevia, email, insurer portals.** Excluded by constraint and correctly so. The
  value of "no action leaves Rosillo" is that it is true, not that it is claimed.
- **Voice, mobile apps, a second language beyond ES/EN.** Nothing is asking for them.
- **More design.** The surfaces are in good shape. The remaining design debt is
  small and specific: an adviser-side view of what a client asked to be forgotten, and
  a queue that shows what happened today rather than only what is outstanding. Both
  belong to Phase 3.

---

## Decisions that are Rosillo's, not mine

1. **Identity.** Passkeys, magic link, or the existing Rosillo app. Depends on what
   that app already holds.
2. **Whose data goes in first.** The family-pilot recommendation above assumes the
   answer is "ours". If it is a client, Gap 4 moves to the front of the queue.
3. **Live model or deterministic.** The mock provider is what every test and all 78
   evaluation cases run against, which is what makes quality gates mean anything. A
   live model is better at language and worse at being predictable. The architecture
   supports either; the decision affects the DPA and the cost.
