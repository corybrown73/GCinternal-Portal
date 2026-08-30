# Editable post-sale stages

0028 made the pre-sale pipeline configurable. This is the other half. Together
they are the point of the product: one tool covering pre-sale and post-sale,
with both halves named the way the team actually names them.

## What is editable, and why the line is where it is

**Editable:** the label, the intent text, the colour, the order. You can also
add a stage of your own.

**Not editable:** the `key` of a built-in stage, and built-in stages cannot be
deleted.

That is not caution — it is a fact about the code. Roughly twenty-five places
name specific stage ids as string literals:

| Stage id | What names it |
| --- | --- |
| `handoff` | where `startOnboarding` puts a new project; the SOW analyser; the Salesforce bridge |
| `launch` | the launch gate, and the launch board on the leadership page |
| `adopt` | graduation readiness; the churn signal |
| `graduate-to-cs` | graduation readiness, the CS handoff, the SLA cron, the weekly snapshot, the Salesforce close |
| `build` | solution-status derivation, health derivation |

Renaming "Adopt" to "Embed" must change what people read and nothing else.
Deleting it would silently disable graduation — nothing would fail at the time,
and the symptom would appear weeks later as "accounts stopped graduating".

So: rename freely, reorder freely, recolour freely, add your own. The guarantee
is that none of it can break a rule the code enforces.

## No enum in the way

Unlike the pre-sale pipeline, `implementations.current_stage` is already a
`text` column. A stage you add is therefore enterable the moment you add it —
there is no equivalent of 0028's `enterable` computation.

What a stage you add is **not** is part of any coded rule. It has no launch
gate, no graduation meaning, no Salesforce mapping. The admin screen says so on
the form rather than letting somebody discover it.

## The guarantees, and where they live

Every one is a trigger in 0031, because every app read and write runs on the
service-role client and bypasses RLS. RLS on this table is defence in depth
only.

| Rule | Mechanism |
| --- | --- |
| A key never changes | `portal_lifecycle_stage_guard` (BEFORE UPDATE) |
| `is_builtin` never changes | same trigger — being built in is a fact about the code, not a setting, and a settable flag would be a two-step delete of a load-bearing stage |
| A built-in stage cannot be deleted | `portal_lifecycle_stage_delete_guard` |
| An occupied stage cannot be deleted | same trigger, with the project count in the message |
| All eight built-ins exist | `portal_lifecycle_stages_builtins`, deferred |
| Reordering is atomic | `portal_set_lifecycle_stage_order`, with the 0026 authorization shape |

`supabase/tests/0031_lifecycle_stage_invariants.sql` probes all of them in CI —
including the four things that must stay **allowed**, because a schema that
refuses everything also passes every refusal test.

## Falling back

Three ways the app uses the compiled-in `LIFECYCLE_STAGES` instead of the table,
and all three are the pre-0031 behaviour rather than an error:

- the `lifecycle_stage_config` flag is off — the table is not touched at all,
  which is what makes this safe to deploy ahead of its migration;
- the table is empty — an org has a complete configuration or none;
- the read failed — a stage rail must not take a page down because a config
  table is unreadable.

## Vocabulary

The settings page used to head its pre-sale section "Upstream — not owned by
this app", with a note that the pre-handoff operating model was not yet agreed.
True once. It stopped being true when the pre-sale pipeline became a configured
thing this application owns, and a settings page that disowns half the product
teaches everyone the wrong model of what the tool is for.

Both halves are now "Pre-sales" and "Post-sale", both read their live
configuration, and both link to the screen that edits them.
