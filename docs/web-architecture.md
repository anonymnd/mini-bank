# Angular web interface

## Request path and invariants

Browser -> Angular standalone pages -> same-origin local Python HTTP adapter ->
existing compiled COBOL command -> payment-service -> C/SQLite transaction.

The adapter uses Python's standard library, serves the Angular production build,
and binds only to 127.0.0.1. It opens SQLite read-only for structured inquiry
snapshots; it never writes financial tables directly. Transfers, reversals,
batch imports and reconciliation invoke the existing executable without a shell.
There is no second implementation of payment rules.

Before edits, the intended invariants are:

- Existing transaction, idempotency and reversal guarantees remain authoritative.
- Browser input is untrusted. Validate JSON shape, field lengths, request sizes,
  command allowlist, account/reference formats and amounts at the HTTP boundary.
- Each process gets a random session token, obtained same-origin and held only
  in browser memory. API requests require the token in a custom header. Reject
  foreign Origin, cross-site fetch metadata and nonlocal Host headers; no CORS.
- Same-origin static assets and API share one loopback port. No credentials,
  token or database paths appear in URLs. No arbitrary command/path endpoint.
- Upload only bounded ASCII payment content; generate the stored filename on
  the server. Preserve imported files for replay. Never use a browser-provided
  filename as a filesystem path.
- On business rejection return 422 plus COBOL's reason; technical failure 503.
  Timeouts are uncertain outcomes: preserve the request reference and instruct
  the operator to inspect/retry that reference, not invent a replacement.
- Financial display uses server integer cents. Mutations use decimal strings.
- Review before transfer, explicit reversal confirmation, disabled pending
  submissions, visible errors, loading/empty states and keyboard-accessible UI.

## Frontend ownership

Angular Router owns navigation, standalone page components own local forms and
views, one typed API service owns HTTP/session handling. Typed reactive forms
validate operator entry. Signals drive asynchronous UI. Refresh authoritative
server state after operations. No optimistic monetary writes.

Visual direction: functional Swiss-style operations dashboard, navy sidebar,
off-white canvas, white panels, restrained teal success/primary action, system
sans typography and monospaced references. The UI/UX skill's financial-dashboard
guidance informs contrast and spacing; marketing/landing-page suggestions do not
fit this internal product and are omitted. No remote fonts or scripts.

## Boundaries

This is a local single-operator demo, not a public deployment. The session token
protects against browser cross-site requests; it is not enterprise identity or
roles. A local process running as the OS user can access the app/data. A hosted
version requires a production server, identity/RBAC, HTTPS, rate controls and
independent security review. Existing terminal commands continue to work.

## HTTP contract

| Method / path | Behavior |
|---|---|
| GET `/api/session` | Same-origin bootstrap; ephemeral token and app identifier |
| GET `/api/state` | Read-only account, payment, batch and summary snapshot |
| GET `/api/accounts/ACCOUNT` | Account and latest 200 ledger entries |
| POST `/api/transfers` | `reference`, `source`, `destination`, decimal-string `amount` |
| POST `/api/reversals` | New `reference` and `original` reference |
| POST `/api/batches` | Display `name` and bounded ASCII `content`; generated retained filename |
| POST `/api/reconcile` | Empty JSON object; execute the existing financial controls |

Except the session bootstrap, API requests require `X-MiniBank-Token`. POSTs
require `application/json`; extra/missing fields fail rather than being ignored.
200 means a successful command/inquiry, 422 contains a COBOL business/control
result, 400/403/413/415 reject invalid requests, and 503 signals a technical or
uncertain outcome. No CORS headers are emitted. Inquiry lists are bounded to
200 accounts / 100 recent payments and runs; summary counts cover the database.

A browser disconnect ends response delivery without retrying the operation.
The operator must inspect/replay using the original payment reference or original
batch file. Response loss never implies that a payment was rolled back.

## Payment register search and export

The register supports case-insensitive search by reference, account, rejection
reason or reversal link, combined with Posted/Rejected status filters. Export CSV
downloads exactly the filtered rows, preserving exact MAD decimals and UTC
timestamps. Search and export cover the latest 100 loaded requests, not complete
payment history. Formula-leading text is prefixed with an apostrophe to protect
spreadsheet users. Filtering and export do not modify financial records.
