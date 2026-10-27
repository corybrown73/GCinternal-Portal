# Release runbook: PR #100 then PR #101

Status: prepared, not executed. Neither PR is merged. Nothing is deployed. No
production migration has been applied. No production flag has been changed.

This runbook says what each rollout control does and does not disable, how to
recover, and which steps need someone with production access. Read it before any
step in section 6.

## 1. What changes for people when PR #101 is deployed

Grouped by whether the change depends on the `complete_solutions` flag.

**A. Only when `complete_solutions` is ON** (off by default everywhere):

- The Solutions summary on Customer 360.
- The Solutions workspace at `/solutions/<id>`.
- Solution suggestions in transcript review (empty while the flag is off).
- The Solutions server functions. Each one refuses with "Complete solutions are not
  turned on for this Hub yet." while the flag is off.

**B. Always on once the code is deployed** (no flag covers these):

1. **Post-sale edit rule.** Delivery writes on an implementation are allowed only to
   the team member who owns it (`implementations.owner_id`), to a Team Lead, a
   manager, an admin or a super admin. This covers risks, issues, decisions,
   commitments and evidence; stage advance, hand-off and graduation; task status;
   SOW apply and SOW document; success criteria, observations, confirmations and
   adoption; and implementation dates and fields. Technical roles (`se`, `tam_se`)
   are refused for delivery writes even when they own the implementation.
2. **Owner reason.** A manual owner change needs a reason code, and "Other" needs
   words. It applies to the implementation's owner control, the stage-flow owner
   control, and a manager's named pick on the assignment screens **only where the
   pick changes an existing implementation's owner**. A deal with no implementation
   yet is the pre-sale assignment and needs no reason (see section 4).
3. **Owner history.** Every change to `implementations.owner_id` is recorded in
   `implementation_owner_changes`. A change made by a person with a reason is
   recorded as manual. Any other change (assignment engine, claim, Closed Won,
   Salesforce sync) is recorded as system, with no reason invented.
4. **Team Lead.** A profile flag, default off. It has no effect until an admin ticks
   it under Admin → Users. The admin users page gains a Team Lead column.
5. **Transcript date suggestions.** A suggested date on a deal's plan is refused for
   a person who may not manage the implementation.

## 2. Rollout controls, and what each one does and does not disable

