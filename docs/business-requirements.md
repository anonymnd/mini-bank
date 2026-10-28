# Business requirements and acceptance baseline

## Product objective

MiniBank is an internal banking-operations portfolio application for processing
fictional MAD transfers reliably and demonstrating analysis, COBOL development,
batch operations, SQL, testing and incident recovery. This baseline defines the
implemented local release. It is not a regulatory certification or a claim of
production-bank readiness.

## Actor, workflow and terminology

The **operations clerk** is the local OS user running the application. The clerk
can inquire, submit internal transfers, import instructions, reverse a posted
transfer and run financial controls. The same user can perform support/recovery
in this educational environment; there is no separation of duties.

A **request** has one unique reference and one source/destination pair. A
**posting** is the atomic ledger movement for an accepted request. A **reversal**
is a separate, linked opposite posting. A **reject** is a stable business decision
or an input-format failure. A **retry** is redelivery of the same instruction.
A **run** is one execution of a batch import, which can complete or remain
incomplete after an error/interruption.

Normal workflow: inquire -> validate instruction -> post or reject -> inspect
results -> reconcile -> back up. Recovery workflow: diagnose -> fix cause ->
replay retained original input -> reconcile. Business rules are shared between
interactive and batch operations.

## Mandatory requirements and executable acceptance

Tests below are functions in `tests/test_minibank.py`. Run `make test` to obtain
current evidence; this document alone does not certify a release.

| ID | Business requirement / observable acceptance | Acceptance test |
|---|---|---|
| BR-01 | Inquire by customer/account; opening an existing database preserves its contents. | `test_initialization_is_safe_and_search_works` |
| BR-02 | Positive MAD amounts use exact integer cents; maximum transfer and balance is 999,999,999.99. | `test_exact_cents_and_balance_limit` |
| BR-03 | A successful transfer updates both balances and creates exactly two opposite entries in one commit. | `test_transfer_posts_balanced_ledger_and_history` |
| BR-04 | Unknown accounts, same-account transfers, insufficient funds and balance overflow cannot post. | `test_business_rejections`, `test_rejection_is_persistent_and_retry_does_not_post`, `test_exact_cents_and_balance_limit` |
| BR-05 | Exact retries never post twice; altered payloads using the same reference return a conflict. | `test_retry_and_conflicting_payload`, `test_concurrent_same_reference_posts_once` |
| BR-06 | Concurrent payments cannot overdraw an account. | `test_concurrent_debits_cannot_overdraw` |
| BR-07 | Reverse only an original posted transfer, at most once, without editing original history; require available funds. | `test_reversal_preserves_original_and_prevents_second_reversal`, `test_reversal_requires_funds_and_valid_original` |
| BR-08 | Payments and ledger history cannot be edited/deleted through normal database writes. | `test_history_is_immutable` |
| BR-09 | Import exactly 52 printable ASCII bytes per line; amount is 9 digits, dot, 2 digits; accept LF/CRLF and final unterminated line. | `test_batch_amount_contract_is_exactly_nine_digits_and_two_decimals`, `test_crlf_and_last_record_without_newline` |
| BR-10 | Reject malformed/control/oversized records without converting them into valid payments; retain reasons and bounded raw input. | `test_physical_input_is_not_normalized_into_valid_payments`, `test_overlong_record_cannot_become_multiple_payments` |
| BR-11 | Summarize new posts, exact retries and rejects; preserve completed/incomplete run history. | `test_batch_mixed_results_and_replay`, `test_completed_batch_counts_and_run_report`, `test_interrupted_batch_can_be_replayed` |
| BR-12 | A crash or storage failure during posting leaves no partial debit, payment or ledger record. | `test_crash_rolls_back_partial_debit`, `test_credit_failure_rolls_back_entire_posting` |
| BR-13 | Replaying an interrupted batch retains committed instructions and posts remaining eligible instructions once. | `test_interrupted_batch_can_be_replayed` |
| BR-14 | Reconciliation detects balance/ledger inconsistencies, invalid monetary types, bad reversal relationships, inconsistent completed rejection counts and storage/foreign-key errors. | `test_reconciliation_detects_balance_corruption`, `test_fractional_database_money_fails_closed`, `test_reconciliation_checks_reversal_business_relationship`, `test_completed_batch_counts_and_run_report`; storage/FK failure branches are implemented but not fault-injected in this suite |
| BR-15 | Backups are consistent, independently usable and never overwrite existing destinations. | `test_backup_restores_consistent_data_and_refuses_overwrite` |
| BR-16 | Interactive transfers require explicit YES; cancellation/EOF do not post. | `test_terminal_confirmation_cancel_and_eof` |
| BR-17 | Reject unsupported schemas and invalid command arguments rather than resetting or silently accepting them. | `test_unknown_schema_and_uninitialized_database_are_rejected`, `test_argument_lengths_are_not_silently_truncated` |
| BR-18 | An account with noninteger stored cents cannot be used for posting; do not silently truncate it. | `test_fractional_database_money_fails_closed` |
| BR-19 | A held writer lock ends in a controlled technical failure after the configured five-second wait; no balance moves. | `test_lock_timeout_does_not_post_or_hang` |
| BR-20 | References are 1–24 characters A–Z/0–9/_/-, right-padded only; leading/internal spaces cannot identify a request. | `test_reference_cannot_have_leading_or_internal_spaces` |

## Processing and support contract

- Currency and maximums are explicit business rules, not operator-adjustable settings.
- No floating-point calculations for normal payments. SQLite's permissive type
  affinity is not treated as sufficient proof of integer monetary storage.
- Syntax errors and reversals with unknown/ineligible originals reserve no
  reference. Once a request is recorded, its result is immutable. Recordable
  rejected requests require a new reference for a new instruction.
- CLI transfer/reverse commands are already-authorized local instructions and
  execute immediately; the menu adds human confirmation.
- Exit 0 = success/successful exact retry; 4 = business rejection/control failure;
  8 = invalid usage or technical failure. File errors stop processing.
- `runs` / menu 8 lists up to 100 runs with UTC start/end, status, counts and path.
  RUNNING is evidence of no recorded completion, not proof a process is live.
- Incomplete-run counts are provisional defaults; individual payment records
  establish financial truth. Reconciliation does not label an interrupted run
  corrupt merely because it is incomplete. A completed rejection count must
  match its rejection journal.
- Ledger pairing plus account balances are verified from one read snapshot.
  These controls do not prove the completeness of an externally supplied file.
- Local permissions control access; the optional Angular adapter is loopback-only
  with same-origin/session-token protection. No public service, real PII or real payments.

## Release gate and change management

1. Update the relevant BR acceptance and trace the affected business rule.
2. Implement at its owning layer: COBOL business rules / SQLite persistence.
3. Run the suite against the actual compiled executable and database.
4. For data changes, prove existing data survives and document backup/rollback.
5. Verify a representative operator journey and update file/runbook contracts.
6. Report failed/unexecuted checks explicitly. A configured CI workflow is not
   evidence that a remote CI run has passed.

## Requirements outside this local release

Real bank deployment requires separately agreed controls: authenticated users,
roles, maker/checker approval, trustworthy actor audit, access review, regulatory
retention/privacy, secure hosting/encryption/key management, monitoring, signed
or authenticated file delivery, business-day closing and cutoffs, measurable
performance/capacity targets, disaster-recovery objectives and actual platform
integration. None of these is implied by this portfolio release.

Db2, z/OS/JCL, CICS and VSAM competence requires execution in a permitted
mainframe environment. The next stage must specify that environment and verify
its transaction, encoding, dataset and security semantics before claiming it.
