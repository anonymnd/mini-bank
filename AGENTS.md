# MiniBank project guidance

Follow `C:\Users\PC\.codex\RTK.md` for shell invocation on this Windows host.

- Runtime: GnuCOBOL + C/SQLite in Ubuntu WSL, with Angular 22 and a loopback Python HTTP adapter.
- Web mutations must invoke existing COBOL commands; inquiry SQL is read-only.
- Preserve same-origin, Host, token, request-size and upload-path protections.
- Read `docs/architecture.md` before changing financial behavior.
- COBOL owns business rules; C owns SQLite binding, locking and query output.
- All money is signed 64-bit cents. Preserve transaction and replay invariants.
- Never reset data during init; tests must use temporary isolated databases.
- Keep fictional data only. Do not claim unexecuted mainframe behavior.
- Build: `make`; verification: `make test`; demo: `make demo` in Linux/WSL.
- Full engineering gate: `make check`; static-only checks: `make static`.
- Follow `CONTRIBUTING.md` and `docs/engineering-standards.md` for changes.
- Keep `src/store.h` aligned with COBOL CALL sites; use strict C prototypes.
- Frontend gate in `frontend/`: `npm run format:check`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
- Browser tests use a temporary database on port 8766; never reset demo data.
- Windows host example: `rtk proxy wsl -d Ubuntu -- bash -lc 'cd "/mnt/c/Users/PC/Documents/ChatGPT/os cobol" && make test'`.
- Preserve `hello.cob` as the beginner example.