| Control | Turns off | Does not turn off | How |
| --- | --- | --- | --- |
| `complete_solutions` flag (admin → Flags) | Group A. Hidden immediately, no deploy | Group B: the edit rule, owner reasons, history, Team Lead | Admin toggles it. Staging-only until sign-off |
| Revert the application code (redeploy the build from before PR #101) | Group B: the edit rule, owner reasons, the Team Lead column in the admin UI, the date-suggestion guard. Group A too, since the code is gone | Database: the schema and the history stay. Owner history continues to be written by the database triggers, as system changes | Redeploy the previous build |
| Remove a Team Lead grant (admin → Users, untick) | That person's Team Lead authority | The column, the rule, everything else | Admin unticks the box |
| Database rollback (`supabase/down/0091_down.sql`) | Everything 0091 added | Nothing is turned off in place. It is destructive, see section 5 | **Not planned for production.** Only on a disposable copy |

**There is deliberately no flag for the edit rule or the owner reasons.** Switching
either off would reopen the gap they close, which is a weakening, not a rollback. If
the business wants a temporary bypass, that is a decision to take explicitly, with
its own approval and expiry. It is not built here.

**Consequence to know:** with the flag off, group B still applies. An assigned TIS
can still edit their implementation, but another TIS is refused where the old code
allowed it. That is the approved permission model; it is not reversed by turning the
flag off. Recovering from a wrong rule means reverting the code (last row above).

## 3. Preconditions before deploying PR #101 to production

1. PR #100 merged and its migration `0090` applied and verified (section 6).
2. `0091` applied and its verify file run and recorded (section 6).
3. Review of `implementation_owner_conflicts` on production, read only. Each row is
   an implementation where the owner and the journey's `implementation_manager` role
   differ. The edit rule uses `owner_id` only, so a row does not change anyone's
   access, but a wrong `owner_id` will block the person who should work on it. Each
   wrong owner is corrected by a Team Lead or admin through the reassignment, with a
   reason, before deploy. Record the count and the decision for each.
4. A production backup taken immediately before 0090 and 0091 (section 6, step 2).

## 4. Pre-sale behaviour

The reason requirement must not change pre-sale work. Checked against the code:

| Path | Result |
| --- | --- |
| Closed Won start (`startOnboardingAs` → `assignDeal` with no pick) | Unchanged. Writes the owner directly; recorded as system |
| Automatic assignment by rule (`assignDeal`) | Unchanged. Same direct write |
| Salesforce sync (`assignDeal` from `sf-integration`, no actor) | Unchanged. Direct write, recorded as system |
| Claim (`claimDealFn` → `assignDeal`) | Unchanged. Direct write |
| Manager's named pick on a deal **with no implementation** | Unchanged. No reason asked. No owner written |
| Manager's named pick where the deal **has an implementation** whose owner changes | Reason asked. Recorded as manual |
| Manager's named pick that equals the current owner | No reason asked. No change written |

The coupling found and corrected in this PR: the manager's named pick used to refuse
any pick without a reason, before the server knew whether an implementation existed.
That refused ordinary pre-sale picks. The rule now lives in the server
(`namedPickNeedsReasonFor`) and in one pure function (`namedPickNeedsReason`,
tested), and both assignment screens follow it.

## 5. Database history

- **The ledger is never dropped silently.** `0091_down.sql` refuses to drop
  `implementation_owner_changes` while it holds rows, unless
  `down.owner_history_export_confirmed` is set. That confirmation is separate from the
  Solutions one, so a Solutions export cannot be mistaken for an owner-history export.
- **Team Lead grants are guarded the same way** (`down.team_lead_export_confirmed`).
- **Solutions records** keep their own guard (`down.complete_solutions_export_confirmed`).
- The ledger's rows are protected in place: an update or delete is refused by trigger
  (`implementation_owner_changes_no_update`, `_no_delete`).
- Tested on a scratch database holding one owner-history row and one Team Lead grant:
  the rollback refused without each confirmation, and completed only with all three.
- **No backfill.** `0091` does not write history for owners set before it was
  applied. History starts at the migration. Existing owners are visible through the
  conflict view in section 3.

## 6. Release sequence

Steps marked **[prod]** need someone with production access and explicit approval.
Nothing here has been run.

1. **[approval] Confirm the release decision** with the business owner (this runbook).
2. **[prod] Confirm backups.** In the Supabase dashboard for project
   `wynvngnbjasiuxkcfofu`: record the plan, whether point-in-time recovery is enabled
   and its window, and the time of the most recent backup. Take a manual backup or
   export of `implementations`, `implementation_role_assignments`, `portal_profiles`
   and `portal_assignments`. Record its ID and time. **Do not treat a backup as
   existing until these records are in hand.** This repository has no backup runbook
   to point at.
3. **[prod] Confirm applied migrations.** Run `list_migrations` (or the dashboard) on
   production. Record the last applied version. It must be `0086` (the main baseline).
   If it is anything else, stop and reconcile before continuing.
4. **[approval] Merge PR #100** after its CI is green. Its CI includes the production
   migration gate, which stays red until step 5 is done.
5. **[prod] Apply `0090`** (`customer_contacts` policy drop, one statement). Run
   `supabase/verify/0090_verify.sql` against production and record the output. Add the
   `production-migration-verified` label to PR #100. Rollback exists
   (`0090_down.sql`) but would reopen the contact-notes exposure. Do not roll it back
   without a decision.
6. **[prod] Apply `0091`**, additive. Run `supabase/verify/0091_verify.sql` (14 read
   only checks). Record the output. Expect `team_lead` to be false everywhere and the
   ledger to be empty.
7. **Bring PR #101 up to date with `main`.** Merge `main` into PR #101 (not a
   rebase, the branch is shared). The one conflict is in
   `src/lib/transcript-proposals.server.ts`; the resolution is in section 7.
8. **CI on PR #101.** The migration job must be green. If the schema-invariant step
   fails, its check-run annotation names the file and the statement (added in this
   PR). Do not merge while it is red.
