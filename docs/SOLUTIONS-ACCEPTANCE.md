# Solutions workspace: acceptance in an isolated environment

Status: PR #101 (`claude/complete-solutions-workspace`). Not merged. Not deployed.
The `complete_solutions` flag is off everywhere until acceptance is signed off.

This guide is for a **staging** environment only: a separate Supabase project with
no production data. Never run these steps against production.

## 1. What the environment needs

1. **A staging Supabase project** with the migrations applied in this order:
   - everything on `main` up to `0086_milestone_override_path.sql`;
   - `0090_customer_contacts_internal_only.sql` (PR #100), if #100 is merged to main first;
   - `0091_complete_solutions.sql` (PR #101), last.
   See the release order in section 6. Apply with the normal staging procedure
   (`docs/MIGRATIONS.md`), not by hand in the dashboard.
2. **Environment variables** for a staging deployment: the `VITE_SUPABASE_*` and
   `SUPABASE_*` values for that project, and `ANTHROPIC_API_KEY` for the SOW reading.
   Use a staging key. The SOW is sent to the model provider; confirm that is allowed
   for the documents you use (section 4).
3. **The flag, on in staging only.** Admin → Flags → *Complete solutions* → on.
   Turning it on is a staging-only change. The catalogue entry (`feature-flags.ts`)
   says it needs migration `0091`, so the flag will not appear until that is applied.
4. **Test accounts.** Sign-up is restricted to the domains in `portal_app_config`
   (`allowed_email_domains`). Create the accounts below through sign-up on the staging
   URL, then have an admin set each role under Admin → Users. Only an admin can change
   a role; the database refuses anyone else.

## 2. Accounts and what each should see

| Account (test name) | Portal role | How it is set up | Expected on the workspace |
| --- | --- | --- | --- |
| Admin | `admin` | First sign-up, or set by an admin | Full view and edit on every implementation |
| **Team Lead** | any portal role, plus the Team Lead flag | Admin → Users → tick **Team Lead** (an admin or super admin only; nobody can tick their own) | Full view and edit on every post-sale implementation, whoever is assigned |
| Manager | `manager` | Set by an admin | Full view and edit on every implementation (unchanged; also reaches assignment rules and Salesforce administration) |
| **Assigned TIS** | `implementation` | Owns implementation **A** (formal assignment: Assignment page or claim) | View and edit on **A**; view-only elsewhere (no edit controls) |
| **Different TIS** | `implementation` | Owns implementation **B**, not **A** | View on **A**; edit controls hidden; a direct change is refused |
| **New TIS** | `implementation` | Owns nothing | View; no edit controls on any implementation |
| Technical contributor | `se` or `tam_se` | Linked to a team member, may be an owner | **No** delivery edit rights, even on an implementation they own |
| Customer | `customer` | Customer login | No access to `/solutions/…`; the Hub must refuse it |

"Owns" means `implementations.owner_id` is that person's team member. It is set when
an implementation is assigned, claimed, or reassigned, and nowhere else.

## 3. Test data

- Use a **QA test deal and customer**, named `QA TEST – …` as in
  `docs/QA-CLICKTHROUGH-2026-09-28.md`. Create two implementations, **A** owned by
  the Assigned TIS and **B** owned by the Different TIS, so the permission cases can
  be compared on one screen each.
- Each implementation needs a deal with purchase record items on its intake (the
  services list). Include at least one item that a solution will match by name, one
  item with no solution, and one solution with no matching item.
- For the SOW cases, attach a SOW file to implementation **A** through the normal
  attachment flow. **Use a document you are allowed to use in staging**. Section 4
  says how the real Mako Shark SOW should be provided.

## 4. The real Mako Shark Electric SOW

The SOW is not in the repository and must stay out of it. Options, in order of
preference:

1. **Attach it in staging through the normal SOW upload** to implementation A. It
   is then in the project's access-controlled storage, not in git. Run the browser
   steps in section 5 against that copy.
2. **Run the automated acceptance checks locally** from a file outside the repo:

   ```
   mkdir -p private-fixtures   # ignored by git (see .gitignore)
   cp ~/secure/mako-shark-sow.pdf private-fixtures/
   MAKO_SOW_PATH="$PWD/private-fixtures/mako-shark-sow.pdf" \
   ANTHROPIC_API_KEY=… \
   npx vitest run src/lib/__tests__/mako-shark-sow.acceptance.test.ts
   ```

   Each check in that file is one requirement from the acceptance brief: the
   Inspection and Change Order workflow, forms, integrations with a type, Analytics,
   the 10–16 week estimate beginning after form finalisation, the SharePoint access
   dependency, the revision limitations, and pricing lines kept out of deliverables.
   Without `MAKO_SOW_PATH` the checks show as **skipped**. A skipped check has not
   been run.

Do not paste the SOW, its extracted text, or the model's reading into a ticket,
a PR, or a commit. Record the result of each check as pass or fail, with the
requirement it tests.

## 5. Browser steps

Sign in as each account in a separate browser profile (or a private window per
account) so the sessions do not share one login.

### A. First look (Admin, then Assigned TIS)

1. Open a customer that has implementation A. On **Customer 360**, the solutions
   summary card shows. It lists each solution with its scope, components, readiness
   (confirmed and suggested), and a delivery date. Check the counts match the rows.
2. Click the card's link. It opens the **Solutions workspace** for implementation A,
   with a breadcrumb back to the Customers list and to the customer. Both links work.
3. Confirm the wording is plain. The page should say what a solution is, and what to
   do next.

### B. Creating and editing (Assigned TIS, implementation A)

4. **Add a solution** by hand: give it a name, a scope (purchased or requested), a
   priority. It appears as a card with no components and the readiness "Not ready".
5. Add **components** to it: one form, one integration (choose its type: dispatch,
   dynamic reference data or system), one Analytics item, one training item. Each
   appears under its category.
6. Set a component to **Waiting** without saying what it is waiting on. It must be
   refused, with a sentence that says what to add. Add the blocker; it saves.
7. Set a component to **Changes needed** without an explanation: refused. Add one: saves.
8. Make the integration **depend on** the form. Try to make the form depend on the
   integration as well: the second must be refused as a loop.
9. Try to mark the solution **Complete** while a component is open: refused, and the
   message names the open components.
10. On the form component, enter a **submission count** without a checked date:
    refused. Add the date: saves. Confirm customer usage separately.

### C. Dates and history (Assigned TIS)

11. Set a **delivery date** on the solution. Then move it: without a reason it is
    refused; with a reason it saves. The first date stays shown as the original.
12. Open **History**. Each change is listed newest first, with who made it, the
    values before and after, and the reason where one was given. Nothing is missing
    from it: every change in steps 4–11 has an entry.
13. Confirm **readiness** with a reason. The suggestion beside it must not change
    the confirmed value; it is shown for comparison only.

### D. SOW review (Assigned TIS, implementation A, SOW attached)

14. Click **Set up from the signed SOW**. It reads the document and shows a set for
    review. Nothing is saved yet. Check the set against the signed document.
15. For each purchased solution, read the line about the **purchase record item**.
    A match is shown as a proposal. Clear one. Confirm one. The workspace's purchased
    scope note then shows any difference between the solutions and the deal's items.
16. Save the set. Each solution appears once. Save it again: the same names are
    reported as skipped, and nothing is duplicated.

### E. Version conflicts (two sessions on the same solution)

17. In window 1 (Assigned TIS) and window 2 (Admin), open the same solution.
18. In window 1, change its status. Save.
19. In window 2, which still shows the old version, change its priority. It must be
    refused with "This changed while you were looking at it. Reload…". Reload window
    2, make the change again: it saves, and both changes are in History.

### F. Permissions (the decisive checks)

20. **Different TIS** on implementation A: the page shows the solutions read-only.
    There are no add, edit, date or archive controls. If the controls are forced into
    view, the server still refuses the change.
21. **New TIS** on implementation A: same as step 20.
22. **Technical contributor** (`se` or `tam_se`) who owns implementation A: read-only,
    as step 20. Owning an implementation is not enough for a technical role.
23. **Manager** (Team Lead stand-in): full edit on A and B. Note whether this is the
    right level of access. The Team Lead account in §2 should show the same.
24. **Customer**: open `/solutions/<id>` directly. It must be refused, not shown.

### G. Existing purchased-service records

25. On an implementation whose deal has purchase items with no solution, the
    workspace note lists those items by name.
26. On a solution with no matching item, the note lists the solution.
27. Both lists are read-only. Confirm the deal's purchase record was not changed
    (check the deal's intake before and after).

### H. Customer 360 summary and navigation

28. The counts on the card match the workspace: solutions, purchased, open
    needed-for-go-live components, overdue, waiting.
29. A solution past its date is marked overdue on the card and in the workspace.
30. Use the breadcrumb and the card link to move between Customer 360 and the
    workspace, and back, without losing the customer.

## 6. Decisions, and what is not yet verified

**Decisions the business has not made** (the current behaviour is stated):

- **D1. Team Lead. Resolved.** Team Lead is a profile flag, separate from the
  `manager` role. It gives full post-sale authority over every implementation
  regardless of assignment, and nothing pre-sale, Salesforce, AI or system setting.
  Only an admin or super admin may grant it, and nobody may grant it to themselves.
- **D2. Who is the assigned TIS. Resolved as `implementations.owner_id`.** It is the
  authority, set by the assignment engine, a claim, or a reassignment. Journey
  templates also write `implementation_role_assignments` (role key
  `implementation_manager`), which the application never reads. Disagreements are
  listed in `implementation_owner_conflicts` (read only). Before acceptance, an admin
  reviews that list on staging and reassigns where the owner is wrong. Each change
  keeps its history.
- **D3. A technical contributor who is an owner.** Under the current rule an SE or
  TAM SE assigned as the owner does **not** get solution edit rights. Confirm that
  is the intent.
- **D4. Reading.** Any internal user can read any implementation's solutions, as
  with other Hub views. Only changes are restricted.

**Not yet covered by the owner rule.** Customer contacts and records, notes and
journal entries, attachments and uploads, technical solutions and field mappings,
creating an implementation, and the customer's own completions on the shared plan
still need only sign-in or their own link. Each needs an owner decision before it is
restricted. The full table, with who can do each and the recommendation, is in
`docs/POST-SALE-ACCESS.md`.

**Verified in this environment** (not in staging):
- Permission rules, version conflicts, history rollback, loops, all-or-nothing set
  save, and purchase-link uniqueness, against local Postgres 16 (SQL probes, 60
  assertions).
- The reconciliation, reading path and workspace logic, by unit tests.

**Not verified:**
- The browser steps in section 5. No staging backend was available here.
- The Mako Shark SOW. Its checks are written but have not been run against the
  document.
- Two live sessions racing on one row. Version conflicts were tested in sequence.

## 7. Clean-up

Delete the `QA TEST – …` deals and the customers they created. The solutions and
history on those implementations go with the implementations; do not reuse them for
another test.

## 8. Release order (for the staging database)

`0090` (PR #100) must be numbered before `0091` (PR #101) on the database it runs
against. Merge #100 first, then bring #101 up to date with `main`. If #101 lands
first, #100's migration check refuses `0090` as older than the newest migration.
