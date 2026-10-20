#!/bin/bash
# Overlapping-session proof for the transactional claiming functions (0087).
# Each actor is its own psql process, so the operations really overlap in the
# database. A holder keeps its transaction open with pg_sleep after its call, so
# the row locks it took are still held when the other actor arrives. Fixtures are
# committed, and removed on exit.
#
#   DB_CMD is the psql command, for example
#   "sudo -n -u postgres psql -X -q -At -v ON_ERROR_STOP=1 -d gc_test".
set -u
DB_CMD=${DB_CMD:-"psql -X -q -At -v ON_ERROR_STOP=1 -d gc_test"}
TAG="conc87-$$"
DOM="gocanvas.com"
fail() { echo "FAIL: $*"; exit 1; }

# Fixed ids for this run. Emails carry the run tag, so reruns never collide.
CUST=00000000-0000-4000-8000-0000000c8001
ADA=00000000-0000-4000-8000-0000000a8001
BEN=00000000-0000-4000-8000-0000000a8002
CY=00000000-0000-4000-8000-0000000a8003
MGR=00000000-0000-4000-8000-0000000a8004
ADA_P=00000000-0000-4000-8000-0000000f8001
BEN_P=00000000-0000-4000-8000-0000000f8002
CY_P=00000000-0000-4000-8000-0000000f8003
MGR_P=00000000-0000-4000-8000-0000000f8004
D1=00000000-0000-4000-8000-0000000d8101   # 2-way claim, pre-project
D5=00000000-0000-4000-8000-0000000d8105   # 4-way claim, pre-project
D2=00000000-0000-4000-8000-0000000d8201   # 2-way claim, with project
I2=00000000-0000-4000-8000-0000000e8201
D6=00000000-0000-4000-8000-0000000d8206   # claim, then manager
I6=00000000-0000-4000-8000-0000000e8206
D7=00000000-0000-4000-8000-0000000d8207   # manager, then claim
I7=00000000-0000-4000-8000-0000000e8207
D8=00000000-0000-4000-8000-0000000d8208   # pre-project claim, then project created
I8=00000000-0000-4000-8000-0000000e8208
D9=00000000-0000-4000-8000-0000000d8209   # claim races an uncommitted project
I9=00000000-0000-4000-8000-0000000e8209
GUS=00000000-0000-4000-8000-0000000a8005   # in the pool, no login: can be removed
HAL=00000000-0000-4000-8000-0000000a8006   # removal first, then an assignment
D10=00000000-0000-4000-8000-0000000d8210   # assignment to Gus races his removal
D11=00000000-0000-4000-8000-0000000d8211   # a clear races a claim
I11=00000000-0000-4000-8000-0000000e8211
D12=00000000-0000-4000-8000-0000000d8212   # a stale expected owner
I12=00000000-0000-4000-8000-0000000e8212
ALL_DEALS="'$D1','$D5','$D2','$D6','$D7','$D8','$D9','$D10','$D11','$D12'"
ALL_IMPLS="'$I2','$I6','$I7','$I8','$I9','$I11','$I12'"
ALL_TMS="'$ADA','$BEN','$CY','$GUS','$HAL'"
ALL_PROFILES="'$ADA_P','$BEN_P','$CY_P','$MGR_P'"

cleanup() {
  $DB_CMD -c "delete from portal_assignments where deal_id in ($ALL_DEALS);" >/dev/null 2>&1
  $DB_CMD -c "delete from implementations where id in ($ALL_IMPLS);" >/dev/null 2>&1
  $DB_CMD -c "delete from portal_accounts where id in ($ALL_DEALS);" >/dev/null 2>&1
  $DB_CMD -c "delete from portal_assignment_pool where team_member_id in ($ALL_TMS);" >/dev/null 2>&1
  $DB_CMD -c "delete from team_members where id in ($ALL_TMS);" >/dev/null 2>&1
  $DB_CMD -c "delete from portal_app_config where key = 'assignment_rules' and value->>'concurrency_probe' = 'true';" >/dev/null 2>&1
  $DB_CMD -c "delete from customers where id = '$CUST';" >/dev/null 2>&1
  $DB_CMD -c "delete from auth.users where id in ($ALL_PROFILES);" >/dev/null 2>&1
}
# The history is append-only, so a rerun on the same database would find the owners
# of the last run. Run it on a freshly built database (bash apply.sh).
FRESH=$($DB_CMD -c "select count(*) from implementation_owner_history where deal_id in ($ALL_DEALS);" 2>/dev/null)
[ "${FRESH:-0}" = 0 ] || fail "this database already holds the history of an earlier run; rebuild it first (bash /tmp/claude-0/apply.sh)"
cleanup
trap cleanup EXIT

