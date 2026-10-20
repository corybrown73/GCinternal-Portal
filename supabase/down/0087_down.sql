-- Reverses 0087. It only adds functions, so reversing it drops them. Nothing is
-- lost: a claim or assignment made through them has already been written to
-- portal_assignments and implementations, and those rows are records.
drop function if exists portal_inherit_pre_project_owner(uuid);
drop function if exists portal_record_assignment(uuid, uuid, int, jsonb, text, uuid, text);
drop function if exists portal_claim_deal(uuid, uuid, uuid, int, jsonb, text);
drop function if exists portal_lock_ownership(uuid);
drop function if exists portal_project_for_deal(uuid);
