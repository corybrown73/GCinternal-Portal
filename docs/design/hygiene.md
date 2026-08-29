# Design: platform hygiene completion (Phase 7)

Not design-paneled. Like the handoff gate, this is designed here against the code at phase start.

Phase 7 finishes the things the audit found half-done: two audit stores that between them record
nothing anybody reads, two people tables that do not know about each other, four tables the UI
renders and nothing can fill, and a vocabulary in which "handoff" names both ends of the lifecycle.
It also carries the last three sketch items — global search + saved views, a demo mode, and API-key
expiry + rate limits.

It is the phase most likely to break the brief's hardest promise (**every existing URL keeps
working**) and the phase where a careless migration destroys recorded human input. So the governing
rule below is stricter than usual: **nothing is dropped, nothing is overwritten, and the rollback of
this phase is required to be boring.**

---

## 0. The rule this phase is written under

Three phases are being built beside this one, into the same branch. Every decision below was scored
on collision risk as well as correctness, and where a cosmetically attractive change would have swept
a regex through files Phase 4, 5 or 6 own, it was made smaller or deferred, and said so. §8 lists
what was deferred and why. A blanket rename in an earlier phase caught an unrelated identifier that
merely shared a word; this phase does not repeat that.

One migration: `0025_audit_consolidation.sql`, with `supabase/down/0025_down.sql`. Everything below
that needs DDL is in it. It touches no table any sibling phase's migration creates.

---

## 1. Audit stores (decision 3)

### The problem, precisely

The hub UI reads `audit_log`, which **nothing writes** (`hub.server.ts:102, 806, 942`; rendered on
the Customer 360 and on Home). Every code path writes `portal_audit_log`, which **nothing reads**
(`server/audit.ts:16`, imported by 11 files; zero selects in `src/`). And `audit()` wraps its insert
in a try/catch that logs to the console and returns — so an audit write that fails leaves no trace
anywhere a human will ever look.

That last part is the important one. A silent audit is worse than no audit, because an empty history
reads as "nothing happened" rather than as "we don't know". The consolidation is the easy half; the
loudness is the half that matters.

### End state

**Both stores survive, with jobs that do not overlap** — the recommendation in decision 3, and the
code agrees with it: the two tables have genuinely different shapes and genuinely different readers.

| Store | Job | Shape | Read by |
|---|---|---|---|
| `audit_log` | **Account activity feed.** Field-level changes to hub records: who changed what, from what, to what, and why. | `entity_type`/`entity_id`/`field_name`/`old_value`/`new_value`/`change_reason`/`changed_by → team_members` | the Customer 360 history tab and Home's recent activity — the readers that already exist |
| `portal_audit_log` | **Security / API action log.** Coarse, one row per action, actor-typed, covers API keys and email tokens as well as people. | `actor_type`/`actor_id`/`action`/`entity_type`/`entity_id`/`payload` | `/admin` (new: the audit-health panel) |

They are not redundant. `audit_log` cannot express "this API key listed accounts" — no field changed,
and its `changed_by` is a `team_members` FK an API key has no row in. `portal_audit_log` cannot
express "the target launch date moved from 3 March to 17 April" without stuffing it into an untyped
`payload` no view could ever render as a diff.

So **`audit()` keeps its job unchanged** and gains loudness; a second helper, `recordActivity()`,
fills `audit_log`. Neither replaces the other, and no existing call site is rewritten from one to the
other.

### Making failure loud

Four layers, weakest to strongest. Each exists because the layer above it can itself fail.

1. **`audit()` awaits and inspects.** Today it awaits a PostgREST call whose errors arrive as a
   returned `{ error }`, not a throw — so the try/catch never fires and the `console.error` inside it
   is dead code for the commonest failure mode. It now checks `error` and retries once.
2. **A failure raises an alert.** `alerts.kind` is free text (`0006:70`), so a failed audit write
   inserts an `audit_write_failed` alert, severity `critical`, naming the action and the actor. That
   surface already exists and already emails.
3. **A failure is counted and surfaced.** The alert insert can fail for the same reason the audit
   insert did. So the process also increments an in-memory counter holding the last error and the
   last failing action, exposed by `getAuditHealth()` on `/admin`. It is per-instance and resets on
   deploy — that is fine; it is a smoke alarm, not a ledger.