RULES='{"mode":"claim","window_days":90,"base_points":1,"service_points":1,"arr_bands":[],"seat_bands":[],"integration_points":{},"concurrency_probe":"true"}'

# Committed fixtures.
$DB_CMD -c "
insert into customers (id, name) values ('$CUST', 'Probe customer $TAG');
insert into auth.users (id, email) values
  ('$ADA_P', 'ada.$TAG@$DOM'), ('$BEN_P', 'ben.$TAG@$DOM'),
  ('$CY_P', 'cy.$TAG@$DOM'), ('$MGR_P', 'mgr.$TAG@$DOM');
insert into team_members (id, name, email, role, active) values
  ('$ADA', 'Ada', 'ada.$TAG@$DOM', 'am', true),
  ('$BEN', 'Ben', 'ben.$TAG@$DOM', 'se', true),
  ('$CY', 'Cy', 'cy.$TAG@$DOM', 'se', true);
insert into team_members (id, name, email, role, active) values
  ('$GUS', 'Gus', 'gus.$TAG@$DOM', 'se', true), ('$HAL', 'Hal', 'hal.$TAG@$DOM', 'se', true);
insert into portal_assignment_pool (team_member_id, active) values
  ('$ADA', true), ('$BEN', true), ('$CY', true), ('$GUS', true), ('$HAL', true);
insert into portal_accounts (id, name, customer_id) values
  ('$D1', 'C1 $TAG', '$CUST'), ('$D5', 'C5 $TAG', '$CUST'), ('$D2', 'C2 $TAG', '$CUST'),
  ('$D6', 'C6 $TAG', '$CUST'), ('$D7', 'C7 $TAG', '$CUST'), ('$D8', 'C8 $TAG', '$CUST'),
  ('$D9', 'C9 $TAG', '$CUST'), ('$D10', 'C10 $TAG', '$CUST'), ('$D11', 'C11 $TAG', '$CUST'),
  ('$D12', 'C12 $TAG', '$CUST');
-- The fixture owner of I11 is written under a fixture context, which the history records.
select portal_owner_context(null, 'system', 'rule_assignment', 'probe fixture');
insert into implementations (id, deal_id, customer_id, name, current_stage, owner_id) values
  ('$I2', '$D2', '$CUST', 'P2', 'closed_won', null),
  ('$I6', '$D6', '$CUST', 'P6', 'closed_won', null),
  ('$I7', '$D7', '$CUST', 'P7', 'closed_won', null),
  ('$I11', '$D11', '$CUST', 'P11', 'closed_won', '$BEN'),
  ('$I12', '$D12', '$CUST', 'P12', 'closed_won', null);
select set_config('portal.owner_change', '', true);
-- Only a manager may assign or remove. The first signup in a database is an admin,
-- so the manager's role is set explicitly, with the role guard off for this statement.
alter table portal_profiles disable trigger portal_profiles_role_guard;
update portal_profiles set role = 'manager' where id = '$MGR_P';
alter table portal_profiles enable trigger portal_profiles_role_guard;
insert into portal_app_config (key, value) values ('assignment_rules', '$RULES')
  on conflict (key) do update set value = excluded.value;
update portal_app_config set value = '{\"mode\":\"enforce\"}' where key = 'owner_guard';
" >/dev/null || fail "could not commit fixtures"

# A session runs a SQL script in its own psql process, starting after $2 seconds.
# Output goes to a file named by the session, so the outcome can be read afterwards.
session() {
  local name=$1 delay=$2 sql=$3
  ( sleep "$delay"; printf '%s\n' "$sql" | $DB_CMD >"/tmp/${TAG}-${name}.out" 2>&1; echo "exit=$?" >>"/tmp/${TAG}-${name}.out" ) &
}
outcome() { # 'ok' when the session committed, else the refusal text
  if grep -q "^exit=0" "/tmp/${TAG}-$1.out"; then echo ok; else grep -o "ERROR:.*" "/tmp/${TAG}-$1.out" | head -1; fi
}
claim_sql() { # deal, team member, profile, note
  echo "select portal_claim_deal('$1', '$2', '$3', 1, '{}', '$4');"
}

