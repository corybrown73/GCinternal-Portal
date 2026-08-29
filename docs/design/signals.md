# Design: signals & metrics (Phase 6)

Like the handoff gate, not design-paneled — designed here against the code, at phase start.

Phase 6 does not add a source of truth. Every fact it needs is already recorded and, as the audit
put it, **unread**: `implementation_stage_history` holds the full transition record, 0014/0015 gave
every stage a target duration, and `alerts.kind` is free text. The work is turning those into
signals that can always say *why*. So the phase's whole risk is in the reading, and this design is
mostly a list of readings we refuse to do.

---

## 1. The one decision that shapes everything: only a recorded transition is an observation

Two stage systems are live (audit §7.4), and one of them is a mirror.

`implementation_stage_history` is the **authority** — `hub.server.ts:1457` says so in as many words,
and `advanceStage` closes the open row and opens the next in the same instant, so the segments are
contiguous and each one was written by someone actually moving a project.

`stage_instances` is the read cache for the templated plan. Its rows carry `provenance` because
migration 0015 created one for **every** implementation, and most of them were not observed:

- `backfill_inferred` — the state was deduced from stage **order** alone. `entered_at` is null. There
  is nothing here to measure.
- `backfill_observed` — history did have rows, so 0015 wrote `min(entered_at)`/`max(exited_at)`
  across them. For a stage entered once that is the truth. For a stage **re-entered**, that single
  span silently swallows the time spent in every stage in between.

So the rule is not "exclude the inferred ones". It is stronger and simpler:

> **No metric in this phase reads a timestamp from `stage_instances`, at any provenance.**
> Dwell, velocity and slip are computed from `implementation_stage_history` and nothing else.

`stage_instances.target_duration_days` **is** read, and that is not an exception: a target is a fact
copied from the template at instantiation, not an observation of what happened. Provenance describes
how the row's *state and timestamps* came to be; it says nothing about the target. The code enforces
the split structurally — `stageSegments()` accepts history rows and has no way to reach an instance
row, and targets arrive as a separate `Map<stage_key, days>`.

### What else is excluded, and why it is counted rather than dropped

A segment becomes an observation only if it survives four rules. Every excluded row is **counted and
named by reason**, and the surface renders those counts beside the numbers — a distribution that
hides what it discarded is the same black box as a score.

| Rule | Why |
|---|---|
| `exited_at` must be present | An open stage has not finished. Treating "so far" as a dwell makes the slowest work look fastest, which is exactly backwards. Open stages are reported separately as *current* dwell. |
| The stage must normalize (`normalizeStage`) | Pre-handoff values (`qualify`, `scoping`, `technically-validate`) are upstream steps this app does not own. Legacy ids alias forward, so real history is never thrown away. |
| `exited_at >= entered_at` | The table has no DB guard (audit §5). An impossible row is a data defect, and averaging it in launders the defect into a metric. |
| Segments are grouped per implementation, in `entered_at` order | Velocity is a claim about one project's sequence, not about a pile of rows. |

Zero-day segments are **kept**. Someone really did click through in a day; dropping them would be an
unstated opinion about which recorded facts count.

Presale (`portal_stage_transitions`) is not read at all. Different vocabulary, different guard, and
its `onboarding_*` tail overlaps the hub lifecycle — joining the two would double-count the same
weeks. Phase 5 owns that seam.

---

## 2. The three readings

### Velocity — what one project actually did, in order

**Is:** for one implementation, the ordered list of its completed stage segments with the observed
days each took, plus the current open segment and how long it has been open, plus how many lifecycle
stages remain.

**Is not:** a rate. There is no stages-per-week, no projected completion date, no trend.

**The failure mode being avoided:** a rate implies a forecast, and a forecast from this data would be
a lie twice over — stages are not comparable units (Handoff is a meeting; Build is a quarter), and
three implementations is not a sample. "Velocity: 0.4 stages/week" reads as knowledge and contains
none. The list contains everything the rate would have been computed from, and a reader can see that
one stage took 91 days.

### Dwell vs target — an observation against a number somebody chose

**Is:** per stage, the observed distribution across completed segments (n, min, median, p90, max) and,
per segment, its comparison to `target_duration_days` for that stage on that implementation.

Median and p90 use the **nearest-rank** method, so the value returned is always one of the listed
observations — you can click p90 and land on the transition that *is* p90. Interpolating would
produce a number that never happened.

On-time is reported as a triple — `{ within, over, no_target }` — never a percentage. The object has
no `pct` field, deliberately: "78% on time" is judgement wearing a number's clothes, and it also
hides that 23 of the 42 transitions had no target at all.

**The failure mode being avoided:** deriving the target from the observations. A rolling median as
the benchmark means every project is measured against itself and nothing is ever late. The target
must come from the template — a number a human chose in advance — or there is no target, and
`dwellVsTarget` returns `no_target` and says so.

