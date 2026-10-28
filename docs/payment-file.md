# Payment-file contract

Each physical line is exactly **52 printable ASCII bytes**, excluding LF or
CRLF. A final line without a newline is accepted. No header, comments, delimiters
or tabs. Empty lines are rejected. Fixed positions are one-based:

| Position | Width | Meaning | Example |
|---|---:|---|---|
| 1–24 | 24 | Reference, right-padded with spaces | `DAILY-001` plus 15 spaces |
| 25–32 | 8 | Debit account | `ACC00001` |
| 33–40 | 8 | Credit account | `ACC00002` |
| 41–52 | 12 | Amount: 9 digits, dot, 2 decimals | `000000100.00` |

References contain A–Z, 0–9, underscore or hyphen, with no embedded spaces.
Account IDs contain exactly eight uppercase ASCII letters/digits.
Transfer values must be positive and at most 999,999,999.99 MAD.
The service accepts shorter amounts such as `125.50` for terminal/CLI entry.
The batch boundary requires the 12-byte zero-padded representation above;
space-padded shorter amounts are rejected as INVALID_BATCH_AMOUNT_FORMAT.

The COBOL reader reads physical bytes through a one-byte sequential FD, assembles
lines and validates them before calling the shared payment service. This avoids
COBOL line-sequential runtime normalization of tabs or NUL bytes. An overlong
physical line is discarded through its newline and rejected once; it cannot
split into additional payment requests. At most the first 4,096 raw bytes are
retained in the rejection journal. Control bytes are escaped in the reject view.

The bundled `samples/payments.dat` has these results on fresh data:

| Line | Result |
|---:|---|
| 1 | DAILY-001 transfers 100.00 from ACC00001 to ACC00002 |
| 2 | DAILY-002 transfers 25.50 from ACC00002 to ACC00003 |
| 3 | INSUFFICIENT_FUNDS: attempts 20,000.00 |
| 4 | UNKNOWN_DESTINATION: ACC99999 |
| 5 | INVALID_RECORD_LENGTH_EXPECT_52 |

Final balances are 9,900.00 / 2,574.50 / 5,025.50 MAD, totaling 17,500.00.
There are two POSTED payment requests, two REJECTED payment requests, four ledger
entries and three rejected input lines. A malformed line has no payment record.

Batch runs count new posts, successful exact retries and rejected lines
separately. A retry of a previously rejected request counts as a rejection and
returns the original reason. A reference reused with changed details returns
REFERENCE_CONFLICT. Do not edit an already-used reference to represent a new
business instruction; use a new reference instead.
