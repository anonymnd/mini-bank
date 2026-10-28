"""Integration proofs against compiled COBOL/C and actual SQLite transactions."""
import concurrent.futures
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / "build" / "minibank"


def record(reference, source="ACC00001", destination="ACC00002", amount="000000100.00"):
    return f"{reference:<24}{source}{destination}{amount}\n"


class MiniBankTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.db = self.directory / "bank.db"
        self.run_app("init")

    def run_app(self, *args, code=0, input=None, env=None):
        process = subprocess.run(
            [str(EXE), "--db", str(self.db), *args],
            input=input, text=True, capture_output=True, timeout=20,
            env={**os.environ, **(env or {})},
        )
        self.assertEqual(process.returncode, code, process.stdout + process.stderr)
        return process.stdout

    def sql(self, query, params=()):
        with sqlite3.connect(self.db) as db:
            return db.execute(query, params).fetchall()

    def balances(self):
        return self.sql("SELECT id,balance_cents FROM accounts ORDER BY id")

    def transfer(self, ref="PAY-001", amount="125.50", code=0, **kwargs):
        return self.run_app("transfer", ref, "ACC00001", "ACC00002", amount, code=code, **kwargs)

    def batch_file(self, contents):
        path = self.directory / "daily payments.dat"
        path.write_text(contents)
        return str(path)

    def test_initialization_is_safe_and_search_works(self):
        self.transfer()
        before = self.balances()
        self.run_app("init")
        self.assertEqual(self.balances(), before)
        result = self.run_app("accounts", "amal")
        self.assertIn("Amal Demo", result)
        self.assertNotIn("Youssef Demo", result)
        self.run_app("reconcile")

    def test_transfer_posts_balanced_ledger_and_history(self):
        self.assertIn("POSTED", self.transfer())
        self.assertEqual(self.balances()[0][1], 987450)
        self.assertEqual(self.balances()[1][1], 262550)
        self.assertEqual(self.sql("SELECT sum(signed_cents),count(*) FROM ledger"), [(0, 2)])
        self.assertIn("-125.50", self.run_app("history", "ACC00001"))
        self.assertIn("RECONCILIATION OK", self.run_app("reconcile"))

    def test_retry_and_conflicting_payload(self):
        self.transfer()
        before = self.balances()
        self.assertIn("ALREADY_POSTED", self.transfer())
        self.assertIn("REFERENCE_CONFLICT", self.transfer(amount="125.51", code=4))
        self.assertEqual(self.balances(), before)
        self.assertEqual(self.sql("SELECT count(*) FROM ledger"), [(2,)])

    def test_rejection_is_persistent_and_retry_does_not_post(self):
        self.assertIn("INSUFFICIENT_FUNDS", self.transfer(amount="10000.01", code=4))
        self.run_app("transfer", "TOPUP", "ACC00003", "ACC00001", "100.00")
        before = self.balances()
        self.assertIn("INSUFFICIENT_FUNDS", self.transfer(amount="10000.01", code=4))
        self.assertEqual(self.balances(), before)
        self.run_app("reconcile")

    def test_invalid_inputs_cannot_move_money(self):
        before = self.balances()
        for amount in ["0.00", "-1.00", "1", "1.2", "1.234", ".50", "1e2", "1,00", "NaN", "1..00", "1000000000.00", " 1.00"]:
            with self.subTest(amount=amount):
                self.transfer(ref="BAD", amount=amount, code=4)
        self.assertIn("INVALID_REFERENCE", self.transfer(ref="bad'", code=4))
        self.assertIn("INVALID_ACCOUNT_FORMAT", self.run_app("transfer", "BAD", "ACC0000'", "ACC00002", "1.00", code=4))
        self.assertEqual(self.balances(), before)
        self.assertEqual(self.sql("SELECT count(*) FROM payments"), [(0,)])

    def test_business_rejections(self):
        self.assertIn("SAME_ACCOUNT", self.run_app("transfer", "SAME", "ACC00001", "ACC00001", "1.00", code=4))
        self.assertIn("UNKNOWN_SOURCE", self.run_app("transfer", "SRC", "ACC99999", "ACC00001", "1.00", code=4))
        self.assertIn("UNKNOWN_DESTINATION", self.run_app("transfer", "DST", "ACC00001", "ACC99999", "1.00", code=4))
        self.assertEqual(self.sql("SELECT count(*) FROM ledger"), [(0,)])
        self.run_app("reconcile")

    def test_exact_cents_and_balance_limit(self):
        self.transfer(amount="0.01")
        self.assertEqual(self.balances()[0][1], 999999)
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE accounts SET opening_cents=99999999999,balance_cents=99999999999 WHERE id='ACC00003'")
        self.assertIn("BALANCE_LIMIT", self.run_app("transfer", "LIMIT", "ACC00001", "ACC00003", "0.01", code=4))
        self.run_app("reconcile")

    def test_reversal_preserves_original_and_prevents_second_reversal(self):
        before = self.balances()
        self.transfer()
        self.assertIn("POSTED", self.run_app("reverse", "REV-001", "PAY-001"))
        self.assertEqual(self.balances(), before)
        self.assertIn("ALREADY_POSTED", self.run_app("reverse", "REV-001", "PAY-001"))
        self.assertIn("ALREADY_REVERSED", self.run_app("reverse", "REV-002", "PAY-001", code=4))
        self.assertIn("ORIGINAL_NOT_REVERSIBLE", self.run_app("reverse", "REV-003", "REV-001", code=4))
        self.assertEqual(self.sql("SELECT count(*) FROM ledger"), [(4,)])
        self.run_app("reconcile")

    def test_reversal_requires_funds_and_valid_original(self):
        self.assertIn("ORIGINAL_NOT_FOUND", self.run_app("reverse", "REV-000", "MISSING", code=4))
        self.transfer(amount="1000.00")
        self.run_app("transfer", "SPEND", "ACC00002", "ACC00003", "3500.00")
        self.assertIn("INSUFFICIENT_FUNDS", self.run_app("reverse", "REV-001", "PAY-001", code=4))
        self.run_app("reconcile")

    def test_batch_mixed_results_and_replay(self):
        path = self.batch_file(record("BATCH-001") + record("BATCH-002", amount="000020000.00") + "broken\n" + record("BATCH-003", destination="ACC99999"))
        output = self.run_app("batch", path, code=4)
        self.assertIn("Posted: 1", output)
        self.assertIn("Rejected: 3", output)
        before = self.balances()
        output = self.run_app("batch", path, code=4)
        self.assertIn("Exact retries: 1", output)
        self.assertEqual(self.balances(), before)
        self.assertEqual(self.sql("SELECT count(*) FROM batch_rejects"), [(6,)])
        self.assertIn("INVALID_RECORD_LENGTH", self.run_app("rejects"))
        self.assertEqual(self.sql("SELECT status FROM batch_runs"), [("COMPLETED",), ("COMPLETED",)])
        self.run_app("reconcile")

    def test_batch_duplicate_and_conflict_in_same_file(self):
        path = self.batch_file(record("ONE") + record("ONE") + record("ONE", amount="000000100.01"))
        result = self.run_app("batch", path, code=4)
        self.assertIn("Posted: 1", result)
        self.assertIn("Exact retries: 1", result)
        self.assertIn("REFERENCE_CONFLICT", result)
        self.run_app("reconcile")

    def test_empty_file_and_missing_file(self):
        output = self.run_app("batch", self.batch_file(""))
        self.assertIn("Posted: 0", output)
        self.run_app("batch", str(self.directory / "missing"), code=8)

    def test_overlong_record_cannot_become_multiple_payments(self):
        path = self.batch_file(record("BAD").rstrip("\n") + "X" * 10000 + "\n" + record("GOOD"))
        result = subprocess.run([str(EXE), "--db", str(self.db), "batch", path], capture_output=True, text=True, timeout=10)
        self.assertIn(result.returncode, (4, 8), result.stdout + result.stderr)
        self.assertEqual(self.sql("SELECT count(*) FROM payments WHERE reference='BAD'"), [(0,)])
        self.run_app("reconcile")

    def test_physical_input_is_not_normalized_into_valid_payments(self):
        original = record("CONTROL")
        # Tabs and NUL must never be expanded/stripped by COBOL line I/O.
        bad_lines = [original[:7] + "\t" + original[8:], original[:7] + "\0" + original[8:]]
        path = self.batch_file("".join(bad_lines) + "X" * 4096 + record("HIDDEN") + record("VALID"))
        self.run_app("batch", path, code=4)
        self.assertEqual(self.sql("SELECT reference FROM payments"), [("VALID",)])
        self.assertIn("\\x00", self.run_app("rejects"))
        self.run_app("reconcile")

    def test_crlf_and_last_record_without_newline(self):
        path = self.directory / "windows.dat"
        path.write_bytes((record("CRLF").replace("\n", "\r\n") + record("LAST").rstrip("\n")).encode("ascii"))
        self.run_app("batch", str(path))
        self.assertEqual(self.sql("SELECT count(*) FROM payments"), [(2,)])

    def test_batch_amount_contract_is_exactly_nine_digits_and_two_decimals(self):
        path = self.batch_file(record("PADDED", amount="1.50        ") + record("VALID", amount="000000001.50"))
        self.assertIn("INVALID_BATCH_AMOUNT_FORMAT", self.run_app("batch", path, code=4))
        self.assertEqual(self.sql("SELECT reference,cents FROM payments"), [("VALID", 150)])

    def test_reference_cannot_have_leading_or_internal_spaces(self):
        self.transfer(ref=" PAY-001", code=4)
        self.transfer(ref="PAY 001", code=4)
        self.assertEqual(self.sql("SELECT count(*) FROM payments"), [(0,)])

    def test_lock_timeout_does_not_post_or_hang(self):
        before = self.balances()
        with sqlite3.connect(self.db) as locker:
            locker.execute("BEGIN IMMEDIATE")
            self.assertIn("DATABASE_ERROR", self.transfer(code=8))
        self.assertEqual(self.balances(), before)
        self.assertEqual(self.sql("SELECT count(*) FROM payments"), [(0,)])

    def test_crash_rolls_back_partial_debit(self):
        before = self.balances()
        self.transfer(env={"MINIBANK_TEST_CRASH_AFTER_DEBIT": "1"}, code=86)
        self.assertEqual(self.balances(), before)
        self.assertEqual(self.sql("SELECT count(*) FROM payments"), [(0,)])
        self.transfer()
        self.run_app("reconcile")

    def test_interrupted_batch_can_be_replayed(self):
        path = self.batch_file(record("FIRST") + record("SECOND"))
        self.run_app("batch", path, env={"MINIBANK_TEST_CRASH_AFTER_DEBIT": "1", "MINIBANK_TEST_CRASH_REFERENCE": "SECOND"}, code=86)
        self.assertEqual(self.sql("SELECT status FROM batch_runs"), [("RUNNING",)])
        self.assertEqual(self.sql("SELECT reference FROM payments"), [("FIRST",)])
        result = self.run_app("batch", path)
        self.assertIn("Posted: 1", result)
        self.assertIn("Exact retries: 1", result)
        self.assertEqual(self.sql("SELECT count(*) FROM ledger"), [(4,)])
        self.run_app("reconcile")

    def test_concurrent_same_reference_posts_once(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(lambda _: self.transfer(), range(6)))
        self.assertEqual(sum(" | POSTED" in result for result in results), 1)
        self.assertEqual(self.sql("SELECT count(*) FROM ledger"), [(2,)])
        self.run_app("reconcile")

    def test_concurrent_debits_cannot_overdraw(self):
        def pay(i):
            return subprocess.run([str(EXE), "--db", str(self.db), "transfer", f"RACE-{i}", "ACC00001", "ACC00002", "6000.00"], capture_output=True, text=True, timeout=20)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(pay, range(2)))
        self.assertEqual(sorted(p.returncode for p in results), [0, 4])
        self.assertEqual(self.balances()[0][1], 400000)
        self.run_app("reconcile")

    def test_reconciliation_detects_balance_corruption(self):
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE accounts SET balance_cents=balance_cents+1 WHERE id='ACC00001'")
        self.assertIn("RECONCILIATION FAILED", self.run_app("reconcile", code=4))

    def test_fractional_database_money_fails_closed(self):
        # SQLite affinity alone permits REAL values in INTEGER columns.
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE accounts SET opening_cents=1000000.5,balance_cents=1000000.5 WHERE id='ACC00001'")
        self.run_app("reconcile", code=4)
        self.transfer(code=8)
        self.assertEqual(self.sql("SELECT count(*) FROM payments"), [(0,)])

    def test_reconciliation_checks_reversal_business_relationship(self):
        self.transfer()
        # A balanced posting can still be an invalid reversal of itself.
        with sqlite3.connect(self.db) as db:
            db.execute("DROP TRIGGER payment_no_update")
            db.execute("UPDATE payments SET reversal_of=reference WHERE reference='PAY-001'")
        self.run_app("reconcile", code=4)

    def test_completed_batch_counts_and_run_report(self):
        path = self.batch_file(record("AUDIT") + "malformed\n")
        self.run_app("batch", path, code=4)
        result = self.run_app("runs")
        self.assertIn("COMPLETED", result)
        self.assertIn("daily payments.dat", result)
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE batch_runs SET rejected=0")
        self.run_app("reconcile", code=4)

    def test_credit_failure_rolls_back_entire_posting(self):
        before = self.balances()
        with sqlite3.connect(self.db) as db:
            db.execute("CREATE TRIGGER simulate_credit_failure BEFORE UPDATE ON accounts WHEN NEW.id='ACC00002' BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END")
        self.transfer(code=8)
        self.assertEqual(self.balances(), before)
        self.assertEqual(self.sql("SELECT count(*) FROM payments"), [(0,)])
        self.assertEqual(self.sql("SELECT count(*) FROM ledger"), [(0,)])

    def test_history_is_immutable(self):
        self.transfer()
        with sqlite3.connect(self.db) as db:
            for statement in ["DELETE FROM ledger", "UPDATE ledger SET signed_cents=1", "DELETE FROM payments", "UPDATE payments SET cents=1"]:
                with self.assertRaises(sqlite3.IntegrityError):
                    db.execute(statement)

    def test_unknown_schema_and_uninitialized_database_are_rejected(self):
        with sqlite3.connect(self.db) as db:
            db.execute("PRAGMA user_version=99")
        self.run_app("init", code=8)
        self.run_app("accounts", code=8)
        self.db = self.directory / "unrelated.db"
        with sqlite3.connect(self.db) as db:
            db.execute("CREATE TABLE important(value TEXT)")
        self.run_app("init", code=8)
        self.assertEqual(self.sql("SELECT name FROM sqlite_master WHERE type='table'"), [("important",)])

    def test_argument_lengths_are_not_silently_truncated(self):
        self.transfer(ref="A" * 25, code=8)
        self.run_app("transfer", "X", "ACC00001X", "ACC00002", "1.00", code=8)
        self.run_app("reconcile", "unexpected", code=8)
        self.assertEqual(self.sql("SELECT count(*) FROM payments"), [(0,)])

    def test_terminal_confirmation_cancel_and_eof(self):
        result = self.run_app("menu", input="3\nCANCEL\nACC00001\nACC00002\n10.00\nNO\n0\n")
        self.assertIn("Cancelled", result)
        self.assertEqual(self.sql("SELECT count(*) FROM payments"), [(0,)])
        result = self.run_app("menu", input="3\nCONFIRM\nACC00001\nACC00002\n10.00\nYES\n0\n")
        self.assertIn("CONFIRM | POSTED", result)
        self.run_app("menu", input="")
        self.run_app("reconcile")

    def test_backup_restores_consistent_data_and_refuses_overwrite(self):
        self.transfer()
        target = self.directory / "backup.db"
        backup = subprocess.run(["python3", str(ROOT / "tools" / "backup.py"), str(self.db), str(target)], capture_output=True, text=True, timeout=20)
        self.assertEqual(backup.returncode, 0, backup.stderr)
        expected = self.balances()
        self.transfer(ref="LATER", amount="1.00")
        again = subprocess.run(["python3", str(ROOT / "tools" / "backup.py"), str(self.db), str(target)], capture_output=True, text=True, timeout=20)
        self.assertNotEqual(again.returncode, 0)
        self.db = target
        self.assertEqual(self.balances(), expected)
        self.run_app("reconcile")


if __name__ == "__main__":
    unittest.main()
