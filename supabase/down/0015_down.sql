-- Down for 0015_seed_new_logo_v1.sql
--
-- Removes the backfill and the seeded template. implementation_stage_history
-- received ZERO writes from 0015, so every implementation's true stage history
-- is untouched and state restores exactly: unpinned records simply render on
-- the legacy path again.
--
-- Refuses to run if any implementation has been instantiated from this
-- template for real (as opposed to backfilled), since that would be live plan
-- data rather than derived rows.

do $$
declare
  tpl_id uuid;
  live int;
begin
  select id into tpl_id from journey_templates where key = 'new-logo' and version = 1;
  if tpl_id is null then return; end if;

  select count(*) into live from journey_instantiations where template_id = tpl_id;
  if live > 0 then
    raise exception
      '% implementation(s) were instantiated from New Logo v1: roll back 0014 first', live;
  end if;
end $$;

delete from journey_events where kind = 'backfilled';

delete from stage_instances
 where provenance in ('backfill_observed', 'backfill_inferred')
   and template_stage_id in (
     select s.id from journey_template_stages s
      join journey_templates t on t.id = s.template_id
     where t.key = 'new-logo' and t.version = 1
   );

update implementations
   set journey_template_id = null, journey_type = null, template_version = null
 where journey_template_id in (
   select id from journey_templates where key = 'new-logo' and version = 1
 );

-- Published content is frozen by trigger, so unpublish before deleting.
update journey_templates set status = 'draft'
 where key = 'new-logo' and version = 1;
delete from journey_template_stages where template_id in (
  select id from journey_templates where key = 'new-logo' and version = 1
);
delete from journey_templates where key = 'new-logo' and version = 1;

drop table if exists _backfill_0015_skipped;

-- journey_roles are referenced by role_key (a string), never by FK, so they
-- are safe to remove — but only if nothing has been assigned against them.
delete from journey_roles
 where key in ('implementation_manager', 'solutions_engineer', 'sales_owner',
               'cs_owner', 'customer_champion', 'customer_data_owner')
   and not exists (
     select 1 from implementation_role_assignments a where a.role_key = journey_roles.key
   );
