## Summary

<!-- What changed and why. -->

## Database

- [ ] This PR has **no** migration, and no code that needs one not already in production.
- [ ] This PR **has** a migration. Fill in the rest:
  - **Migration:** `supabase/migrations/NNNN_….sql` (with `supabase/down/NNNN_down.sql` and `supabase/verify/NNNN_verify.sql`)
  - **Code that depends on it:**
  - **Deployment order:** 1. apply the migration to production; 2. run `node scripts/schema-verify.mjs --since NNNN` there, every row `ok = t`; 3. add the `production-migration-verified` label; 4. merge.

Green CI is not confirmation that production has the migration; CI replays migrations on a scratch database. See `docs/MIGRATIONS.md`.

## Testing

<!-- Tests run, and anything that could not be run. -->
