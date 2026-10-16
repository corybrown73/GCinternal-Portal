-- Reverses 0089. The function owns no data: the corrections it made are in the
-- stage history and the audit log, which are kept.
drop function if exists public.portal_correct_kickoff_held(
  uuid, portal_account_stage, jsonb, uuid, text, integer);
