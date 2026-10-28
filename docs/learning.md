# Portfolio skill map and learning path

## What this project actually demonstrates

| Skill | Evidence |
|---|---|
| COBOL data layouts and reuse | `copybooks/payment.cpy`, working-storage and linkage sections |
| Business analysis | Explicit rules in `architecture.md` and the change request |
| Batch / traitement batch | Fixed-position records, line numbers, rejects and return codes |
| SQL and relational modeling | Constraints, joins, ledger queries, database version check |
| Transaction integrity | BEGIN IMMEDIATE, paired ledger entries, atomic commit/rollback |
| Maintenance / évolutifs | Reference-conflict change request and associated regression proof |
| Incident handling / incidents | Forced crash, incomplete run and replay recovery |
| Testing / recette | Integration tests using real COBOL processes and SQLite |
| Documentation | Architecture, file contract, operations guide, recovery instructions |
| Version-control workflow | Repository-ready files and GitHub Actions configuration |

Python is only used for build-time SQL embedding, tests and backups. The payments
and batch business logic runs in COBOL. C is an in-process SQLite binding, not a
second application or network backend.

## How to study it

1. Build and run `hello.cob` separately: `cobc -x -o build/hello hello.cob`.
2. Run the MiniBank menu and make one 0.01 MAD transfer. Inspect both histories.
3. Read the copybook and trace `submit-payment` into `payment-service`.
4. Follow the successful path from validation through commit.
5. Follow an insufficient-funds rejection and an exact retry.
6. Import the sample file; explain why rejected lines and rejected payments have
   different counts.
7. Run the tests; read the interrupted-batch and concurrent-debit tests closely.
8. Explain a reversal using ledger entries, without deleting the original.
9. Back up, reconcile the backup and demonstrate replay recovery.

## Mainframe skills still to acquire

This project does **not** execute on z/OS and does not demonstrate operational
experience with Db2, CICS, VSAM, JCL, Endevor or Changeman. SQLite indexed tables
are not VSAM; Bash/Make is not JCL; a numbered terminal menu is not CICS.

Use [IBM Z Xplore](https://www.ibm.com/products/z/resources/zxplore) for actual
hands-on mainframe learning: COBOL, datasets, JCL, Db2, VSAM and TSO/ISPF. Its
training access is constrained; do not assume it can host arbitrary applications.
Seek separate appropriate CICS access for interactive transaction exercises.

With a permitted development environment, the next port would:

- Recompile the business logic using the environment's Enterprise COBOL dialect.
- Replace the SQLite boundary with Db2 embedded SQL, host variables and SQLCODE
  handling; verify locking and unit-of-work behavior on Db2.
- Map the input contract to mainframe datasets and job allocation conventions.
- Supply and execute JCL with local dataset names, load libraries and return-code
  handling. Test restart behavior with real job output.
- Implement CICS transactions and screen maps for inquiry and transfer operations,
  verifying actual syncpoint behavior rather than copying local transaction calls.

These steps require platform-specific implementation and testing. No untested
JCL/CICS files are included merely to make the repository appear mainframe-ready.

## A truthful CV description

"Built a COBOL banking-operations portfolio application with fixed-width batch
imports, exact-decimal payments, an atomic SQLite ledger, duplicate prevention,
reversals, reconciliation and automated crash/concurrency integration tests."

Add IBM Z learning or badges only after you have completed them. Explain the
local/mainframe distinction during interviews. Be prepared to change a rule and
write a regression test yourself: understanding the code is the hiring value.
