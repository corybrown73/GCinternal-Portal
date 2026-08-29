# Design: a configurable pre-sale pipeline

Not design-paneled. Designed here against the code, like the handoff gate and the hygiene phase.

The post-sale lifecycle is already a list in a file. The pre-sale motion is a **Postgres enum**, and
an enum is the one shape you cannot customise without a migration:

```sql
create type portal_account_stage as enum                                  -- 0001:8
  ('prospect','closed_won','onboarding_kickoff','in_onboarding','onboarding_complete');
```

It types `portal_accounts.stage`, both ends of `portal_stage_transitions`, and — since `0007`, and
re-stated verbatim by `0026` — the parameter *and* the return type of `portal_transition_stage()`.
"Make the pre-sale motion customisable" therefore has an obvious wrong answer: convert the column to
text, rewrite the RPC's signature, and reseed the pipeline board from a table, in one release. That
change lands on the board, the public API's `stage` enum and the Salesforce bridge simultaneously,
and every one of them fails differently.

So this splits in two, and only the first half ships here.

---

## 1. The decision: configuration is additive, membership is not

**`portal_pipeline_stages` is a new, org-scoped, ordered config table, seeded from the enum. The
enum column stays, and stays authoritative for which stage an account is in.**

That sentence is the whole design, and the second half is the part that makes it safe. The config
table owns everything *about* a stage — its label, its colour, its position, and which one means
"won" and which one means "the end". The enum keeps owning the one thing it is actually good at:
guaranteeing that no row anywhere holds a stage value the system does not know about.

Day one is therefore identical by construction: the seed is the enum, in enum order, with the labels
the UI already renders. Nothing moves. Nothing is reinterpreted. The only new fact in the database is
that those five strings now have rows describing them.

### What that costs, said plainly

A stage you add in the admin UI **cannot hold an account yet**. Its key is not an enum label, so
`portal_transition_stage` would reject it, and it would reject it correctly.

This is not hidden. `portal_pipeline_stages_v` computes `enterable` by looking the key up in
`pg_enum`, the board renders a non-enterable column as present but not droppable, and the admin UI
says so on the row. A configured-but-not-yet-enterable stage is a **declaration of intent** that
survives until the conversion migration turns it on — which is a more useful thing to have than a
disabled "Add" button, and a much more honest thing than a column you can drag a deal into that then
throws.

Renaming, recolouring, reordering and moving the won/terminal marks all work fully on day one. Those
are the operations a deployment actually reaches for first.

### Why not a text column now

Because the failure is not "the migration is hard", it is "three things break at different times".
`stage_schema = z.enum(STAGES)` types the public `/api/v1/accounts` contract; the SF bridge compares
stage *indices*; the board is keyed by the enum. A text column also silently removes the guarantee
that a typo in a CSV import cannot land in the database — and that guarantee is currently the only
thing standing between `importDealsCsv` and a stage called `Closed  Won`. Replacing an enum with a
check trigger against the config table is fine; doing it in the same release that introduces the
config table means the trigger and the table it validates against are both new at once.

`0012` is the precedent this follows: rename, keep compat views, drop nothing in the same release.

---

## 2. `closed_won` stops being a string in the code

Four places key off Closed Won today, and every one of them spells it:

| Where | What it does |
|---|---|
| `presale.server.ts:601` | refuses `startOnboarding` before the deal is won |
| `presale.server.ts:690` | moves the won deal into the next stage after starting onboarding |
| `sf-integration.server.ts:372` | the Salesforce closed-won bridge, forward only |
| `deals.$dealId.tsx:220` | shows the Start onboarding control |

If stages are configurable, exactly one stage must carry that meaning, and the code must read *that*
rather than the literal. So the table has `is_won` and `is_terminal`, and both are constrained to
**exactly one per org** — a partial unique index for at-most-one, and a deferred constraint trigger
for at-least-one, deferred so that moving the mark from one stage to another inside one transaction
is a legal move rather than a momentary violation.