4. **A database trigger nobody can forget.** Layers 1–3 all live in app code, which means they are
   only as good as the developer who remembered to call `audit()`. RLS cannot help here: **every app
   read and write uses the service-role client and bypasses RLS entirely**, so a policy is not a
   guarantee. A trigger is. Two `after insert or update` triggers — on `portal_api_keys` and on
   `portal_profiles.role` — write a `portal_audit_log` row for the two changes with the worst
   consequences if unrecorded. They are transactional with the change: if the log write fails, the
   role change fails.

   The trigger cannot know the app-level actor (the service-role client carries no end-user claim),
   so it writes `actor_type = 'system'` and an action suffixed `.observed`
   (`api_key.create.observed`, `api_key.revoke.observed`, `profile.role_change.observed`) with
   `payload.source = 'trigger'`. **This is deliberately a second row, not a replacement.** The app
   row carries the attribution; the trigger row proves the event happened. An `.observed` row with no
   attributed row beside it is exactly the evidence that the app-side audit silently failed — and the
   audit-health panel says so in those words.

   Two rows for one change would be duplication if either were treated as *the* record. Neither is:
   the panel reconciles them, and the pair is the point.

**Strictness is a flag; loudness is not.** Turning a swallowed error into a thrown one changes which
requests fail, so `audit_strict` (default off) is what makes a failed audit on a *critical* action
(`api_key.*`, `profile.role_change`, anything with `actor_type = 'api_key'`) abort the mutation.
Layers 1–3 ship on, unflagged, because they cannot fail a request that would otherwise have
succeeded — they can only make an already-lost write visible.

### Migration path

Additive only. `0025` adds the two indexes `audit_log` needs to be queried as a feed
(`(entity_type, entity_id, changed_at desc)` and `(changed_at desc)`), one on
`portal_audit_log (action, created_at desc)` for the reconciliation query, and the two triggers. No
column is dropped, no row is moved, and **no actor columns are added to `audit_log`** — the migration
ledger gives those to Phase 4's `0020`, and duplicating them across two concurrently built migrations
is how you get two half-populated actor columns. `recordActivity()` therefore attributes through the
bridge of §2: `portal_profiles.team_member_id → audit_log.changed_by`, a real FK that already exists
and needs no new column at all.

Hub mutations start writing the feed behind `audit_activity_feed` (default off), because rows
appearing in a history panel that has been empty since `0003` is a visible change.

---

## 2. People tables (decision 9)

### The recommendation, and the evidence for it

Decision 9 recommends "bridge, don't merge, for now — a full merge is Phase 7 scope if still wanted".
Having looked: **do not merge. Finish the bridge instead.** The evidence is one line of DDL.

```sql
create table portal_profiles (
  id uuid primary key references auth.users (id) on delete cascade,   -- 0001:33
```

A `portal_profiles` row cannot exist without an `auth.users` row. `team_members` is the directory of
people work is assigned to: contractors, people who have left, people who simply never log in.
Merging into `portal_profiles` would require minting fake auth users for all of them — creating
login-capable identities as a side effect of an ownership record, the exact opposite of what a
hygiene phase should do. Merging the other way means repointing the **19 hub tables** whose ownership
columns FK `team_members(id)`, in one release, with `on delete set null` semantics that would quietly
blank ownership on any row that failed to remap.

The two tables are not a duplication to be collapsed. They are an **identity** table and a
**directory** table that were never wired together. `0010` wired them one way and left three gaps.

### End state

`portal_profiles` is the identity of everyone who can sign in. `team_members` is the directory of
everyone who can own work. `portal_profiles.team_member_id` is the only link, and after this phase it
is **complete, unique and self-maintaining**.

1. **Unique.** `create unique index … on portal_profiles (team_member_id) where team_member_id is not
   null`. Two profiles pointing at one directory row means "my accounts" returns someone else's work;
   a partial unique index makes that unrepresentable. It is possible today: `0010`'s backfill matched
   on `lower(email)` against a `team_members.email` that is nullable and not unique.
2. **Complete.** `0025` backfills the remainder in two passes — match remaining internal profiles to
   an unclaimed `team_members` row by `lower(email)`, then **create** a directory row for any internal
   profile still unmatched. This is the pass `0010` could not do, because in Phase 1 it was not yet
   decided whether a profile without a directory row was a bug or a fact. It is a bug: an internal
   user who cannot be assigned work is not a state the product has a use for.
