# Runtime configuration contract

| Setting | Default | Owner and behavior |
|---|---|---|
| `--db PATH` | `minibank.db` | Explicit database path; max 512 characters; must precede command |
| Windows launcher without args | `data/demo.db` | Creates parent directory, safe init, then menu |
| Currency | MAD | Fixed domain rule, not a configuration switch |
| Transfer/account maximum | 999,999,999.99 MAD | COBOL validation and SQL constraints |
| SQLite lock wait | 5 seconds | Busy errors exit 8; no unsafe automatic mutation retries |
| Schema version | 1 | Unknown versions rejected, no destructive automatic migration |
| Timestamp | UTC | SQLite-generated ISO timestamps |
| Input-file path | Command/menu input | Local path, max 512 characters |

There are no vendor API keys or payment-provider credentials. The optional web
adapter listens on 127.0.0.1:8765 (port configurable with `--port`) and generates
a per-process browser-session token. It serves `frontend/dist/minibank/browser`
and uses `data/demo.db` by default (`python3 web/server.py --db PATH` can select
another initialized database). The database path is private application data, not a public URL.
The local OS user is the actor and access boundary. Databases, journals and build
outputs are ignored by Git. Mainframe credentials should never be added here.

Two explicitly named test-only environment variables are documented in the
operations guide. They must remain unset for normal operation.

The supported build environment is Linux/WSL with GnuCOBOL 3.x, a C11 compiler,
Make, SQLite 3 and Python 3. Ubuntu 24.04 package versions were exercised locally.
Native Windows compilation has not been verified; the Windows launcher uses
the existing Ubuntu WSL distribution. No Docker daemon is required.

The optional frontend requires Node.js compatible with Angular 22 (verified on
24.16.0), npm, and locked dependencies from `frontend/package-lock.json`. The web
launcher uses Windows Node/npm and WSL Python/COBOL. Browser tests use an isolated
temporary database and loopback port 8766. Uploaded ASCII files are bounded to
256 KiB and retained in `imports/` beside the selected database under generated
filenames. Never expose this local server as a production endpoint.