Two further rules on those marks, enforced in the same trigger:

- **The won and terminal stages must be enterable.** Marking a stage no account can ever enter as
  "won" would make `startOnboarding` unreachable for every deal in the system. This is the single
  invariant that keeps the config table from being able to break the product while the enum is still
  authoritative.
- **An org either has a complete configuration or none at all.** With zero rows the trigger passes,
  and the app falls back to the compiled-in defaults. That is what makes a deploy that lands before
  `0028` behave exactly like today rather than like a broken pipeline.

`stageIndex()` — the forward-only comparison the SF bridge and `startOnboarding` both depend on —
becomes an index into the configured order rather than into `STAGES`. Reordering stages therefore
changes what "forward" means, which is correct: that is what reordering a pipeline *is*.

---

## 3. History is evidence, so the key is immutable

`portal_stage_transitions` records what happened. It is the only place a deal's path exists, it is
rendered back to people as the record, and `signals/stage-history.ts` reads it. Reordering or
relabelling a stage must not touch it.

The mechanism is one rule: **`key` is the identity and cannot be changed; `label` is the display and
can.** A `before update` trigger refuses any change to `key`. Renaming "Closed Won" to "Booked" edits
one label column, and every history row keeps reading correctly because it never referred to the
label in the first place. Reordering writes `sort_order` and nothing else.

This is the same rule `templates.functions.ts` already states about template keys — "the identity
that spans versions" — applied to the other configurable list in the product.

Deletion follows from the same principle:

