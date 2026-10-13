#!/bin/bash
# Two-session proof that concurrent workers cannot claim the same notice,
# including a notice whose lease has expired. Runs against a database with
# migration 0084 applied. Each worker is its own psql process, so the claims
# really overlap in the database. Fixture rows are committed, then removed.
#
#   DB_CMD is the psql command, for example "sudo -n -u postgres psql -X -q -At -v ON_ERROR_STOP=1 -d gc_test".
set -u
DB_CMD=${DB_CMD:-"psql -X -q -At -v ON_ERROR_STOP=1 -d gc_test"}
TAG="conc-$$"
fail() { echo "FAIL: $*"; exit 1; }

cleanup() {
  $DB_CMD -c "delete from notification_outbox where dedupe_key like '${TAG}%';" >/dev/null 2>&1
}
trap cleanup EXIT

# Two committed fixtures: E is abandoned (its lease lapsed in the past), D is due.
$DB_CMD -c "
insert into notification_outbox (dedupe_key, kind, recipient, subject, html, status, attempts, next_attempt_at, claimed_until, claim_token)
values
  ('${TAG}-E', 'assignment', 'e@example.test', 's', 'h', 'queued', 1, now() - interval '1 hour',
     now() - interval '1 second', gen_random_uuid()),
  ('${TAG}-D', 'assignment', 'd@example.test', 's', 'h', 'queued', 0, now() - interval '1 hour', null, null);
" || fail "could not commit fixtures"

# Worker A: claims the oldest due notice, then holds its transaction open for 3s.
# Worker B: starts 1s later and claims with no limit, while A still holds its lock.
( $DB_CMD <<SQL > /tmp/${TAG}-a.out 2>&1
begin;
select recipient || '|' || attempts || '|' || claim_token from claim_notices(1, 300);
select pg_sleep(3);
commit;
SQL
) &
PID_A=$!
sleep 1
( $DB_CMD <<SQL > /tmp/${TAG}-b.out 2>&1
begin;
select recipient || '|' || attempts || '|' || claim_token from claim_notices(10, 300);
commit;
SQL
) &
PID_B=$!
wait $PID_A; wait $PID_B

A=$(grep '|' /tmp/${TAG}-a.out | head -1)
B=$(grep '|' /tmp/${TAG}-b.out | head -1)
echo "worker A claimed: ${A:-nothing}"
echo "worker B claimed: ${B:-nothing}"

# Each notice is claimed at most once across the two workers.
recip() { echo "$1" | cut -d'|' -f1; }
if [ -n "$A" ] && [ -n "$B" ] && [ "$(recip "$A")" = "$(recip "$B")" ]; then
  fail "both workers claimed the same notice: $(recip "$A")"
fi
# The expired-lease notice E went to exactly one worker, and was counted once more.
CLAIMS_E=$( (echo "$A"; echo "$B") | grep -c 'e@example.test' || true )
[ "$CLAIMS_E" -le 1 ] || fail "the expired-lease notice was claimed by $CLAIMS_E workers"

# Afterwards: E was claimed exactly once (its attempts went 1 -> 2), D exactly once (0 -> 1).
ATT_E=$($DB_CMD -c "select attempts from notification_outbox where dedupe_key='${TAG}-E';")
ATT_D=$($DB_CMD -c "select attempts from notification_outbox where dedupe_key='${TAG}-D';")
echo "attempts after the race: E=$ATT_E D=$ATT_D"
[ "$ATT_E" = "2" ] || fail "the expired-lease notice E was claimed $((ATT_E-1)) times, expected 1"
[ "$ATT_D" = "1" ] || fail "the due notice D was claimed $ATT_D times, expected 1"

# A's finish uses A's own token: accepted. A stale token from the race: refused.
TOKEN_A=$(echo "$A" | cut -d'|' -f3)
if [ -n "$TOKEN_A" ]; then
  OK=$($DB_CMD -c "select finish_notice((select id from notification_outbox where dedupe_key like '${TAG}%' and claim_token = '${TOKEN_A}'::uuid), '${TOKEN_A}'::uuid, 'sent', null, null);")
  [ "$OK" = "t" ] || fail "the holder could not finish its own claim"
fi
STALE=$($DB_CMD -c "select finish_notice((select id from notification_outbox where dedupe_key='${TAG}-E'), gen_random_uuid(), 'sent', null, null);")
[ "$STALE" = "f" ] || fail "a finish with a token that holds no claim was accepted"

echo "PASS: two concurrent sessions cannot claim the same notice, including an expired lease"

# Scenario 2: ONE expired-lease notice, contended. Worker A claims it and holds
# its transaction open. B starts while A holds the row, and C starts after A
# has committed. Only A may get it: B is blocked by the row lock (SKIP LOCKED
# skips it), and C finds a live lease.
$DB_CMD -c "delete from notification_outbox where dedupe_key like '${TAG}%';" >/dev/null
$DB_CMD -c "
insert into notification_outbox (dedupe_key, kind, recipient, subject, html, status, attempts, next_attempt_at, claimed_until, claim_token)
values ('${TAG}-X', 'assignment', 'x@example.test', 's', 'h', 'queued', 1, now() - interval '1 hour',
        now() - interval '1 second', gen_random_uuid());" || fail "could not commit the contended fixture"

( $DB_CMD <<SQL > /tmp/${TAG}-xa.out 2>&1
begin;
select recipient || '|' || attempts || '|' || claim_token from claim_notices(1, 300);
select pg_sleep(3);
commit;
SQL
) &
PID_XA=$!
sleep 1
( $DB_CMD <<SQL > /tmp/${TAG}-xb.out 2>&1
begin;
select recipient || '|' || attempts || '|' || claim_token from claim_notices(1, 300);
commit;
SQL
) &
PID_XB=$!
wait $PID_XB
( $DB_CMD <<SQL > /tmp/${TAG}-xc.out 2>&1
begin;
select recipient || '|' || attempts || '|' || claim_token from claim_notices(1, 300);
commit;
SQL
) &
PID_XC=$!
wait $PID_XA; wait $PID_XC

XA=$(grep '|' /tmp/${TAG}-xa.out | head -1)
XB=$(grep '|' /tmp/${TAG}-xb.out | head -1)
XC=$(grep '|' /tmp/${TAG}-xc.out | head -1)
echo "contended: A=${XA:-nothing} B=${XB:-nothing} C=${XC:-nothing}"
[ -n "$XA" ] || fail "the holder of the expired lease did not claim it"
[ -z "$XB" ] || fail "a worker started while the row was locked claimed the same notice"
[ -z "$XC" ] || fail "a worker started after the claim committed claimed a notice with a live lease"
ATT_X=$($DB_CMD -c "select attempts from notification_outbox where dedupe_key='${TAG}-X';")
[ "$ATT_X" = "2" ] || fail "the contended notice was claimed $((ATT_X-1)) times, expected 1"
echo "PASS: one expired-lease notice, contended by two sessions, was claimed exactly once"
