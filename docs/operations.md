# Operations guide

Run commands from the repository root in Ubuntu/WSL. Example database:
`data/demo.db`. The Windows launcher opens this database by default.

## Normal daily workflow

1. Inspect accounts with `./build/minibank --db data/demo.db accounts`.
2. Retain the incoming payment file unchanged.
3. Run `./build/minibank --db data/demo.db batch samples/payments.dat`.
4. Exit 4 means the job completed with rejections; inspect `rejects`.
5. Run `./build/minibank --db data/demo.db reconcile` and require exit 0.
6. Back up the database and retain the input file and job output.

Use `./build/minibank --db data/demo.db runs` or menu option 8 to inspect the
latest 100 runs, including UTC start/end times, status, counts and input paths.
The displayed counts for interrupted RUNNING jobs are not final; use payment
records and replay results to establish which instructions were committed.

Reconciliation also checks monetary storage types, reversal relationships,
completed rejection counts, SQLite quick-check and foreign keys. Nonzero results
require investigation. A database with fractional stored cents must not be
used to post: monetary reads used for posting fail with a technical error.
Totals are withheld if monetary data is invalid. An incomplete batch by itself
is not a financial discrepancy; recover by replaying its retained input.

Reconciliation checks the complete current ledger, rather than closing a
business date. UTC timestamps are stored for audit. A production business-day
calendar, holiday rules and date-based account closing are outside this scope.

## Interrupted batch / technical error

Stop on exit 8. Diagnose the file/database error without editing ledger data.
After resolving it, replay the original file with unchanged references. Completed
payments return ALREADY_POSTED; unfinished payments execute once. An interrupted
run remains RUNNING as evidence; replay creates a separate run. No background
scheduler is installed.

SQLite recovers its own rollback journal after process interruption. Do not
delete a journal file or copy only the live .db file during a write. Never fix
an imbalance by manually changing balances. Investigate the relevant payment,
ledger and run records, and restore a known-good backup when appropriate.

Inspect run history read-only with the Python standard library if needed:

```bash
python3 -c "import sqlite3; c=sqlite3.connect('file:data/demo.db?mode=ro',uri=True); print(c.execute('SELECT id,status,posted,retried,rejected FROM batch_runs ORDER BY id').fetchall())"
```

## Backup and restore

Create a consistent backup with SQLite's backup API. Destination must be new:

```bash
python3 tools/backup.py data/demo.db data/backup-001.db
./build/minibank --db data/backup-001.db reconcile
```

For recovery, preserve the suspect database for investigation. Point the app at
the verified backup or a new copy rather than overwriting the suspect database:

```bash
./build/minibank --db data/backup-001.db menu
```

Replaying retained inputs after a restore recovers later transactions using the
same deduplication rules. The backup script refuses to overwrite an existing
destination. Tests verify that backup content reconciles and refuses overwrite.
The copy is made in a private staging file, flushed, and published atomically
using a same-filesystem hard link. A failed copy is not published under the final
name. If another operator creates the destination concurrently, their file is
preserved. This requires a filesystem supporting hard links; an unsupported
filesystem returns BACKUP ERROR and exit 8. A hard-killed backup process may leave
a `.minibank-backup-*` staging file; investigate it before removing it. Atomic
publication is not a guarantee of directory-entry durability under power loss.

## Reversals

`reverse REV-001 ORIGINAL-001` creates a new opposite payment. Original history
stays unchanged. Only original posted transfers may be reversed; one successful
reversal is permitted. The receiving account must still have enough funds to
return the amount. A rejected reversal reference remains rejected: resolve the
business situation and submit a new reversal reference.

## Scope and access

Only use fictional data. Anyone who can access the database with your OS account
can read it; there is no enterprise login, public API, role system or encrypted storage.
The optional Angular frontend uses a loopback-only HTTP adapter with an
in-memory session token and same-origin checks; it does not introduce enterprise
authentication or role separation. Place it in a private user directory. No external bank or payment network is
contacted. `init` creates demo data only in an empty version-0 database and refuses
unknown schemas. It never resets an initialized database.

## Crash verification hooks

Tests set `MINIBANK_TEST_CRASH_AFTER_DEBIT=1` to terminate the process between the
two balance updates, before commit. Optional `MINIBANK_TEST_CRASH_REFERENCE`
restricts the fault to a chosen reference. These are deliberate local testing
hooks, not routine configuration. Leave them unset during normal use.
