-- Postgres cannot drop a value from an enum. The value stays, unreachable
-- in practice: nothing in the application moves an account's stage except
-- through the checklist (src/lib/stage-flow.server.ts), which only ever
-- names a stage already in STAGES — adding the enum value here does not by
-- itself move any existing account.
select 1;