# ---------------------------------------------------------------------------
# S1. Two people claim the same pre-project deal at once. Ada holds it 3s.
session s1a 0 "begin; $(claim_sql $D1 $ADA $ADA_P claim-ada); select pg_sleep(3); commit;"
session s1b 1 "begin; $(claim_sql $D1 $BEN $BEN_P claim-ben); commit;"
wait
A=$(outcome s1a); B=$(outcome s1b)
echo "S1 pre-project, two claimants: Ada=$A | Ben=$B"
[ "$A" = ok ] || fail "the first claimant was refused: $A"
echo "$B" | grep -q "already_owned" || fail "the second claimant was not refused as already owned: $B"
N=$($DB_CMD -c "select count(*) from portal_assignments where deal_id='$D1';")
[ "$N" = 1 ] || fail "two claims on one pre-project deal wrote $N records"
echo "PASS: two claimants on a pre-project deal: one succeeded, one was refused, one record"

# ---------------------------------------------------------------------------
# S1b. Four people claim the same pre-project deal together.
session s1c_1 0 "$(claim_sql $D5 $ADA $ADA_P c1)"
session s1c_2 0 "$(claim_sql $D5 $BEN $BEN_P c2)"
session s1c_3 0 "$(claim_sql $D5 $CY $CY_P c3)"
session s1c_4 0 "$(claim_sql $D5 $ADA $ADA_P c4)"
wait
WINS=0
for s in s1c_1 s1c_2 s1c_3 s1c_4; do [ "$(outcome $s)" = ok ] && WINS=$((WINS+1)); done
N=$($DB_CMD -c "select count(*) from portal_assignments where deal_id='$D5';")
echo "S1b pre-project, four claimants: successes=$WINS records=$N"
[ "$WINS" = 1 ] || fail "$WINS of four concurrent claims succeeded, expected exactly one"
[ "$N" = 1 ] || fail "four concurrent claims wrote $N records, expected one"
echo "PASS: four concurrent claims on a pre-project deal: exactly one succeeded and one record was written"

# ---------------------------------------------------------------------------
# S2. Two people claim a deal whose project has no owner. Ada holds it 3s.
session s2a 0 "begin; $(claim_sql $D2 $ADA $ADA_P claim-ada); select pg_sleep(3); commit;"
session s2b 1 "begin; $(claim_sql $D2 $BEN $BEN_P claim-ben); commit;"
wait
A=$(outcome s2a); B=$(outcome s2b)
echo "S2 with project, two claimants: Ada=$A | Ben=$B"
[ "$A" = ok ] || fail "the first claimant was refused: $A"
echo "$B" | grep -q "already_owned" || fail "the second claimant was not refused: $B"
OWNER=$($DB_CMD -c "select owner_id from implementations where id='$I2';")
NEWEST=$($DB_CMD -c "select team_member_id from portal_assignments where deal_id='$D2' order by created_at desc limit 1;")
[ "$OWNER" = "$ADA" ] || fail "the project owner is $OWNER, not the first claimant"
[ "$OWNER" = "$NEWEST" ] || fail "the project owner and the newest record disagree"
echo "PASS: two claimants on a project: one owner, and the owner matches the newest record"

# ---------------------------------------------------------------------------
# S3. A manager assigns while someone claims. Ada's claim holds the project 3s;
#     the manager's assignment waits, then replaces the owner under the same lock.
session s3a 0 "begin; $(claim_sql $D6 $ADA $ADA_P claim-ada); select pg_sleep(3); commit;"
session s3b 1 "begin; select portal_record_assignment('$D6', '$CY', 1, '{}', 'manual', '$MGR_P', 'Reassigned by a manager', 'manager', 'user'); commit;"
wait
A=$(outcome s3a); B=$(outcome s3b)
echo "S3 claim then manager: claim=$A | manager=$B"
[ "$A" = ok ] || fail "the claim was refused: $A"
[ "$B" = ok ] || fail "the manager's assignment was refused: $B"
OWNER=$($DB_CMD -c "select owner_id from implementations where id='$I6';")
NEWEST=$($DB_CMD -c "select team_member_id from portal_assignments where deal_id='$D6' order by created_at desc limit 1;")
[ "$OWNER" = "$CY" ] || fail "the manager's assignment did not stand: owner is $OWNER"
[ "$OWNER" = "$NEWEST" ] || fail "the owner and the newest record disagree after the manager's assignment"
echo "PASS: a manager assigning during a claim ends with the manager as owner, and the record agrees"

