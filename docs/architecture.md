# MiniBank architecture

## Purpose and boundary

A single-operator, local educational banking operations application, using
fictional customers and MAD only. The Angular frontend adds an optional loopback
HTTP listener; there is no real payment integration. Access is controlled by the operating-system account and filesystem
permissions; this is not a multi-user or production banking application.

## Execution path and ownership

```
Operator / CLI / Angular -> local HTTP adapter / payment file
                  |
       COBOL interface and batch reader
                  |
       COBOL payment service (shared by all callers)
                  |
       C SQLite bridge: locks, parameter binding, persistence
                  |
       SQLite database: constraints and atomic commit
```

COBOL owns amount parsing, reference/account syntax, balance checks, transaction
construction, reversals and batch orchestration. C owns SQLite calls, transactions,
report queries and crash-injection hooks for verification. It is not a separate
service. Both are compiled into one executable. Shared COBOL copybooks define
the bridge contract. Money crosses that boundary as signed 64-bit integer cents.

## Invariants defined before implementation

1. All money is MAD integer cents. Positive transfer amounts are bounded at
   999,999,999.99 MAD; account balances use the same bound.
2. A posting has exactly two ledger entries whose signed amounts sum to zero.
   Both entries, the payment record and both balances commit in one transaction.
3. An account balance equals opening cents plus its ledger movements and never
   falls below zero or exceeds the bound.
4. A globally unique reference identifies a request, including rejected validly
   formed requests. Identical retries return their original result; changed
   payloads with the same reference are conflicts. Rejected requests remain
   rejected even if balances later change. A new request needs a new reference.
5. A reversal is a new opposite payment linked uniquely to the original; the
   original entries are never edited. Insufficient funds can prevent reversal.
6. BEGIN IMMEDIATE serializes writers before balance and duplicate checks.
   No interactive prompt occurs while a write lock is held.
7. Each input line is an independent atomic operation. A stopped batch can be
   replayed from the beginning using the same payment references. Run metadata
   may remain RUNNING after interruption; payment records are authoritative.
8. Malformed lines do not post and appear in the durable rejection journal.
   File errors or database failures stop the job with nonzero exit status.
9. Reconciliation checks per-payment ledger pairing, balances and total funds
   using a consistent read snapshot. It also checks integer monetary storage,
   reversal relationships, completed rejection counts, foreign keys and SQLite
   quick-check results. It exits nonzero on discrepancies. Money read for
   posting is validated before conversion from SQLite to COBOL integer cents.

## Data model

- customers: fictional identity and display name.
- accounts: customer FK, unique account ID, opening balance, current balance.
- payments: request reference, debit/credit accounts, amount, POSTED/REJECTED,
  reason, optional unique reversal-of link, creation timestamp (UTC).
- ledger: payment reference, account, signed cents; immutable application history.
- batch_runs: input path, start/end timestamps, completion status and counts.
- batch_rejects: run ID, line number, raw record and rejection reason.

Amounts and statuses have database constraints. No delete or edit-ledger action
is exposed. SQLite foreign keys are enabled on every connection. FULL synchronous
mode and its rollback journal protect commits. The database schema is versioned;
unknown versions fail rather than being silently overwritten.

## Failure semantics

Business rejection returns a stable reason. Syntax errors do not reserve a
reference because the input cannot identify a valid request. Technical errors
roll back and are retryable after diagnosis. Duplicate references with altered
details never overwrite previous results. A failed batch remains incomplete;
replay repairs progress without duplicating postings. Report counts distinguish
new posts, exact retries and rejects. SQLite is the recovery source of truth.

## Delivery and scope

GnuCOBOL 3.x + C11 + SQLite 3, built with Make on Linux/WSL. Python's standard
library drives integration tests against the real executable and database.
No third-party Python packages. The Angular interface is served by a local Python
standard-library adapter; it reads inquiry snapshots and calls the existing
executable for commands. See `web-architecture.md`. The terminal is deliberately plain text with
numbered navigation, visible prompts and explicit confirmation for payments.
CLI commands provide reproducible demonstrations and automation.

This local SQLite implementation does not execute JCL, CICS, VSAM or Db2. Those
belong to a separate mainframe learning track; no mainframe execution is claimed.

The normative local release requirements and their acceptance-test mappings are
in `business-requirements.md`. Monetary type validation runs at the SQLite read
boundary because SQLite affinity alone does not prevent fractional stored values.
`runs` exposes existing run metadata; no schema migration is required for these
controls. Completed rejection counts can be checked against the rejection journal.
Posted/retry counts are run summaries, not independently reconstructed per-line
financial audit evidence: the current schema does not link every successful line
to a run. File completeness/authenticity is outside this release.
