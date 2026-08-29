# Design: the handoff gate (Phase 3)

Not design-paneled like the other four — designed here against the code, at phase start.

## The one decision that shapes everything: reference, don't copy

The brief lists what a handoff packet must contain. Most of it **already has a home**:

| Brief field | Lives in |
|---|---|
| Business outcome the customer bought | `implementations.customer_goals` |
| Success measures (measure, baseline, target, owner) | `success_criteria` |
| Stakeholder map | `customer_contacts` |
| Commitments the AE made | `commitments` |
| Known technical risks | `risks` |
| SOW link | `implementations.sow_document_url` |
| Miro board | `implementations.discovery_board_url` |
| Recorded discovery calls | `portal_gong_reports` on the linked deal |

A packet that **copied** these would create a second source of truth that silently diverges the
first time someone edits the real record — and the packet is exactly the artifact people would then
trust. So `handoff_packets` is deliberately **thin**: it holds only the fields with no existing
home, plus the accept/return state. Completeness is computed by looking at the live records.

Genuinely new, so the packet owns them: integration dependencies, data-migration needs,
product-roadmap promises, and links to recorded calls that are not Gong reports.

Two fields belong on the contact rather than the packet, because they are facts about a person that
outlive any one handoff: `is_skeptic` (the brief calls out skeptics explicitly, and a stakeholder
map that cannot express dissent is decoration) and `comms_preference`.

## Completeness is a count, not a score

The brief asks for a "completeness score". This repo's standing rule is that nothing is a score,
forecast or trend, and `graduation-readiness.ts` says so in its own header.

Both can be true, because they are different things. What is forbidden is a number that **stands in
for judgement** — a 0-100 that implies how *good* a handoff is. What is delivered here is a **count
of facts**: "11 of 14 required items present", with every missing item named and deep-linked to
where it is filled in. Nobody has to trust the number, because they can see the list it came from.
It rolls up per AE without becoming an opinion.

So: no percentage-as-quality, no weighting, no composite. `requiredItems()` returns the items; the
count is derived from them, never the other way round.

## Accept / return

`draft → submitted → accepted | returned`, and `returned → submitted` again. The implementation
owner decides.

- **The clock keeps running while returned.** `stage_entered_at` is not touched by any of this, so
  time-in-Handoff accrues through a return exactly as the brief requires. This needs no code — it
  needs us *not* to write the special case that would stop it.
- **A return names its gaps.** Free-text-only returns are how this degrades into "it's not good
  enough"; the return records which required items it was sent back for, plus an optional note.
  The gaps a reviewer can name are ALL the required items, not only the absent ones — the commonest
  real return is "the success measures are there but they aren't measurable", and a form that only
  offers empty fields leaves that reviewer nothing to name and forces them to accept or say nothing.
  Absent items are pre-ticked so the ordinary case is still one click. The keys are validated against
  the real item list at the edge, because they are stored and later rendered back as the record.
- **The transitions are enforced, not just implied by the UI.** Accept and return require the packet
  to be `submitted`. Without that, accepting a `draft` records an acceptance of something nobody
  handed over, and returning an `accepted` packet walks the status backwards; both leave a history
  that reads as a gate when no gate happened, and these functions are directly callable. Reopening an
  accepted handoff is a genuine need and a *different* action — the event vocabulary already has
  `reopened` for it — so this refuses rather than approximating it.
- **A decision records what it saw.** On accept or return we snapshot the completeness result as
  evidence of the decision — not as a second copy of the content. The live records stay the truth;
  the snapshot answers "what was accepted, on what basis, by whom".
- Returning raises a `handoff_returned` alert (`alerts.kind` is free text, so no migration) and
  emails the deal's sales owner.

## Accepting is allowed while incomplete

Deliberate. The implementation owner is the one accountable for delivery; if they judge a gap
tolerable, blocking them protects nobody and teaches everyone to fill fields with noise. An accept
with missing items records exactly which ones were missing at the time — which is the accountability
the brief actually wants, and it is stronger than a block.

## What "recorded discovery calls" actually counts

Two sources: call links typed onto the packet, and Gong reports. The Gong reports hang off the
**customer's** presale deals — nothing in the schema links a deal to one implementation yet — so for
a customer with several deals, recordings from an unrelated deal would satisfy the item. Rather than
guess a link, the item's detail names each source separately and marks the Gong count "not
deal-scoped", so the reader can judge the evidence instead of trusting a tick. Phase 5 introduces
`salesforce_opportunity_id` on both sides, which is where the real scoping belongs.

## Flag

`handoff_gate`, off by default. The packet table and its columns are additive and inert until then.