# S3b. The other order: a manager holds the project, and the claim waits, then is refused.
session s3c 0 "begin; select portal_record_assignment('$D7', '$CY', 1, '{}', 'manual', '$MGR_P', 'Assigned by a manager', 'manager', 'user'); select pg_sleep(3); commit;"
session s3d 1 "begin; $(claim_sql $D7 $BEN $BEN_P claim-ben); commit;"
wait
A=$(outcome s3c); B=$(outcome s3d)
echo "S3b manager then claim: manager=$A | claim=$B"
[ "$A" = ok ] || fail "the manager's assignment was refused: $A"
echo "$B" | grep -q "already_owned" || fail "a claim over a manager's assignment was not refused: $B"
OWNER=$($DB_CMD -c "select owner_id from implementations where id='$I7';")
[ "$OWNER" = "$CY" ] || fail "a claim overwrote the manager's assignment: owner is $OWNER"
echo "PASS: a claim cannot overwrite a manager's assignment made while it waited"

# ---------------------------------------------------------------------------
# S4. A project is created for a deal while a pre-project claim is open. The
#     claim holds the deal 3s; creating the project waits on the deal, then the
#     inheritance runs under the same locks and copies the claimant as owner.
session s4a 0 "begin; $(claim_sql $D8 $ADA $ADA_P claim-ada); select pg_sleep(3); commit;"
session s4b 1 "begin; insert into implementations (id, deal_id, customer_id, name, current_stage) values ('$I8', '$D8', '$CUST', 'P8', 'closed_won'); select portal_inherit_pre_project_owner('$I8'); commit;"
wait
A=$(outcome s4a); B=$(outcome s4b)
echo "S4 claim then project creation: claim=$A | project=$B"
[ "$A" = ok ] || fail "the pre-project claim was refused: $A"
[ "$B" = ok ] || fail "creating the project failed: $B"
OWNER=$($DB_CMD -c "select owner_id from implementations where id='$I8';")
[ "$OWNER" = "$ADA" ] || fail "the new project did not inherit the claimant: owner is $OWNER"
echo "PASS: a project created during a pre-project claim inherits the claimant, once"

# ---------------------------------------------------------------------------
# S5. A claim races a project whose creation has not committed. The claim cannot
#     see the project yet, waits on the deal, and once the project commits it
#     asks to be retried rather than lock the project out of order.
session s5a 0 "begin; insert into implementations (id, deal_id, customer_id, name, current_stage) values ('$I9', '$D9', '$CUST', 'P9', 'closed_won'); select pg_sleep(3); commit;"
session s5b 1 "begin; $(claim_sql $D9 $BEN $BEN_P claim-ben); commit;"
wait
A=$(outcome s5a); B=$(outcome s5b)
echo "S5 claim races an uncommitted project: project=$A | claim=$B"
[ "$A" = ok ] || fail "the project creation failed: $A"
echo "$B" | grep -q "ownership_retry" || fail "the claim did not ask for a retry: $B"
N=$($DB_CMD -c "select count(*) from portal_assignments where deal_id='$D9';")
[ "$N" = 0 ] || fail "the refused claim wrote $N records"
echo "PASS: a claim that races a project being created is refused for retry, and writes nothing"

# ---------------------------------------------------------------------------
# S6. A manager assigns Gus to a deal while a manager removes Gus. Gus has no login,
#     so the removal is allowed unless it sees the assignment. Whichever commits
#     first, the other is refused: never both.
session s6a 0 "begin; select portal_record_assignment('$D10', '$GUS', 1, '{}', 'manual', '$MGR_P', 'Chosen by hand', 'manager', 'user'); select pg_sleep(3); commit;"
session s6b 1 "begin; select portal_deactivate_team_member('$GUS', '$MGR_P'); commit;"
wait
A=$(outcome s6a); B=$(outcome s6b)
echo "S6 assign to Gus races his removal: assign=$A | remove=$B"
if [ "$A" = ok ] && [ "$B" = ok ]; then fail "Gus was assigned and removed at once: an owner who is not on the team"; fi
if [ "$A" != ok ] && [ "$B" != ok ]; then fail "neither the assignment nor the removal went through: $A | $B"; fi
GUS_ACTIVE=$($DB_CMD -c "select active from team_members where id='$GUS';")
if [ "$A" = ok ]; then
  echo "$B" | grep -q "still owns" || fail "the removal did not see the assignment: $B"
  [ "$GUS_ACTIVE" = t ] || fail "Gus was removed although he owns a deal"
