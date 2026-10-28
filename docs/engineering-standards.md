# Software engineering standard — MiniBank

This is the project's enforced engineering baseline, not ISO certification or a
claim of production-bank compliance. It covers design, interfaces, code quality,
verification, delivery, maintenance and operations for the current Linux/WSL app.

## Ownership and design

| Responsibility | Owner |
|---|---|
| Menu, command parsing, physical batch-file validation | `src/main.cob` |
| Money syntax, transfer/reversal decisions, idempotency | `src/payment.cob` |
| COBOL request and response layout | `copybooks/payment.cpy` |
| SQLite calls, resource handling, transaction primitives, queries | `src/store.c` |
| C-call declarations and ABI documentation | `src/store.h` |
| Schema and integrity constraints | `db/schema.sql` |
| Build and verification entry points | `Makefile` |
| Operator backup/recovery tooling | `tools/backup.py`, operations guide |
| Standalone Angular pages, typed forms and same-origin API client | `frontend/src/` |
| Local HTTP validation/session and read-only inquiry snapshots | `web/server.py` |

Keep one implementation of each business rule. Use native SQLite transactions,
parameter binding and constraints. Separate business rejection from technical
failure. Preserve public command syntax and existing database contents unless
an intentional compatibility change is specified and tested.

## Interface contract

All current COBOL-to-C arguments use BY REFERENCE. `BINARY-LONG` is a 32-bit
signed C `int`; money and run IDs use 64-bit signed integers. C compile-time
assertions reject incompatible integer/byte widths. `store.h` checks C definitions
against declarations with strict prototype warnings. It does not automatically
type-check COBOL calls: actual cross-language integration tests and review must
verify field widths, argument ordering, sign and string termination.

PIC X fields are space-padded; C strings passed for paths/search are explicitly
NUL-terminated. Raw rejection records have explicit byte lengths. Document these
rules at the interface and keep generated schema content derived from one SQL
source. Do not hand-edit generated build artifacts.

## Code and resource rules

- Use descriptive names and small routines aligned with the existing domain.
- Follow `.editorconfig`; preserve spaces significant in fixed-width data.
- Use parameterized SQL for untrusted values. Validate returned monetary types
  before converting SQLite values to COBOL binary money.
- Release SQLite statements and connections on success and failure. Failed
  initialization closes its connection; failed close retains its handle and
  reports an error rather than pretending cleanup succeeded.
- Keep write transactions bounded. No interactive/network operations inside them.
- Preserve stable reason/exit codes; diagnostics must support operator recovery.
- Publish a backup only after SQLite copy and file flush finish. A same-filesystem
  hard link provides atomic publication with no overwrite race. Failed copies
  remove their staging file on handled failures. Source connections are explicitly
  closed, not merely exited as transaction context managers.
- If the process is forcibly killed during backup, a private staging file may
  remain. The final target is absent or complete. Directory-entry persistence
  under power loss depends on the filesystem; atomic publication is not a
  guarantee of whole-system disaster recovery.

## Automated quality gate

Run `make check` from the project root in Linux/WSL. It executes:

1. GCC warnings as errors, strict prototypes, and GCC `-fanalyzer` while compiling
   the bridge into a separate analysis object.
2. GnuCOBOL syntax checks with warnings as errors.
3. Python compilation and Bash syntax checks.
4. The real application build and all automated tests.

`make static` runs the static checks; `make test` builds and runs tests.
`CFLAGS` and `COBFLAGS` can be overridden for local investigation. The default
gate is the release baseline; weakened overrides do not establish it passed.
The Ubuntu GnuCOBOL package's duplicate `_FORTIFY_SOURCE` warning during its
generated C compilation remains a known toolchain warning. It is not suppressed.

## Test strategy

- Use the compiled COBOL/C program and SQLite for financial integration proofs.
- Check exact cents, rejection stability, duplicate conflicts, reversals,
  reconciliation and input boundaries.
- Exercise concurrent writers, forced process termination, storage failure,
  lock timeout, backup restore and incomplete-batch replay where relevant.
- Use filesystem-boundary fault injection to prove backup cleanup and concurrent
  destination preservation; the database copy itself remains real SQLite.
- Unit/fault tests complement integration tests. Avoid tests that simply mirror
  implementation or mock away the invariants being proved.
- Never assert performance/availability targets without measurements. Current
  checks prove functional behavior, not production capacity or complete security.

## Delivery and change controls

GitHub Actions uses `make check` on Ubuntu 24.04 with read-only repository
permissions and a bounded job timeout. Dependency versions come from the Ubuntu
package repositories and may receive updates; this is not a hermetic bit-for-bit
reproducible build. Document exercised runtime versions and retest after upgrades.
Hosted CI execution, branch protection, independent review and release approval
are separate evidence and are not established by a workflow file alone.

The Angular addition uses a committed npm lockfile and exact Angular package
versions. Run `npm ci` rather than silently refreshing dependencies. Formatting,
TypeScript/Angular compilation, dependency audit and real-browser integration
tests are separate frontend gates in CI. Browser tests use a temporary database
and exercise actual COBOL mutations through HTTP. A Vite 8.3.5 override patches
the build tool's vulnerable development dependency; retest it on upgrades.
Angular critical-CSS inlining is disabled because its generated inline loader
conflicts with the API host's strict script CSP. No unsafe-inline script policy
is introduced to accommodate a build optimization.

Follow `CONTRIBUTING.md` for changes. Require requirement/implementation/test
traceability, focused diffs, regression evidence, schema compatibility and
operational documentation. Keep secrets, personal data, compiled binaries and
databases out of Git. Do not add infrastructure or external integrations without
a demonstrated product need and the appropriate security/operations work.

## Verification and limits

The business requirements map controls to named tests. The engineering gate
provides complementary compiler/static and failure-path evidence. No schema
migration is required for this engineering update. Authentication, maker/checker
approval, regulated audit/retention, real mainframe deployment and independent
production security review remain outside the local educational release.
