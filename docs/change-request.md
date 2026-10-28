# CR-001 — Prevent conflicting reuse of a payment reference

This is a concrete implemented portfolio requirement, not a claim about a
historical production incident.

## Business request

A payment-file sender may retry delivery after a lost acknowledgement. The bank
must not debit twice. However, reusing the reference with a different amount or
account must not silently acknowledge a different business instruction.

## Required behavior

- First eligible request posts once.
- Same reference, accounts, amount and reversal link returns the original result.
- Same reference with different details returns REFERENCE_CONFLICT.
- A previously rejected request retains its original decision.
- Concurrent identical deliveries produce exactly one posting.

Example: `PAY-001 / ACC00001 / ACC00002 / 125.50` posts. A second delivery with
the same details returns ALREADY_POSTED. A delivery of 125.51 using PAY-001 is a
conflict and changes no balance.

## Implementation impact

The shared COBOL payment service checks stored request fields inside the same
write transaction as balance validation and posting. The payment reference is a
database primary key. BEGIN IMMEDIATE makes the check and write one serialized
operation, including concurrent processes. Both the menu and batch path reuse
this service, so there is no separate deduplication rule in the batch importer.

## Acceptance evidence

See these integration tests in `tests/test_minibank.py`:

- `test_retry_and_conflicting_payload`
- `test_rejection_is_persistent_and_retry_does_not_post`
- `test_batch_duplicate_and_conflict_in_same_file`
- `test_concurrent_same_reference_posts_once`
- `test_interrupted_batch_can_be_replayed`

Rollback safety is covered by hard process termination after a debit. Operations
instructions explain how to replay without inventing new references.