### Slip attribution — where the launch date went, named by stage

**Is:** when a target launch date has passed, or is behind against today, the slip in days, and the
completed and current stages that ran **over their own targets**, each with days over. What the
stages do not explain is reported as an explicit `unattributed_days` remainder rather than silently
assigned to the nearest suspect.

**Is not:** attribution to a person, and not a cause. A stage that ran long is where the time went,
not whose fault it was.

**The failure modes being avoided:**

1. *Blaming the current stage.* Slip is discovered at the end, so the stage a project happens to be
   sitting in when someone looks always takes the blame. Attribution runs over the whole recorded
   sequence, and the current stage appears only if it too is over its own target.
2. *Forcing the arithmetic to close.* If no stage on the implementation has a target, the honest
   answer is "this slip cannot be attributed", not a plausible-looking split. If the overruns exceed
   the slip, that is reported as well: the plan absorbed time somewhere, and pretending otherwise
   would make the remainder negative.

---

## 3. The two new alert kinds

`alerts.kind` is free text (0006), and Phase 3 added `handoff_returned` without a migration. These
need none either.

The governing rule: **an alert that cries wolf is worse than no alert.** Both kinds therefore require
a *positive, dated, named fact* — never an absence — and both name that fact in `detail` and in
`payload`.

### `champion_gone_quiet`

Silence is not observable. What *is* observable is a question we asked and nobody answered. Fires
only when all four hold:

1. The implementation is in a non-terminal stage.
2. `waitingOn()` puts the dependency on the **customer**. If we are the blocker, their quiet is
   correct behaviour.
3. There is a **named, dated, unanswered customer-side ask** at least 21 days old: an approval
   `requested_at` ≥ 21d ago with no `decided_at`, or a customer-facing commitment overdue ≥ 21d.
4. A person is **named** on it (`approver_name`/`approver_role`, or `committed_to`). Without a name
   this is a data-quality problem, not a champion problem, and the alert would be unactionable — it
   does not fire, and the metrics surface lists it under unnamed asks instead.

Why that is sufficient: each condition is a stored fact with a timestamp, and together they say
something falsifiable — "we asked X on the 3rd, it is now the 27th, and everything is waiting on
them." That is a sentence someone can act on, or disprove in one click.

### `launch_date_at_risk`

`launch_overdue` already covers a date that has passed; this one fires **before**. All three:

1. `target_launch_date` is in the future and within 30 days, with no `actual_launch_date`.
2. The lifecycle has not reached Launch.
3. At least one **named blocker**:
   - the launch acceptance gate is blocked (`launchAcceptanceGate` — server-enforced in
     `advanceStage`, so this is not an opinion: the advance will literally be refused); or
   - every remaining stage up to Launch has a target and their sum exceeds the days remaining — all
     of them, because a sum over a partial set understates, and would be a false negative dressed up
     as arithmetic; or
   - an open escalation of `critical` or `high` severity.

Why that is sufficient: condition 3 is the whole design. Firing on the date alone would alert on
every healthy project with a launch next month, every hour, and within a week nobody would read
`/alerts` at all.

**Neither kind emails.** They insert an alert row and appear on `/alerts`. Email is for things
somebody must do today; both of these are "look at this before your next call". Both dedupe against
an existing unacknowledged alert of the same kind on the same implementation, exactly as the cron's
stalled and overdue-milestone passes already do.

---

## 4. Engagement, and an absent source

The sketch asks for engagement signals from Phase 4 telemetry, "weighting interactive events above
bare GETs". Phase 4's `external_plan_events` may not exist when this ships.

**The weighting is not a score.** No points, no engagement level, no 0–100. It is expressed as a rule
about *what a class of event is allowed to conclude*:

- **Interactive** (`task_completed`, `task_reopened`, `comment_added`, `file_uploaded`,
  `task_reassigned`) — the contact did something. Enough to **refute** a claim that they went quiet.
- **Passive** (`opened`, `snapshot_viewed`) — the contact looked. Recorded as evidence and shown, but
  it never refutes: opening a plan and then not answering is the *literal shape* of going quiet.
- **Neither** (`passcode_failed`, `grant_revoked`, `grant_rotated`) — security and administration, not
  engagement. Counting a revoke as activity would be nonsense.

So telemetry can only **refute or reinforce** a signal that some other stored fact originated. It can
never originate one. That falls out of the design rather than being a workaround for Phase 4's
absence, and it means the champion alert behaves identically whether or not the table is there —
when it lands, some alerts will stop firing because a customer demonstrably was not quiet, which is
the correct direction for new evidence to move a conclusion.

**When the table is absent** the engagement signal returns `{ available: false, reason }` and every
surface renders "engagement telemetry not available". It never returns "no events", and it never
reads as healthy. An absent source is *no signal* — the same distinction `deriveHealth` already makes
with `no_signal`, which is why that value exists and is never stored.