9. **[approval] Merge PR #101.**
10. **[approval] Deploy the application** (the build from the merged PR #101).
11. **Flag stays OFF.** Run the smoke checks (section 8) as internal accounts with
    the flag off. These check group B.
12. **[approval] Turn the `complete_solutions` flag on** only after step 11 passes and
    the business owner decides. It applies to everyone; there is no per-user flag.
13. **Smoke checks with the flag on** (section 8, Solutions part), on a QA deal only.

## 7. The conflict between PR #100 and PR #101

Both change `src/lib/transcript-proposals.server.ts`. Merging PR #100 into PR #101
gives one conflict hunk, in the import block at the top of the file:

```ts
<<<<<<< (PR #100)
import { isPartnerJourney } from "./partner-implementation";
=======
import { rowOrThrow } from "./server/db-read";
import type { ComponentStatus, Priority } from "./complete-solutions";
>>>>>>> (PR #101)
```

**Resolution: keep all three lines**, in this order: the `isPartnerJourney` import,
then `rowOrThrow`, then the two `complete-solutions` types. The body of the file
merges without conflict, so PR #100's partner date guard and PR #101's owner-reason
branch both stay. Run `npx vitest run src/lib/__tests__/transcript-proposals-server.test.ts`
and `npx tsc --noEmit` after resolving. Section 10 records the result of that check.

## 8. Smoke checks

Use synthetic records only (a QA deal and customer, names starting `QA TEST`). Use
approved internal accounts. Do not use the real Mako Shark SOW.

Flag OFF (group B):

1. The assigned TIS can edit a stage or task on their own implementation.
2. Another TIS is refused the same edit, with the plain sentence.
3. A Team Lead ticked by an admin can make the same edit on the other TIS's
   implementation. Nobody can tick their own box.
4. A manager's named pick on a deal **with no implementation** saves without a reason.
5. A manager's named pick on a deal **with an implementation** asks for a reason, and
   the change appears in the ledger as manual, with it.
6. The Closed Won start on a new QA deal still assigns an owner, with no reason asked.
7. Customer 360 shows no Solutions card. `/solutions/<id>` says the feature is not
   turned on.

Flag ON (Solutions part, staging-proven steps in `docs/SOLUTIONS-ACCEPTANCE.md` §5,
run on production only with the approval in step 12):

8. Add a solution, a component, a dependency; confirm the summary card counts.
9. A version conflict is refused with the reload sentence.

## 9. Stop conditions and recovery

**Stop immediately** (do not continue the sequence) if any of these occur:

- A verify file (`0090` or `0091`) fails or returns an unexpected row.
- Production logs show SQLSTATE `42501` or `P0409` from delivery writes outside the
  expected refusals, or the message "Could not check your access" for a person who
  should have access.
- A manual owner change fails, or a recorded change is missing from the ledger.
- A pre-sale assignment fails (Closed Won start, rule assignment, claim).
- An assigned TIS cannot edit their own implementation.

**Recovery, in this order:**

1. **Turn the flag off** if the problem is in Solutions. This does not fix group B.
2. **Revert the application code** to the build before PR #101 if the problem is in
   group B. The database stays as it is. Owner history continues to be recorded.
3. **Correct data by reassignment, not by deleting history.** A wrong owner is fixed
   through the reassignment with a reason. The old row stays.
4. **Do not run `0091_down.sql` or `0090_down.sql` in production.** Each is
   destructive or reopens an exposure. Either would need a separate, written decision
   and an export first.
5. **Restore from backup** only on the approval of the business owner and whoever holds
   the production access. That restore is a separate operation with its own record.

## 10. Verification status

| Item | Status |
| --- | --- |
| Migration replay, CI sequence (up, down with CI confirmations, up, all probes), local Postgres 16 | Passed in this session |
| Rollback guards for owner history and Team Lead (scratch database) | Passed in this session |
| Unit tests, typecheck, lint, build | See the PR comment |
| CI on PR #101 (GitHub) | Not yet re-run at the time this file was written. See the PR |
| Production backup and recovery | **Not verified.** Needs production access (section 6, step 2) |
| Production applied migrations | **Not verified.** Needs production access (section 6, step 3) |
| Main code running against a `0091` database | Reasoned from the code, not executed |
| Browser smoke checks | **Not run.** No staging backend |
