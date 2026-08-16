#!/usr/bin/env bash
# Verifies the loan-lifecycle database guards (trigger + rpc functions) against
# a live Supabase/Postgres database. Everything runs inside one transaction
# that is ROLLED BACK at the end — no data is written.
#
# Usage:
#   npm run verify:loans
#
# Reads POSTGRES_URL_NON_POOLING from .env.local (like the other db: scripts).
set -euo pipefail
cd "$(dirname "$0")/.."

PGURL=$(grep -E '^POSTGRES_URL_NON_POOLING=' .env.local | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$PGURL" ]; then
  echo "POSTGRES_URL_NON_POOLING not found in .env.local" >&2
  exit 1
fi

psql "$PGURL" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;

-- fixtures
INSERT INTO books (id, title, author, isbn, genre, total_copies, available_copies, published_year)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'Verify Book', 'T', 'VERIFY-1', 'test', 1, 1, 2026),
       ('00000000-0000-0000-0000-0000000000a4', 'Cap Book', 'T', 'VERIFY-2', 'test', 6, 6, 2026),
       ('00000000-0000-0000-0000-0000000000a5', 'Overdue Book', 'T', 'VERIFY-3', 'test', 1, 1, 2026);
INSERT INTO members (id, name, email, phone, member_type, student_id, grade, active)
VALUES ('00000000-0000-0000-0000-0000000000a2', 'Member A', 'va@test.local', '1', 'student', 'VSA', 'G10', true),
       ('00000000-0000-0000-0000-0000000000a3', 'Member B', 'vb@test.local', '2', 'student', 'VSB', 'G10', true);

-- checkout: first succeeds
CREATE TEMP TABLE t_ok AS
  SELECT id FROM checkout_loan('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 14);

-- oversell: second checkout of the last copy must be rejected
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM checkout_loan('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 14);
  EXCEPTION WHEN OTHERS THEN
    ok := (SQLERRM = 'No copies available.');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: oversell not rejected'; END IF;
END $$;

-- 3-cap: three loans then the fourth must be rejected
SELECT checkout_loan('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a3', 7);
SELECT checkout_loan('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a3', 7);
SELECT checkout_loan('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a3', 7);
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM checkout_loan('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a3', 7);
  EXCEPTION WHEN OTHERS THEN
    ok := (SQLERRM = 'Member already has the maximum of 3 active loans.');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: 3-loan cap not enforced'; END IF;
END $$;

-- return + duplicate return
SELECT return_loan((SELECT id FROM t_ok));
DO $$
DECLARE v uuid; ok boolean := false;
BEGIN
  SELECT id INTO v FROM t_ok;
  BEGIN
    PERFORM return_loan(v);
  EXCEPTION WHEN OTHERS THEN
    ok := (SQLERRM = 'Loan already returned.');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: duplicate return not rejected'; END IF;
END $$;

-- renew after return must be rejected
DO $$
DECLARE v uuid; ok boolean := false;
BEGIN
  SELECT id INTO v FROM t_ok;
  BEGIN
    PERFORM renew_loan(v, 14);
  EXCEPTION WHEN OTHERS THEN
    ok := (SQLERRM = 'Cannot renew a returned loan.');
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: renew after return not rejected'; END IF;
END $$;

-- sweep: one alert per loan; second run dedupes
INSERT INTO loans (book_id, member_id, borrowed_at, due_at, returned_at, status)
VALUES ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a2',
        now() - interval '30 days', now() - interval '20 days', null, 'active');
DO $$
DECLARE r1 record; r2 record;
BEGIN
  SELECT * INTO r1 FROM sweep_loan_statuses();
  IF r1.marked_overdue < 1 OR r1.overdue_alerts < 1 THEN
    RAISE EXCEPTION 'FAIL: sweep did not stamp/alert (%, %)', r1.marked_overdue, r1.overdue_alerts;
  END IF;
  SELECT * INTO r2 FROM sweep_loan_statuses();
  IF r2.overdue_alerts <> 0 THEN
    RAISE EXCEPTION 'FAIL: duplicate overdue alert (run2 = %)', r2.overdue_alerts;
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL LOAN GUARD TESTS PASSED (rolled back, no data written)' AS result;
SQL
