-- Down for 0017_include_when_hardening.sql — restores the 0014 body verbatim.
--
-- Note what reverting reinstates: an unrecognised operator constrains nothing
-- (so a typo widens scope), a non-numeric comparison raises and aborts the
-- whole instantiation, `exists` swallows the rest of its clause, and a null
-- bound passes vacuously. Only revert alongside the TypeScript mirror.
create or replace function journey_include_when_matches(cond jsonb, answers jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  qkey text;
  clause jsonb;
  answer jsonb;
begin
  if cond is null or jsonb_typeof(cond) <> 'object' then
    return true;
  end if;

  for qkey, clause in select * from jsonb_each(cond) loop
    answer := answers -> qkey;

    if jsonb_typeof(clause) = 'object' and clause ? 'exists' then
      if (clause -> 'exists') = 'true'::jsonb then
        if answer is null then return false; end if;
      else
        if answer is not null then return false; end if;
      end if;
      continue;
    end if;

    if answer is null then return false; end if;

    if jsonb_typeof(clause) <> 'object' then
      if answer <> clause then return false; end if;
      continue;
    end if;

    if clause ? '>' and not ((answer)::text::numeric > (clause ->> '>')::numeric) then
      return false;
    end if;
    if clause ? '>=' and not ((answer)::text::numeric >= (clause ->> '>=')::numeric) then
      return false;
    end if;
    if clause ? '<' and not ((answer)::text::numeric < (clause ->> '<')::numeric) then
      return false;
    end if;
    if clause ? '<=' and not ((answer)::text::numeric <= (clause ->> '<=')::numeric) then
      return false;
    end if;
    if clause ? 'in' and not (clause -> 'in') @> jsonb_build_array(answer) then
      return false;
    end if;
    if clause ? 'contains' and not (answer @> (clause -> 'contains')) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;
