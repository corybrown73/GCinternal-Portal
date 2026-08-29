-- 0017 — Harden the include_when evaluator.
--
-- Mirroring the original into TypeScript surfaced five ways a malformed
-- condition could quietly do the wrong thing. include_when decides which
-- template tasks become real work, so "quietly wrong" here means an
-- implementation silently missing work, or carrying work it should not.
--
-- Fixed, in order of how much damage each could do:
--
-- 1. An UNRECOGNISED OPERATOR constrained nothing. `{"equals": "emea"}` — a
--    plausible typo for a supported operator — passed for any present answer,
--    so a mistyped condition WIDENED scope instead of erroring. Now an unknown
--    operator fails its clause: a typo can only ever exclude, never add.
-- 2. A COMPARISON AGAINST A NON-NUMBER raised, and because the evaluator runs
--    inside instantiate_journey's loop, one bad clause in one task aborted the
--    creation of the entire journey. Now it fails that clause only.
-- 3. `exists` SWALLOWED THE REST OF ITS CLAUSE: `{"exists": true, ">": 1000}`
--    checked presence and silently dropped the comparison. Now both apply.
-- 4. A NULL BOUND passed vacuously — `{">": null}` neither failed nor
--    constrained. Now it fails, like any other unusable bound.
-- 5. `exists` was strict-true only, so `{"exists": "yes"}` quietly meant
--    "must be UNANSWERED" — the exact opposite of the author's intent. Now
--    only a real JSON boolean is accepted; anything else fails the clause.
--
-- The invariant across all five: a condition that cannot be evaluated
-- EXCLUDES its task. Unanswered questions and malformed clauses both fail
-- closed, so neither can put work on a plan that nobody asked for.
--
-- Rollback: supabase/down/0017_down.sql restores the 0014 body verbatim.

create or replace function journey_include_when_matches(cond jsonb, answers jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  qkey text;
  clause jsonb;
  answer jsonb;
  op text;
  bound jsonb;
  known_ops constant text[] := array['exists', '>', '>=', '<', '<=', 'in', 'contains'];
begin
  if cond is null or jsonb_typeof(cond) <> 'object' then
    return true;
  end if;

  for qkey, clause in select * from jsonb_each(cond) loop
    answer := answers -> qkey;

    -- A scalar clause is equality. A missing answer fails it.
    if jsonb_typeof(clause) <> 'object' then
      if answer is null or answer <> clause then return false; end if;
      continue;
    end if;

    -- Every key in an operator clause must be one we understand, so a typo
    -- cannot widen scope.
    for op in select jsonb_object_keys(clause) loop
      if not (op = any (known_ops)) then return false; end if;
    end loop;

    if clause ? 'exists' then
      bound := clause -> 'exists';
      if jsonb_typeof(bound) <> 'boolean' then return false; end if;
      if bound = 'true'::jsonb then
        if answer is null then return false; end if;
      else
        if answer is not null then return false; end if;
        -- Absence was required and confirmed; no other operator can apply.
        continue;
      end if;
    end if;

    -- Past this point every remaining operator needs a value to test.
    if answer is null then return false; end if;

    foreach op in array array['>', '>=', '<', '<='] loop
      if clause ? op then
        bound := clause -> op;
        -- Both sides must actually be numbers. Anything else fails this
        -- clause rather than raising and killing the whole instantiation.
        if jsonb_typeof(answer) <> 'number' or jsonb_typeof(bound) <> 'number' then
          return false;
        end if;
        if op = '>'  and not ((answer)::text::numeric >  (bound)::text::numeric) then return false; end if;
        if op = '>=' and not ((answer)::text::numeric >= (bound)::text::numeric) then return false; end if;
        if op = '<'  and not ((answer)::text::numeric <  (bound)::text::numeric) then return false; end if;
        if op = '<=' and not ((answer)::text::numeric <= (bound)::text::numeric) then return false; end if;
      end if;
    end loop;

    if clause ? 'in' then
      bound := clause -> 'in';
      if jsonb_typeof(bound) <> 'array' then return false; end if;
      if not (bound @> jsonb_build_array(answer)) then return false; end if;
    end if;

    if clause ? 'contains' then
      if not (answer @> (clause -> 'contains')) then return false; end if;
    end if;
  end loop;

  return true;
end;
$$;