3. **Self-maintaining.** The drift exists because signup writes a profile (`portal_handle_new_user`,
   `0001:43`) and nothing has ever written a directory row. A `before insert` trigger on
   `portal_profiles` now links or creates the `team_members` row for internal roles, inside the same
   transaction as the signup. Customer-role profiles get no directory row — customers are not
   assignable — and that is checked, not assumed.
4. **Readable as one thing.** A `people` view (`security_invoker = true`, per `0012`'s pattern)
   presents one row per person across both tables, so a surface that wants "who is this" — global
   search, for one — has somewhere to look that is not a join written out by hand for the fourth
   time.

### How the bridge does not break

`portal_profiles.team_member_id` is **not renamed, not moved, not made not-null**. Phase 1's `0010`
created it; Phase 2's `0014` RPCs resolve `select team_member_id into actor_tm from portal_profiles`
(lines 270, 460); Phase 3's handoff work reads it through `loadProfile` (`portal.server.ts:34`) and
`hub.functions.ts:299`. Every one of those keeps working unchanged, because everything here is
additive: an index, a backfill, a trigger and a view.

The only way this phase could break them is by creating a duplicate — which is what the unique index
exists to prevent, and it is created **before** the backfill runs, so a bad backfill fails loudly
instead of committing a broken graph.

`0025`'s down drops the trigger, the view and the unique index. It does **not** null out any
`team_member_id` and does **not** delete directory rows the backfill created: a `team_members` row is
a person, other tables now reference it, and deleting people to roll back a hygiene migration is the
single most destructive thing this phase could do.

---

## 3. The four write-orphaned tables

The audit's §7.2: four tables the UI renders and nothing can fill. Each gets a write path or a staged
removal. None is dropped in this release.

### `trace_links` — a derived write path, plus one manual link

Three reads (`hub.server.ts:426, 844, 930`) build the traceability spine on the Customer 360 and the
technical-solution pages; zero inserts exist. But most of the graph it wants to draw **is already in
the schema as foreign keys**: `technical_solutions.requirement_id`, `evidence.related_entity_type/id`,
`approvals.approved_entity_type/id`. The spine is empty not because the relationships are unknown,
but because nobody ever projected them into the table the renderer reads.

So the write path is a **derivation, not a form**: `0025` backfills those three relationships and adds
triggers that keep them in sync. A `source` column (`'derived' | 'manual'`) with a check constraint
marks provenance, and a unique index on the five-column tuple makes both the backfill and the triggers
idempotent. A hand-maintained parallel copy of a foreign key drifts from it on the first edit; a
derived one cannot.

That leaves exactly one relationship with no FK behind it: **decision ↔ technical solution**, which
`decisionsFor()` (`hub.server.ts:853`) looks for and which nothing can currently produce. That one is
genuine human input, so it gets a genuine write path — a small linker on the technical-solution page
behind `trace_links_editing`, writing rows with `source = 'manual'`.

The down deletes only `source = 'derived'` rows. Manual links are recorded human input and are kept.

### `graduations` and `cs_handoffs` — one record, and it is the handover record

"The graduation flow decides", so: there is no graduation flow. `graduations` has exactly one reader
(`hub.server.ts:571`) and no writer anywhere; `cs_handoffs` has exactly one reader (`:577`) and no
writer anywhere; `graduation-readiness.ts:329-367` reads both, prefers `cs_handoffs`, and falls back
to `graduations` field by field. Two tables, one event, one reader, zero writers. This is not a
design; it is the same thing modelled twice in `0003`.

**`cs_handoffs` becomes the record.** It is the richer of the two (`handoff_date`, `cs_owner_id`,
`summary`, `open_items`, `account_context` against `graduated_at`, `health_at_graduation`,
`exit_criteria_summary`, `notes`), and it is the one the UI already prefers and already calls the
"handover record". `0025` gives it the two fields only `graduations` had — `health_at_handover` and
`notes` — plus `recorded_by` and `updated_at`, and backfills it from `graduations` for any
implementation that has a graduation row and no handover row.

**`graduations` is deprecated, not dropped.** Its rows stay, its reader stays,
`graduation-readiness.ts` keeps its fallback, and a `comment on table` records that it is scheduled
for removal a release later. Dropping a table in the same migration that folds its data elsewhere is
precisely the pattern `0012` was written to avoid.

The write path is a **"Record handover" form** on the Customer 360's journey tab, upserting
`cs_handoffs` by `implementation_id`, behind `handover_record`. It is deliberately *not* a gate: the
readiness view stays read-only and stays independent, exactly as `graduation-readiness.ts`'s header
promises. Recording the handover does not assert it was a good one, and the readiness areas keep
reporting on the record's completeness rather than on its existence.

### `requirement_scope_changes` — staged removal

Never read, never written, referenced only by generated types and by `0003`'s RLS list. Unlike the
other three, **no UI renders it**, so there is nothing to give a write path *to*: building a
change-control surface nobody asked for, to justify a table nobody uses, is how dead weight becomes
permanent. It is deprecated for removal.

`0025` does not drop it. It archives any rows to `v2_archive.requirement_scope_changes` (there should
be none, but "should" is not a guarantee about a production database this phase cannot read), comments
the table as deprecated, and revokes write grants from `authenticated` so nothing can start depending
on it during the deprecation window. The drop is a later release's migration.

---

## 4. Vocabulary

The audit lists twelve vocabulary problems. This phase fixes the three the sketch names and
deliberately leaves the rest, because most of the remainder (the product name, "journey" as a
lifecycle word, "deals" vs "accounts", "portal" as three things) can only be fixed by renaming things
that three sibling phases are actively editing this week.

**Every rename below is a label, not an identifier.** No table, column, route, route parameter, query
key, enum value, entity-type string or stage id changes in this phase. Therefore **no URL changes and
no 301 is needed** — the URL guarantee is met by not putting anything at risk in the first place,
which is a better guarantee than a redirect. Where the earlier Sequences rename genuinely moved
routes, its 301s (`journeys.tsx`, `journeys.$journeyId.tsx`) stay exactly as they are.

### TIS is expanded

21 occurrences, never once expanded anywhere in the repo; the only spelled-out form in the project is
a prior audit agent's guess. It is the implementation-side owner role: **Technical Implementation
Specialist**.

One module (`src/lib/vocabulary.ts`) holds both forms, and the acronym is expanded **at first use per
surface** rather than everywhere — "Waiting on Technical Implementation Specialist to resolve the open
issue" in a dense triage list is worse copy, not better. Concretely: the Customer 360 journal panel,
the SOW analysis copy, the SOW PDF footer, and the Handoff stage's intent line.

The `party: "tis"` value in `customer360-derive.ts` is a **data value**, not copy, and is not touched
— see §8.

### The final stage has one name

Stage id `graduate-to-cs`, canonical label "Handover to Customer Success" (`lifecycle.ts:121-122`),
but "Graduate to CS" is what the leadership page renders. The id and its aliases (`graduate`, `cs`)
are untouched — they are parsed from stored data. Only the two rendered strings in `portfolio.tsx`
change, plus two stale comments. Four lines; no identifier, no URL, no stored value.

### The `org_id` seam reaches the `portal_*` tables

38 tables carry `org_id`; not one `portal_*` table does. `0025` adds it, with the same default and the
same FK, to the nine `portal_*` tables that hold tenant data — `portal_accounts`, `portal_profiles`,
`portal_api_keys`, `portal_stage_transitions`, `portal_gong_reports`, `portal_briefs`,
`portal_tam_requests`, `portal_onboarding_notes`, `portal_audit_log` — and indexes the two queried in
bulk.

`portal_app_config` deliberately does **not** get one: it holds the feature flags and the domain
allowlist, which are properties of the deployment, not of a tenant. Giving it an `org_id` would imply
per-tenant flags, a product decision nobody has made.

**It stays a seam.** No policy filters on it and no query filters on it, exactly as on the hub side.
Adding a filter is the moment single-org assumptions elsewhere start returning empty pages, and that
belongs to whatever phase actually makes the product multi-tenant. What this phase buys is that when
that phase arrives, it is not also a data migration.

---

## 5. Global search and saved views

**Search** (`/search`, flag `global_search`) is one server function over six surfaces — customers,
implementations, presale deals, tickets, technical solutions, and people through §2's view — matching
`ilike` on the name/title columns, capped per group, returning nothing but what the result links to.
It runs behind `requireInternalAuth`, so a customer-role login cannot reach it, and it queries no
table the caller could not already open.

It is not ranked and it is not fuzzy. A relevance score across six unrelated tables is a number that
stands in for judgement, which this project refuses elsewhere; grouping by kind and showing the count
per group lets the reader do the ranking.

**Saved views** (flag `saved_views`) store a named set of search parameters for one surface —
`{surface, name, query jsonb, shared}` — owned by a profile, optionally shared with the team.
Deliberately **not** a saved result set: a view that stored rows would go stale silently. Re-running
the query is the point. The table is `saved_views` in `0025`; the write path is a "Save this view"
control on `/customers` and `/search`; and a view is applied by writing its query into the URL — so a
saved view produces an ordinary, shareable, bookmarkable URL, and nothing about the existing
`/customers` search-param contract changes.

---

## 6. Demo mode

`demo_mode` (flag, default off) replaces customer and account names with stable pseudonyms at the
**server projection**, not in the browser. Client-side masking ships the real names to the page and
hides them with CSS, which is a demo that leaks on view-source.

The pseudonym is derived from the record's uuid, so it is stable across a session and across surfaces
(the same account is "Northwind Logistics" on the list and on its own page) without storing anything.
ARR is bucketed rather than blanked, because a demo of a portfolio view with every number missing
demonstrates nothing.

Applied at exactly three call sites, chosen so the blast radius on files three other phases are
editing stays as small as it can be:

- `loadImplementations()` — the single choke point every customer name and ARR reaches Home, the
  customers list and the leadership portfolio through. One masked projection covers three surfaces
  and touches neither `home-triage.ts` nor `leadership.ts`, which Phase 6 owns this week.
- `loadCustomer360()` — the surface a demo spends longest on, including its named contacts.
- global search, in this phase's own file.

Internal staff names are deliberately **not** masked anywhere. They are the demo.

---

## 7. API keys: expiry and rate limits

`portal_api_keys` gains `expires_at timestamptz` (null = no expiry, so every existing key is
unaffected) and `rate_limit_per_minute int not null default 120`. `requireApiKey` gains two checks
after the scope check:

- expired → `401 expired_api_key`, distinct from `invalid_api_key` so an integration owner can tell
  "your key ran out" from "your key is wrong";
- over limit → `429`, with `Retry-After` and `X-RateLimit-*` headers.

The counter is a `portal_api_key_usage` row per key per minute, incremented by
`portal_api_key_consume()` — a single `insert … on conflict do update … returning`, atomic under
concurrency in a way read-then-write from the app never is. Old buckets are deleted opportunistically
by the same function.

Both checks sit behind `api_key_limits` (default off), because the failure mode of getting a rate
limit wrong is a silently broken Salesforce integration. The columns and the counter table are inert
until it flips, and the admin UI shows both values whether or not enforcement is on — so an operator
can see what *would* happen before it does.

---

## 8. What this phase deliberately does not do

- **It does not merge the people tables.** §2. The `auth.users` FK makes a merge either fake-account
  minting or a 19-table FK rewrite; the bridge is finished instead.
- **It does not drop anything.** `graduations` and `requirement_scope_changes` are deprecated with
  comments, archives and revoked grants; the drop is a later release, per the house rule that a
  removal never lands in the same migration as the thing that replaces it.
- **It does not add actor columns to `audit_log`.** The ledger gives those to Phase 4's `0020`.
- **It does not touch `customer360-derive.ts`'s "Waiting on" strings.** Five user-visible strings
  there say "TIS", and Phase 6 is promoting "Waiting on" to a cross-surface backbone in exactly that
  code. Expanding an acronym is worth approximately nothing next to a merge conflict in the file three
  surfaces derive their state from. Deferred, explicitly, to whoever lands after Phase 6.
- **Demo mode does not mask the presale pipeline, tickets, or the customer portal.** Those have
  their own projections, and this phase deliberately limited itself to the three call sites in §6
  rather than threading a masker through every loader in the codebase during a parallel week.
- **It does not rename the product, the "journey" lifecycle tab, "deals" vs "accounts", or the
  triple-overloaded word "portal".** Every one is a rename across files Phases 4, 5 and 6 are editing
  right now, and the audit is clear that the product-name split alone spans two dozen files. They are
  cosmetic, they are not urgent, and doing them in a parallel week is how you get a regex that renames
  an unrelated identifier which merely shared a word.
- **It does not filter on `org_id`.** The seam is extended; filtering is a multi-tenancy project.
- **It does not make either new record a gate.** Derived trace links and the handover record are
  records. `graduation-readiness.ts` stays read-only and stays independent, as its header promises.
- **It does not flip a flag.** Eight new flags, all `false`.

## Flags

`audit_activity_feed`, `audit_strict`, `handover_record`, `trace_links_editing`, `global_search`,
`saved_views`, `demo_mode`, `api_key_limits` — all default off, one contiguous block in `V2Flags`.
