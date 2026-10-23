# Database migrations: the production-first procedure

Migrations are applied to production **by a person, by hand, in number order**
(Supabase SQL editor, one file per run). Nothing in this repository applies a
migration to production, and nothing should.

## What a green CI run does and does not tell you

| CI check | What it proves | What it cannot tell you |
|---|---|---|
| `Migrations up → down → up` | The migrations, their rollbacks and the SQL probes run on a database **created for that run** | Whether **production** has any of them |
| `Lint, typecheck, test, build` | The code compiles and its tests pass against fakes | Whether production's schema matches what the code reads |
| `Migration consistency` | Versions are unique, a new migration is numbered after everything on `main`, and each migration from 0087 on has a down script and a verify file | Anything about a live database |
| `Production migration gate` | A person attested, on this PR, that the migration is applied and verified in production | Nothing more: it is the attestation, not a measurement |

**The incident this exists for.** Code that filtered `implementations` on
`closed_at` merged and deployed before migration 0088 reached production. Every
read failed, and the loaders read a failed read as an empty list, so Home,
Customers and Pipeline said "no accounts". CI was green throughout, because CI's
database had the column.

## The order, every time

1. **Author** numbers the migration `max(main) + 1` (see *Numbering*), and adds
   - `supabase/migrations/NNNN_name.sql`: forward-only;
   - `supabase/down/NNNN_down.sql`: used by CI's up → down → up, not a production step;
   - `supabase/verify/NNNN_verify.sql`: one read-only `SELECT` returning
     `(migration, requirement, ok)` rows, true when the migration's objects exist;
   - a probe in `supabase/tests/` when the migration is about access or an invariant.
2. **Author** opens the PR and fills in the *Database* section of the template.
   `Migration consistency` and `Production migration gate` run for every branch,
   `claude/*` included. The gate **fails** until step 5.
3. **Someone with production access** generates the check and runs it
   **before** applying anything:
   ```
   node scripts/schema-verify.mjs --since NNNN
   ```
   Paste the output into the production SQL editor (or
   `psql "$READONLY_URL"`). It is read-only. The new migration's rows must be
   `ok = f`; that shows the check can fail.
4. They apply `supabase/migrations/NNNN_name.sql` to **production**, then run
   the same query again. **Every row must be `ok = t`.** If a probe in
   `supabase/tests/` is safe to run on production (it rolls back), run it too.
5. They add the **`production-migration-verified`** label to the PR. The gate
   re-runs and passes. If a later push changes any migration, down or verify
   file, the label is removed automatically and steps 3–5 are repeated.
6. **Only now** merge the PR. Merging deploys the code.
7. After the deploy, smoke-check: Home lists accounts, a Customer 360 opens,
   `/portal` loads for a test customer login.

If step 4 fails or the rows are not all true, **do not merge**. Fix the
migration, or roll the database back by a decision a person takes, not a script.
Rolling back code is a revert of the merge (this is how 0088 was handled).

## Checking what production actually has, before any deploy

The `supabase_migrations` table is **not** a reliable record here: migrations
are applied by hand in the SQL editor, which writes no row to it. The record of
what production has is the schema itself, so the check is a schema check:

```
node scripts/schema-verify.mjs            # every migration that has a verify file
node scripts/schema-verify.mjs --failing  # only the rows that are false
```

Run it read-only against production before a release, and after anyone applies
a migration by hand. Any `ok = f` row means production is missing something the
code expects. Verify files exist for 0083 onward; earlier migrations predate the
convention and are not covered (backfilling them is open work).

If the Supabase CLI is ever used to apply migrations,
`supabase migration list --db-url "$READONLY_URL"` shows local against remote
versions as a second signal. Do not rely on it alone.

## Numbering

* The next migration is the highest number on `main`, plus one.
* Two files must never share a number. `scripts/check-migrations.mjs` fails a
  branch that reuses a number, uses one already on `main`, or adds a number
  **below** `main`'s newest.
* Another open PR claiming the same number is a **warning** on both PRs (each
  would otherwise block the other). Whichever merges second renumbers its
  migration, down script and verify file.
* Numbers claimed by unmerged work as of this writing: 0087 (ownership claim
  rules), 0088 (implementation closure; presenter notes), 0089 (Kickoff-held
  correction). `0090` is taken by `0090_customer_contacts_internal_only.sql`.
  When those merge they renumber past `main`'s newest.

Run locally: `node scripts/check-migrations.mjs --base origin/main`.

## Branch protection (a manual setting, not something a workflow can set)

The gate only blocks a merge if GitHub is told to require it. In the repository
settings for `main`:

* Require a pull request before merging; no direct pushes.
* Require status checks: **`Migration consistency`**, **`Production migration gate`**,
  **`Lint, typecheck, test, build`**, **`Migrations up → down → up`**.
* Require review from Code Owners (`.github/CODEOWNERS` names the owners of
  `supabase/`, `.github/` and `scripts/`; confirm the handle is right).
* Keep the Auto PR workflow's guard: it never auto-merges a PR that touches
  `supabase/`, `.github/`, `scripts/` or the stage model, and it skips `claude/*`
  entirely, so a `claude/*` PR is always merged by a person.

The label is an attestation by whoever holds triage access or above; GitHub's
event log records who added it. Keep that access to people who can apply
migrations to production.

## What this does not do

* It does not apply, roll back, or connect to a production database.
* It does not detect code that reads a column no migration creates. The
  loaders' fail-loud reads (`src/lib/server/db-read.ts`) are the backstop: a
  missing column now shows "Could not load …" with the cause in the log.
* It cannot see whether the Vercel deploy and the database are in step after
  the fact. The smoke check in step 7 is that.
