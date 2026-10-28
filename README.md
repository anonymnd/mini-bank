# MiniBank — COBOL payments and reconciliation

A working banking operations portfolio project: COBOL business rules and batch
processing, an atomic SQLite ledger, a terminal menu, and reproducible integration
tests. All customers are fictional and all amounts are MAD.

## Angular web application

Double-click **MiniBank-Web.cmd**, or run `.\MiniBank-Web.cmd` from PowerShell.
It installs locked frontend dependencies if needed, builds Angular and COBOL,
starts a hidden loopback-only server, and opens **http://localhost:8765**.
Node.js 24.15+ (24.x) and the existing Ubuntu WSL environment are required.
The terminal launcher below remains available. Both interfaces use `data/demo.db`.

The Angular dashboard provides overview metrics, searchable accounts and ledger
history, reviewed transfers, confirmed reversals, uploaded batch imports,
run/rejection history, and reconciliation. Its API invokes the same COBOL
executable for all financial changes. There is no replacement JavaScript payment
engine. Read [web architecture and security boundaries](docs/web-architecture.md).

For Linux, build with `cd frontend && npm ci && npm run build`, return to the
project root and run `bash tools/web.sh`. Keep that terminal running. The app is
a single-operator local demo; do not expose this server to the internet.

Frontend verification (inside `frontend/`):

```bash
npm run format:check
npm run typecheck
npm audit --audit-level=high
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests start a separate server at port 8766 with a temporary database;
they never reset the demo database. `make check` includes HTTP security and
integration tests but does not run Node/browser tooling. CI performs both gates.
The patched Vite 8.3.5 override addresses advisories in Angular's pinned development
dependency; the production app is served by the local adapter, not Vite.

## Start on this Windows computer

Double-click **MiniBank.cmd**, or run it from PowerShell:

```powershell
.\MiniBank.cmd
```

The launcher builds inside the installed Ubuntu WSL distribution, safely creates
`data/demo.db` on first use, and opens the menu. Reopening it preserves your data.
The compiler and dependencies have been installed in Ubuntu for this project.

```text
MINIBANK | Banking operations portfolio | MAD

1  Find customer / account
2  Account history
3  Transfer money
4  Import payment file
5  Reconcile accounts
6  View batch rejections
7  Reverse a transfer
8  Batch run history
0  Exit
```

Initial accounts: ACC00001 / Amal Demo / MAD 10,000.00;
ACC00002 / Youssef Demo / MAD 2,500.00;
ACC00003 / Atlas Supplies Demo / MAD 5,000.00.

## Reproducible command-line demo

These PowerShell commands use a separate database. `init` never resets existing
data. The same payment reference is safe to retry.

```powershell
.\MiniBank.cmd --db data/interview.db init
.\MiniBank.cmd --db data/interview.db accounts
.\MiniBank.cmd --db data/interview.db transfer INTERVIEW-001 ACC00001 ACC00002 125.50
.\MiniBank.cmd --db data/interview.db transfer INTERVIEW-001 ACC00001 ACC00002 125.50
.\MiniBank.cmd --db data/interview.db history ACC00001
.\MiniBank.cmd --db data/interview.db reverse REV-INTERVIEW-001 INTERVIEW-001
.\MiniBank.cmd --db data/interview.db reconcile
```

Expected results: POSTED, ALREADY_POSTED on the retry, an opposite payment for
the reversal, then RECONCILIATION OK. CLI mutations execute immediately; the
interactive menu asks for `YES` before transfers/reversals.

For batch processing, select menu option 4 and enter `samples/payments.dat`, or:

```powershell
.\MiniBank.cmd --db data/interview.db batch samples/payments.dat
.\MiniBank.cmd --db data/interview.db rejects
.\MiniBank.cmd --db data/interview.db runs
```

On a fresh database the sample posts two payments and rejects three lines.
Replaying it posts zero new payments and identifies two exact successful retries.
The rejected business requests retain their original decisions.

Exit codes: **0** success or exact posted retry; **4** business rejection,
completed batch with rejected lines, or failed reconciliation; **8** usage,
file or database error. A test-only injected hard crash exits **86**.
The Windows launcher preserves command exit codes. It pauses if starting the
interactive app fails, so a double-click error remains visible.

## Build and test on Linux / WSL

Dependencies: GnuCOBOL 3.x, C compiler, Make, SQLite development headers, Python 3.
Verified here: GnuCOBOL 3.1.2, GCC 13.3, SQLite 3.45.1, Python 3.12.3,
Ubuntu 24.04 in WSL. Ubuntu's GnuCOBOL package emits a duplicate
`_FORTIFY_SOURCE` warning from its own compiler defaults; compilation succeeds.

```bash
sudo apt-get update
sudo apt-get install -y gnucobol build-essential libsqlite3-dev python3
make
make check
make demo
bash tools/run.sh
```

From PowerShell in this project, run the tests with:

```powershell
wsl -d Ubuntu -- bash -lc 'cd "/mnt/c/Users/PC/Documents/ChatGPT/os cobol" && make check'
```

The tests run the actual compiled COBOL/C executable against isolated SQLite
databases, including concurrent writers, hard-crash rollback, interrupted-batch
replay, duplicate conflicts, reversals, malformed files and reconciliation failure.
`make check` also performs GCC static analysis, strict C interface checks, COBOL
syntax checks, Python compilation and Bash syntax validation. `make test` runs
the tests separately. GitHub Actions uses the same full gate; no remote CI run
is claimed.

## Read the code in this order

1. [Architecture and invariants](docs/architecture.md).
2. [Shared request/response copybook](copybooks/payment.cpy).
3. [COBOL payment service](src/payment.cob): validation, duplicate checks,
   sufficient funds, reversal rules and commit/rollback decisions.
4. [COBOL interface and batch job](src/main.cob): menu, command-line parsing,
   fixed-width file processing and rejection journaling.
5. [Schema](db/schema.sql) and [SQLite bridge](src/store.c).
6. [Integration tests](tests/test_minibank.py).

The earlier `hello.cob` is kept as your first tiny COBOL example.

## Portfolio and operations documents

- [Business requirements and acceptance criteria](docs/business-requirements.md)
- [Software engineering standards](docs/engineering-standards.md)
- [Contribution and review workflow](CONTRIBUTING.md)
- [File layout and expected sample results](docs/payment-file.md)
- [Operations, recovery and backup](docs/operations.md)
- [Job-skill mapping and mainframe learning track](docs/learning.md)
- [A concrete maintenance change request](docs/change-request.md)
- [Runtime configuration and supported environment](docs/configuration.md)

This is a local, single-operator educational application with OS-account access
control. The optional web server adds same-origin/session-token protections,
not enterprise identity. It does not handle real money or provide production banking security.
JCL, CICS, Db2 and VSAM execution are not included or claimed; see the learning
track for the actual mainframe practice needed alongside this project.
