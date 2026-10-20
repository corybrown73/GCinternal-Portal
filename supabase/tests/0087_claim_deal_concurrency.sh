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
ALL_DEALS="'$D1','$D5','$D2','$D6','$D7','$D8','$D9'"
ALL_IMPLS="'$I2','$I6','$I7','$I8','$I9'"
ALL_TMS="'$ADA','$BEN','$CY'"
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
insert into portal_assignment_pool (team_member_id, active) values ('$ADA', true), ('$BEN', true), ('$CY', true);
insert into portal_accounts (id, name, customer_id) values
  ('$D1', 'C1 $TAG', '$CUST'), ('$D5', 'C5 $TAG', '$CUST'), ('$D2', 'C2 $TAG', '$CUST'),
  ('$D6', 'C6 $TAG', '$CUST'), ('$D7', 'C7 $TAG', '$CUST'), ('$D8', 'C8 $TAG', '$CUST'),
  ('$D9', 'C9 $TAG', '$CUST');
insert into implementations (id, deal_id, customer_id, name, current_stage, owner_id) values
  ('$I2', '$D2', '$CUST', 'P2', 'closed_won', null),
  ('$I6', '$D6', '$CUST', 'P6', 'closed_won', null),
  ('$I7', '$D7', '$CUST', 'P7', 'closed_won', null);
insert into portal_app_config (key, value) values ('assignment_rules', '$RULES')
  on conflict (key) do update set value = excluded.value;
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
session s3b 1 "begin; select portal_record_assignment('$D6', '$CY', 1, '{}', 'manual', '$MGR_P', 'Reassigned by a manager'); commit;"
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
session s3c 0 "begin; select portal_record_assignment('$D7', '$CY', 1, '{}', 'manual', '$MGR_P', 'Assigned by a manager'); select pg_sleep(3); commit;"
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

echo "PASS: all overlapping-session scenarios"