- **A stage accounts currently sit in cannot be deleted.** A `before delete` trigger counts
  `portal_accounts` in that stage and refuses with the count in the message ("3 account(s) are still
  in it"), because "cannot delete" without the number tells the operator nothing they can act on.
  The server function repeats the check first so the UI can show a good error, but the trigger is the
  guarantee: **every app write runs on the service-role client and bypasses RLS**, so a policy here
  would be decoration.
- **The won and terminal stages cannot be deleted**, by name, in that same trigger — otherwise the
  operator gets a confusing "exactly one won stage" violation from the deferred constraint instead of
  being told to move the mark first.
- **A stage still named by history can be deleted** if no account is in it, and history keeps
  rendering: the transition rows hold enum values, and the label lookup falls back to the raw key.
  Refusing that delete would mean a pipeline can only ever grow.

---

## 4. Two operations are RPCs, and they are authorised like the RPC that taught us

Everything an admin does here is a single statement the app client can send — except two, and both
for the same reason: PostgREST auto-commits every statement, so an operation that is only valid as a
*pair* of writes cannot be done from the client without the pipeline being briefly invalid.

**Reordering.** `sort_order` is `unique (org_id, sort_order) deferrable initially deferred`, deferred
because a permutation cannot be applied one row at a time without transiently colliding.
`portal_set_pipeline_stage_order(p_keys text[])` renumbers in a single
`update … from unnest(…) with ordinality`. It refuses a `p_keys` that is not *exactly* the org's key
set — a partial list would silently shunt the omitted stages somewhere, which is the kind of bug that
looks like a UI glitch for a month.

**Moving the Closed Won or final mark.** The at-most-one rule is a partial unique *index*, and
indexes are never deferrable, so "set the new one" must follow "unset the old one" — and between two
round trips the pipeline would have no won stage at all.
`portal_set_pipeline_stage_mark(p_key, p_mark)` does both inside one transaction, and the deferred
marks trigger validates the pair at commit.

Both copy `0026`'s authorization shape deliberately: the in-body check
(`auth.role() = 'service_role' or portal_can_manage()`) **and** the outer `revoke … from public,
anon, authenticated`. `0026` exists because a `security definer` function was granted to
`authenticated` with no role check and PostgREST is a public API; a new `security definer` function
that reshapes the pipeline should not have to relearn that.

`portal_transition_stage` itself is **not touched by this migration**. Its signature still names
`portal_account_stage`, its 0026 guard is unchanged, and it remains the only writer of
`portal_accounts.stage`.

---

## 5. The admin surface

`/admin/pipeline-stages`, one card on the admin index. Add, relabel, recolour, reorder, move either
mark, delete. Reads are internal-only through `requireInternalAuth`; every write additionally goes
through `assertCanManage(context.profile)` — the `templates.functions.ts` pattern — because the
`/admin` layout's super-admin gate is a client-side decision about what to render, not a guarantee.

Every row shows what the operator needs in order to act rather than only what the system will
refuse: how many deals are in the stage (the number a delete refusal quotes), whether the stage is
named anywhere in the recorded history, and whether it is enterable yet. The delete button is
disabled with that count in its tooltip, so the refusal is visible before the click rather than
after it.

## 6. Colours are tokens, not hex

`color` is constrained to `idle | ontrack | risk | blocked | primary` — the theme tokens that already
exist in `styles.css` and already have a light and a dark value. A free hex field would let an
operator pick a colour that is legible in one theme and invisible in the other, and the app has no
way to warn them. Five tokens is a smaller freedom than a colour picker and a much better one.

---

## 7. Flag

`presale_stage_config`, default off, appended as one contiguous block in `V2Flags`.

**The flag is a deploy-safety gate, not a behaviour switch.** With it off, `loadPipelineStages()`
returns the compiled-in defaults and never touches the database — which is what makes this code safe
to ship ahead of `0028`, the lesson `share-panel-flag.test.ts` was written to keep. With it on and
`0028` applied but not yet edited, the table contains the enum, so the two paths produce byte-identical
output. A read that fails for any reason falls back to the defaults rather than taking the pipeline
board down.

Everything downstream reads one shape — an ordered `PipelineStage[]` — so there is one code path
through the board, the deal record, `startOnboarding` and the SF bridge, not two.

---

## 8. What this deliberately does not do

- **It does not convert `portal_accounts.stage` to text.** That is the second migration, and it
  carries a check trigger against `portal_pipeline_stages`, a compat view over the enum's spelling,
  the `portal_transition_stage` signature change, and the `z.enum(STAGES)` contract in
  `server/schemas.ts` and the OpenAPI document. Four public surfaces; its own release.
- **It does not touch `portal_transition_stage`.** Not its body, not its guard, not its grants.
- **It does not rewrite `portal_stage_transitions`.** Not one row, not now, not by the later
  migration either — the history is the evidence and the enum values in it stay exactly as written.
- **It does not make the post-sale tail configurable.** `onboarding_kickoff → in_onboarding →
  onboarding_complete` are the presale table's mirror of the delivery lifecycle
  (`presaleStageForLifecycle`), and the lifecycle is being rebuilt in a sibling change this week.
  They are seeded like any other stage and can be relabelled, recoloured and reordered; the mapping
  from a lifecycle stage to one of them stays where it is.
- **It does not make stages per-user, per-team or per-record-type.** One ordered list per org. A deal
  that needs a different motion needs a different pipeline, and there is no second pipeline.
- **It does not add a "probability" or "weighted value" field.** That is a forecast, and this repo
  does not ship numbers that stand in for judgement (`graduation-readiness.ts`'s header, the handoff
  gate's completeness count).
- **It does not filter on `org_id`.** The column and its FK are there because `0025` extended that
  seam to the `portal_*` tables; making it a real tenant boundary remains a multi-tenancy project.
- **It does not flip a flag.**

## Migration

One migration, `supabase/migrations/0028_pipeline_stages.sql`, with `supabase/down/0028_down.sql`.
Everything above that needs DDL is in it — `0027` is reserved for an unrelated deferred cleanup.

The rollback archives the table to `v2_archive.pipeline_stages` before dropping it: labels, colours
and an order somebody chose are recorded human input, and a rollback that erases them is the failure
mode the house rule exists to prevent. It also removes `presale_stage_config` from `v2_flags`.