else
  echo "$A" | grep -q "not on the team" || fail "the assignment was refused for the wrong reason: $A"
  [ "$GUS_ACTIVE" = f ] || fail "the removal did not stand"
fi
echo "PASS: an assignment and a removal of the same person never both succeed"

# S6c. The other order: a removal holds Hal 3s; an assignment to Hal arrives during it.
session s6c 0 "begin; select portal_deactivate_team_member('$HAL', '$MGR_P'); select pg_sleep(3); commit;"
session s6d 1 "begin; select portal_record_assignment('$D10', '$HAL', 1, '{}', 'manual', '$MGR_P', 'Chosen by hand', 'manager', 'user'); commit;"
wait
A=$(outcome s6c); B=$(outcome s6d)
echo "S6c removal races an assignment to the same person: remove=$A | assign=$B"
[ "$A" = ok ] || fail "the removal of Hal, who owns nothing, was refused: $A"
echo "$B" | grep -q "not on the team" || fail "an assignment to a removed person was not refused: $B"
N=$($DB_CMD -c "select count(*) from portal_assignments where team_member_id='$HAL';")
[ "$N" = 0 ] || fail "the refused assignment wrote $N records"
echo "PASS: an assignment that arrives during a removal is refused, and writes nothing"

# ---------------------------------------------------------------------------
# S7. A manager clears Ben's project while Ada claims it. The claim waits for the
#     clear, then sees no owner and takes it. Both are recorded, in order.
session s7a 0 "begin; select portal_set_implementation_owner('$I11', null, '$MGR_P', 'Cleared for review', true, '$BEN'); select pg_sleep(3); commit;"
session s7b 1 "begin; $(claim_sql $D11 $ADA $ADA_P claim-ada-after-clear); commit;"
wait
A=$(outcome s7a); B=$(outcome s7b)
echo "S7 clear races a claim: clear=$A | claim=$B"
[ "$A" = ok ] || fail "the clear was refused: $A"
[ "$B" = ok ] || fail "the claim after the clear was refused: $B"
OWNER=$($DB_CMD -c "select owner_id from implementations where id='$I11';")
[ "$OWNER" = "$ADA" ] || fail "the owner after the clear and the claim is $OWNER, not Ada"
LAST=$($DB_CMD -c "select new_owner_id from implementation_owner_history where implementation_id='$I11' order by seq desc limit 1;")
[ "$LAST" = "$ADA" ] || fail "the history's newest owner disagrees with the project: $LAST"
CLEARS=$($DB_CMD -c "select count(*) from implementation_owner_history where implementation_id='$I11' and source='clear' and new_owner_id is null;")
[ "$CLEARS" = 1 ] || fail "the clear wrote $CLEARS history rows, expected one"
echo "PASS: a clear and a claim on one project serialise, and the history records both in order"

# ---------------------------------------------------------------------------
# S8. A manager assigns an unowned project, having seen it unowned, while Ada claims
#     it. The claim lands first; the manager's expected owner no longer matches, so
#     the manager is refused rather than overwriting the claim.
session s8a 0 "begin; $(claim_sql $D12 $ADA $ADA_P claim-ada-first); select pg_sleep(3); commit;"
session s8b 1 "begin; select portal_set_implementation_owner('$I12', '$CY', '$MGR_P', 'Assigned by a manager', true, null); commit;"
wait
A=$(outcome s8a); B=$(outcome s8b)
echo "S8 manager with a stale view races a claim: claim=$A | manager=$B"
[ "$A" = ok ] || fail "the claim was refused: $A"
echo "$B" | grep -q "owner_changed" || fail "the manager overwrote the claim, or was refused for the wrong reason: $B"
OWNER=$($DB_CMD -c "select owner_id from implementations where id='$I12';")
[ "$OWNER" = "$ADA" ] || fail "the claim was overwritten: owner is $OWNER"
echo "PASS: a manager acting on a stale view cannot overwrite a claim that landed first"

echo "PASS: all overlapping-session scenarios"
