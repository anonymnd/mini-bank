#include <sqlite3.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>
#include <unistd.h>
#include <limits.h>
#include "store.h"
#include "schema.h"

_Static_assert(CHAR_BIT == 8, "COBOL PIC X requires 8-bit bytes");
_Static_assert(sizeof(int) == 4, "COBOL BINARY-LONG requires 32-bit C int");
_Static_assert(sizeof(int64_t) == 8, "COBOL monetary ABI requires 64-bit cents");

static sqlite3 *db;

static int fail(const char *operation) {
    fprintf(stderr, "DATABASE ERROR (%s): %s\n", operation, sqlite3_errmsg(db));
    return -1;
}
static int exec_sql(const char *sql) {
    return sqlite3_exec(db, sql, NULL, NULL, NULL) == SQLITE_OK ? 0 : fail("SQL");
}
static sqlite3_stmt *prepare(const char *sql) {
    sqlite3_stmt *s = NULL;
    if (sqlite3_prepare_v2(db, sql, -1, &s, NULL) != SQLITE_OK) fail("prepare");
    return s;
}
static int finish(sqlite3_stmt *s) {
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE ? 0 : fail("write");
}
static void bind_fixed(sqlite3_stmt *s, int i, const char *v, size_t len) {
    while (len && v[len - 1] == ' ') --len;
    sqlite3_bind_text(s, i, v, (int)len, SQLITE_TRANSIENT);
}
static void out_fixed(char *out, size_t n, const unsigned char *in) {
    memset(out, ' ', n);
    if (in) {
        size_t len = strlen((const char *)in);
        memcpy(out, in, len < n ? len : n);
    }
}
static void money(int64_t n) {
    if (n < 0) { putchar('-'); n = -n; }
    printf("%" PRId64 ".%02" PRId64, n / 100, n % 100);
}
static void escaped(const unsigned char *value, int length) {
    for (int i = 0; value && i < length; ++i) {
        if (value[i] >= 32 && value[i] <= 126) putchar(value[i]);
        else printf("\\x%02X", value[i]);
    }
}
static int invalid_money(void) {
    fprintf(stderr, "DATABASE ERROR: monetary data must contain bounded integer cents; reconcile and restore before retrying.\n");
    return -1;
}
static int version(void) {
    sqlite3_stmt *s = prepare("PRAGMA user_version");
    if (!s) return -1;
    int rc = sqlite3_step(s);
    int result = rc == SQLITE_ROW ? sqlite3_column_int(s, 0) : -1;
    sqlite3_finalize(s);
    return result;
}
int mb_open(const char *path, const int *create) {
    int flags = SQLITE_OPEN_READWRITE | (*create ? SQLITE_OPEN_CREATE : 0);
    if (sqlite3_open_v2(path, &db, flags, NULL) != SQLITE_OK) {
        fail("open"); mb_close(); return -1;
    }
    if (sqlite3_busy_timeout(db, 5000) != SQLITE_OK) {
        fail("busy timeout"); mb_close(); return -1;
    }
    if (exec_sql("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;") < 0) {
        mb_close(); return -1;
    }
    if (!*create && version() != 1) {
        fprintf(stderr, "Unsupported or uninitialized database. Run init on a new database.\n");
        mb_close(); return -1;
    }
    return 0;
}
int mb_close(void) {
    if (!db) return 0;
    int rc = sqlite3_close(db);
    if (rc != SQLITE_OK) return fail("close");
    db = NULL;
    return 0;
}
int mb_begin(void) { return exec_sql("BEGIN IMMEDIATE"); }
int mb_commit(void) { return exec_sql("COMMIT"); }
int mb_rollback(void) { return exec_sql("ROLLBACK"); }
int mb_init(void) {
    if (mb_begin() < 0) return -1;
    int v = version();
    if (v == 1) return mb_commit();
    sqlite3_stmt *s = prepare("SELECT count(*) FROM sqlite_master WHERE type='table'");
    if (!s) { mb_rollback(); return -1; }
    int step = sqlite3_step(s);
    int tables = step == SQLITE_ROW ? sqlite3_column_int(s, 0) : -1;
    sqlite3_finalize(s);
    if (v != 0 || tables != 0) {
        fprintf(stderr, "Refusing to initialize an existing/unknown schema.\n");
        mb_rollback(); return -1;
    }
    if (exec_sql(schema_sql) < 0) { mb_rollback(); return -1; }
    return mb_commit();
}
int mb_find(const char *ref, char *source, char *destination, int64_t *cents,
            char *status, char *reason, char *original) {
    sqlite3_stmt *s = prepare("SELECT source,destination,cents,status,reason,reversal_of FROM payments WHERE reference=?");
    if (!s) return -1;
    bind_fixed(s, 1, ref, 24);
    int rc = sqlite3_step(s);
    if (rc == SQLITE_ROW) {
        if (sqlite3_column_type(s, 2) != SQLITE_INTEGER ||
            sqlite3_column_int64(s, 2) < 1 || sqlite3_column_int64(s, 2) > 99999999999LL) {
            sqlite3_finalize(s); return invalid_money();
        }
        out_fixed(source, 8, sqlite3_column_text(s, 0));
        out_fixed(destination, 8, sqlite3_column_text(s, 1));
        *cents = sqlite3_column_int64(s, 2);
        out_fixed(status, 8, sqlite3_column_text(s, 3));
        out_fixed(reason, 40, sqlite3_column_text(s, 4));
        out_fixed(original, 24, sqlite3_column_text(s, 5));
    }
    sqlite3_finalize(s);
    return rc == SQLITE_ROW ? 1 : rc == SQLITE_DONE ? 0 : fail("find");
}
int mb_account(const char *account, int64_t *balance) {
    sqlite3_stmt *s = prepare("SELECT balance_cents,opening_cents FROM accounts WHERE id=?");
    if (!s) return -1;
    bind_fixed(s, 1, account, 8);
    int rc = sqlite3_step(s);
    if (rc == SQLITE_ROW) {
        for (int i = 0; i < 2; ++i) {
            if (sqlite3_column_type(s, i) != SQLITE_INTEGER ||
                sqlite3_column_int64(s, i) < 0 || sqlite3_column_int64(s, i) > 99999999999LL) {
                sqlite3_finalize(s); return invalid_money();
            }
        }
        *balance = sqlite3_column_int64(s, 0);
    }
    sqlite3_finalize(s);
    return rc == SQLITE_ROW ? 1 : rc == SQLITE_DONE ? 0 : fail("account");
}
int mb_reversed(const char *ref) {
    sqlite3_stmt *s = prepare("SELECT 1 FROM payments WHERE reversal_of=? AND status='POSTED'");
    if (!s) return -1;
    bind_fixed(s, 1, ref, 24);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_ROW ? 1 : rc == SQLITE_DONE ? 0 : fail("reversal");
}
static int update_balance(const char *account, int64_t delta) {
    sqlite3_stmt *s = prepare("UPDATE accounts SET balance_cents=balance_cents+? WHERE id=?");
    if (!s) return -1;
    sqlite3_bind_int64(s, 1, delta);
    bind_fixed(s, 2, account, 8);
    if (finish(s) < 0) return -1;
    return sqlite3_changes(db) == 1 ? 0 : -1;
}
static int ledger_entry(const char *ref, const char *account, int64_t cents) {
    sqlite3_stmt *s = prepare("INSERT INTO ledger VALUES (?,?,?)");
    if (!s) return -1;
    bind_fixed(s, 1, ref, 24); bind_fixed(s, 2, account, 8);
    sqlite3_bind_int64(s, 3, cents);
    return finish(s);
}
int mb_write(const char *ref, const char *source, const char *destination,
             const int64_t *cents, const char *reason, const char *original) {
    int posted = reason[0] == ' ';
    sqlite3_stmt *s = prepare("INSERT INTO payments(reference,source,destination,cents,status,reason,reversal_of) VALUES (?,?,?,?,?,?,?)");
    if (!s) return -1;
    bind_fixed(s, 1, ref, 24); bind_fixed(s, 2, source, 8);
    bind_fixed(s, 3, destination, 8); sqlite3_bind_int64(s, 4, *cents);
    sqlite3_bind_text(s, 5, posted ? "POSTED" : "REJECTED", -1, SQLITE_STATIC);
    bind_fixed(s, 6, reason, 40);
    if (original[0] == ' ') sqlite3_bind_null(s, 7);
    else bind_fixed(s, 7, original, 24);
    if (finish(s) < 0) return -1;
    if (!posted) return 0;
    if (update_balance(source, -*cents) < 0) return -1;
    /* Test hook: hard exit after the debit, before credit/commit. */
    const char *fault = getenv("MINIBANK_TEST_CRASH_AFTER_DEBIT");
    const char *crash_ref = getenv("MINIBANK_TEST_CRASH_REFERENCE");
    char ref_z[25];
    memcpy(ref_z, ref, 24); ref_z[24] = '\0';
    for (int i = 23; i >= 0 && ref_z[i] == ' '; --i) ref_z[i] = '\0';
    if (fault && strcmp(fault, "1") == 0 &&
        (!crash_ref || strcmp(crash_ref, ref_z) == 0)) _exit(86);
    if (update_balance(destination, *cents) < 0 ||
        ledger_entry(ref, source, -*cents) < 0 ||
        ledger_entry(ref, destination, *cents) < 0) return -1;
    return 0;
}
int mb_accounts(const char *query) {
    sqlite3_stmt *s = prepare("SELECT a.id,c.name,a.balance_cents FROM accounts a JOIN customers c ON c.id=a.customer_id WHERE instr(lower(c.name),lower(?))>0 OR instr(a.id,?)>0 ORDER BY a.id");
    if (!s) return -1;
    sqlite3_bind_text(s, 1, query, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(s, 2, query, -1, SQLITE_TRANSIENT);
    puts("ACCOUNT   CUSTOMER                       BALANCE (MAD)");
    int rc, count = 0;
    while ((rc = sqlite3_step(s)) == SQLITE_ROW) {
        printf("%-8s  %-29s  ", sqlite3_column_text(s, 0), sqlite3_column_text(s, 1));
        money(sqlite3_column_int64(s, 2)); putchar('\n'); ++count;
    }
    if (!count) puts("No matching accounts.");
    sqlite3_finalize(s); fflush(stdout);
    return rc == SQLITE_DONE ? 0 : fail("list accounts");
}
int mb_history(const char *account) {
    if (exec_sql("BEGIN") < 0) return -1;
    int64_t balance;
    int exists = mb_account(account, &balance);
    if (exists < 0) { mb_rollback(); return -1; }
    if (!exists) { puts("UNKNOWN_ACCOUNT"); fflush(stdout); mb_rollback(); return 4; }
    sqlite3_stmt *s = prepare("SELECT p.reference,p.created_at,l.signed_cents,coalesce(p.reversal_of,'') FROM ledger l JOIN payments p ON p.reference=l.payment_reference WHERE l.account_id=? ORDER BY p.created_at,p.reference");
    if (!s) { mb_rollback(); return -1; }
    bind_fixed(s, 1, account, 8);
    printf("Account %.8s | Current MAD ", account); money(balance);
    puts("\nREFERENCE                 UTC TIMESTAMP             MOVEMENT MAD / REVERSAL OF");
    int rc;
    while ((rc = sqlite3_step(s)) == SQLITE_ROW) {
        printf("%-24s  %s  ", sqlite3_column_text(s, 0), sqlite3_column_text(s, 1));
        money(sqlite3_column_int64(s, 2));
        printf("  %s\n", sqlite3_column_text(s, 3));
    }
    sqlite3_finalize(s); fflush(stdout);
    if (rc != SQLITE_DONE) { mb_rollback(); return fail("history"); }
    return mb_commit();
}
static int64_t scalar(const char *sql) {
    sqlite3_stmt *s = prepare(sql);
    if (!s) return -1;
    int rc = sqlite3_step(s);
    int64_t n = rc == SQLITE_ROW ? sqlite3_column_int64(s, 0) : -1;
    sqlite3_finalize(s);
    return n;
}
int mb_reconcile(void) {
    if (exec_sql("BEGIN") < 0) return -1;
    int64_t bad_balances = scalar("SELECT count(*) FROM accounts a WHERE balance_cents != opening_cents + coalesce((SELECT sum(signed_cents) FROM ledger WHERE account_id=a.id),0)");
    int64_t bad_postings = scalar("SELECT count(*) FROM payments p WHERE (status='POSTED' AND ((SELECT count(*) FROM ledger WHERE payment_reference=p.reference) != 2 OR coalesce((SELECT sum(signed_cents) FROM ledger WHERE payment_reference=p.reference),1) != 0 OR NOT EXISTS(SELECT 1 FROM ledger WHERE payment_reference=p.reference AND account_id=p.source AND signed_cents=-p.cents) OR NOT EXISTS(SELECT 1 FROM ledger WHERE payment_reference=p.reference AND account_id=p.destination AND signed_cents=p.cents))) OR (status='REJECTED' AND EXISTS(SELECT 1 FROM ledger WHERE payment_reference=p.reference))");
    int64_t foreign_errors = scalar("SELECT count(*) FROM pragma_foreign_key_check");
    int64_t invalid_amounts = scalar(
        "SELECT (SELECT count(*) FROM accounts WHERE typeof(balance_cents)<>'integer' "
        "OR typeof(opening_cents)<>'integer' OR balance_cents NOT BETWEEN 0 AND 99999999999 "
        "OR opening_cents NOT BETWEEN 0 AND 99999999999) + "
        "(SELECT count(*) FROM payments WHERE typeof(cents)<>'integer' OR cents NOT BETWEEN 1 AND 99999999999) + "
        "(SELECT count(*) FROM ledger WHERE typeof(signed_cents)<>'integer' OR signed_cents=0 "
        "OR signed_cents NOT BETWEEN -99999999999 AND 99999999999)");
    int64_t bad_reversals = scalar(
        "SELECT count(*) FROM payments r WHERE reversal_of IS NOT NULL AND NOT EXISTS "
        "(SELECT 1 FROM payments p WHERE p.reference=r.reversal_of AND p.status='POSTED' "
        "AND p.reversal_of IS NULL AND p.source=r.destination AND p.destination=r.source "
        "AND p.cents=r.cents AND p.reference<>r.reference)");
    int64_t bad_batches = scalar(
        "SELECT count(*) FROM batch_runs b WHERE typeof(posted)<>'integer' OR posted<0 "
        "OR typeof(retried)<>'integer' OR retried<0 OR typeof(rejected)<>'integer' OR rejected<0 "
        "OR (status='COMPLETED' AND (finished_at IS NULL OR rejected <> "
        "(SELECT count(*) FROM batch_rejects WHERE run_id=b.id))) "
        "OR (status='RUNNING' AND finished_at IS NOT NULL)");
    int64_t integrity_errors = scalar("SELECT count(*) FROM pragma_quick_check WHERE quick_check<>'ok'");
    int64_t funds = scalar("SELECT coalesce(sum(balance_cents),0) FROM accounts");
    int64_t opening = scalar("SELECT coalesce(sum(opening_cents),0) FROM accounts");
    int64_t posted = scalar("SELECT count(*) FROM payments WHERE status='POSTED'");
    int64_t rejected = scalar("SELECT count(*) FROM payments WHERE status='REJECTED'");
    if (bad_balances < 0 || bad_postings < 0 || foreign_errors < 0 || invalid_amounts < 0 ||
        bad_reversals < 0 || bad_batches < 0 || integrity_errors < 0 ||
        funds < 0 || opening < 0 || posted < 0 || rejected < 0) { mb_rollback(); return -1; }
    int64_t issues = bad_balances + bad_postings + foreign_errors + invalid_amounts +
        bad_reversals + bad_batches + integrity_errors + (funds != opening);
    printf("RECONCILIATION %s\nPosted: %" PRId64 " | Rejected requests: %" PRId64 "\n", issues ? "FAILED" : "OK", posted, rejected);
    if (invalid_amounts) printf("Total funds unavailable: invalid monetary data");
    else { printf("Total funds MAD "); money(funds); }
    printf("\nBalance discrepancies: %" PRId64 " | Ledger discrepancies: %" PRId64 " | Foreign-key errors: %" PRId64 "\n", bad_balances, bad_postings, foreign_errors);
    printf("Invalid monetary records: %" PRId64 " | Reversal discrepancies: %" PRId64
           " | Batch discrepancies: %" PRId64 " | Storage integrity errors: %" PRId64 "\n",
           invalid_amounts, bad_reversals, bad_batches, integrity_errors);
    fflush(stdout);
    if (mb_commit() < 0) return -1;
    return issues ? 4 : 0;
}
int mb_batch_start(const char *path, int64_t *id) {
    sqlite3_stmt *s = prepare("INSERT INTO batch_runs(input_path,status) VALUES (?,'RUNNING')");
    if (!s) return -1;
    sqlite3_bind_text(s, 1, path, -1, SQLITE_TRANSIENT);
    if (finish(s) < 0) return -1;
    *id = sqlite3_last_insert_rowid(db); return 0;
}
int mb_batch_reject(const int64_t *id, const int *line, const char *raw, const int *length, const char *reason) {
    sqlite3_stmt *s = prepare("INSERT INTO batch_rejects VALUES (?,?,?,?)");
    if (!s) return -1;
    sqlite3_bind_int64(s, 1, *id); sqlite3_bind_int(s, 2, *line);
    sqlite3_bind_text(s, 3, raw, *length, SQLITE_TRANSIENT); bind_fixed(s, 4, reason, 40);
    return finish(s);
}
int mb_batch_finish(const int64_t *id, const int *posted, const int *retried, const int *rejected) {
    sqlite3_stmt *s = prepare("UPDATE batch_runs SET status='COMPLETED', finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),posted=?,retried=?,rejected=? WHERE id=?");
    if (!s) return -1;
    sqlite3_bind_int(s, 1, *posted); sqlite3_bind_int(s, 2, *retried);
    sqlite3_bind_int(s, 3, *rejected); sqlite3_bind_int64(s, 4, *id);
    return finish(s);
}
int mb_rejects(void) {
    sqlite3_stmt *s = prepare("SELECT run_id,line_number,reason,raw_record FROM batch_rejects ORDER BY run_id DESC,line_number LIMIT 100");
    if (!s) return -1;
    puts("LATEST BATCH REJECTIONS (up to 100)");
    int rc;
    while ((rc = sqlite3_step(s)) == SQLITE_ROW) {
        printf("Run %" PRId64 " line %d | %s | ", (int64_t)sqlite3_column_int64(s, 0), sqlite3_column_int(s, 1), sqlite3_column_text(s, 2));
        escaped(sqlite3_column_text(s, 3), sqlite3_column_bytes(s, 3));
        putchar('\n');
    }
    sqlite3_finalize(s); fflush(stdout);
    return rc == SQLITE_DONE ? 0 : fail("rejects");
}
int mb_runs(void) {
    sqlite3_stmt *s = prepare(
        "SELECT id,status,started_at,coalesce(finished_at,'INCOMPLETE'),"
        "posted,retried,rejected,input_path FROM batch_runs ORDER BY id DESC LIMIT 100");
    if (!s) return -1;
    puts("LATEST BATCH RUNS (up to 100) | timestamps UTC");
    int rc;
    while ((rc = sqlite3_step(s)) == SQLITE_ROW) {
        printf("Run %" PRId64 " | %s | Start %s | End %s\n",
               (int64_t)sqlite3_column_int64(s, 0), sqlite3_column_text(s, 1),
               sqlite3_column_text(s, 2), sqlite3_column_text(s, 3));
        printf("Posted: %" PRId64 " | Exact retries: %" PRId64 " | Rejected: %" PRId64 " | File: ",
               (int64_t)sqlite3_column_int64(s, 4), (int64_t)sqlite3_column_int64(s, 5),
               (int64_t)sqlite3_column_int64(s, 6));
        escaped(sqlite3_column_text(s, 7), sqlite3_column_bytes(s, 7));
        putchar('\n');
    }
    sqlite3_finalize(s); fflush(stdout);
    return rc == SQLITE_DONE ? 0 : fail("runs");
}