The module is isolated (`signals/engagement.ts` pure, `signals.server.ts` probing) so that when Phase
4 lands the only thing that changes is that the probe starts succeeding.

---

## 5. "Waiting on" as the cross-surface backbone

`waitingOn()` already decides who owes the next move; it is the string the brief quotes verbatim. It
was, until now, a label on two surfaces. Phase 6 promotes it in one small way and then spreads it:
**a dependency now carries the date it started and which record decided it.** "Waiting on the
customer" is a status; "waiting on the customer since 4 March, on the SOW approval" is a signal.

The clock comes from the deciding record's own timestamp — the approval's `requested_at`, the
commitment's `due_date`, the escalation's `raised_at` — and never from `stage_entered_at`, which
would date the wait from the last stage move and overstate almost every one of them.

What it means per surface:

- **Home (`/`)** — every triage row states its party and its age. The queue stops being "what is
  loudest" and becomes "who owes what, and for how long".
- **Customer 360** — unchanged in placement, now with the since-date and the named record.
- **Leadership (`/portfolio`)** — already keyed on it for interventions; it now consumes the same
  object the queue row carries rather than re-deriving it, so the two can no longer disagree.
- **Signals (`/signals`)** — the portfolio grouped by party: how much of the book is blocked on us,
  on customers, on nobody. A count of named accounts, not a rate.
- **Alerts** — `champion_gone_quiet` is definitionally an old customer-side waiting-on, which is why
  its condition 2 exists.
- **Work items** — `work_items.waiting_on_party` is the same idea at **task** grain. This phase does
  **not** merge them. An account waits on one party; its twelve tasks wait on several, and collapsing
  them would produce a number that is true of nothing.

---

## 6. What this deliberately does not compute

- **Any composite or score.** No health score, no engagement score, no readiness percentage. Phase 3
  shipped a count of named facts instead of a score for this reason, and it applies here unchanged.
- **Forecasts and trends.** No projected launch date, no "velocity is improving". `/portfolio` says
  "Nothing here is a score, forecast or trend" and that string stays true.
- **Rebaseline counts, and slip against the original date.** There is no original date.
  `implementations.target_launch_date` is overwritten in place, and hub `audit_log` has **no writer**
  (audit §7.2), so nothing anywhere records that a date moved. A `baseline_launch_date` column would
  be null for every existing row and would then read as "never rebaselined" for exactly the accounts
  most likely to have slipped. Slip is therefore measured against the *current* target and the
  surface says so. This is the strongest candidate for a future migration, and it belongs to whichever
  phase makes something *write* the change — not to this one.
- **Per-owner performance.** Dwell is a property of a stage on an account. Rolling it up per owner
  turns it into a personnel metric, and a personnel metric derived from a field the same person edits
  is a gaming instruction. Owner load already exists on `/portfolio` as a count of work, not a rating.
- **Presale-through-delivery cycle time.** See §1.
- **Anything written.** Every signal here is derived at read time. Nothing new is cached; Phase 1's
  `health_computed` remains the only computed value with a stored copy, and nothing in this phase
  writes it. `health_recorded` is untouched — a human's statement wins on display, always, and no
  signal here overwrites, merges with, or silently corrects one.

---

## 7. Migration: none

**0024 is reserved and unused.** Everything needed is already recorded: history (0003), stage targets
(0014/0015), free-text `alerts.kind` (0006), and Phase 1's health cache.

The only genuinely new datum this phase could want is the launch-date baseline, and §6 explains why
adding it now would create a column that lies about every existing row. Taking the number "just in
case" would also leave a hole in a sequence whose ordering the CI up→down→up job walks. The ledger
predicted little or nothing here; the answer is nothing.

## 8. Flag

One: **`signals_alerts`, default false**, gating only the *emission* of the two new alert kinds in the
hourly cron. Nothing else is flagged. The `/signals` surface is read-only, internal-only, and shows
facts already visible elsewhere in the app; hiding it behind a flag would only mean nobody reviews it
before the alerts go live. The evaluators are pure and always run in the metrics view, so the flag
controls whether anyone is *notified*, never whether anyone can *see*.

## 9. Left open

- **The two windows are constants, not configuration.** 21 days of customer silence and a 30-day
  launch horizon are stated in the code and rendered on the surface. `portal_app_config` could hold
  them; nobody has yet complained that they are wrong, and a knob nobody has asked to turn is a
  setting that will be wrong in a different way. Revisit after the alerts have run a quarter.
- **Whether `launch_date_at_risk` should email once the flag is on.** It does not today (§3).
- **Telemetry retention and disclosure** (portal-access, open questions) gates how far back the
  engagement evidence may reach. Unresolved there, inherited here; the module reads only what exists.
