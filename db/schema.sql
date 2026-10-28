CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE accounts (
    id TEXT PRIMARY KEY CHECK(length(id) = 8),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    opening_cents INTEGER NOT NULL CHECK(opening_cents BETWEEN 0 AND 99999999999),
    balance_cents INTEGER NOT NULL CHECK(balance_cents BETWEEN 0 AND 99999999999)
);
CREATE TABLE payments (
    reference TEXT PRIMARY KEY CHECK(length(reference) BETWEEN 1 AND 24),
    source TEXT NOT NULL,
    destination TEXT NOT NULL,
    cents INTEGER NOT NULL CHECK(cents BETWEEN 1 AND 99999999999),
    status TEXT NOT NULL CHECK(status IN ('POSTED', 'REJECTED')),
    reason TEXT NOT NULL,
    reversal_of TEXT REFERENCES payments(reference),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK((status = 'POSTED' AND reason = '') OR
          (status = 'REJECTED' AND reason <> ''))
);
CREATE UNIQUE INDEX one_posted_reversal ON payments(reversal_of)
    WHERE status = 'POSTED' AND reversal_of IS NOT NULL;
CREATE TABLE ledger (
    payment_reference TEXT NOT NULL REFERENCES payments(reference),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    signed_cents INTEGER NOT NULL CHECK(signed_cents <> 0),
    PRIMARY KEY(payment_reference, account_id)
);
CREATE INDEX account_history ON ledger(account_id, payment_reference);
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
    BEGIN SELECT RAISE(ABORT, 'ledger is immutable'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
    BEGIN SELECT RAISE(ABORT, 'ledger is immutable'); END;
CREATE TRIGGER payment_no_update BEFORE UPDATE ON payments
    BEGIN SELECT RAISE(ABORT, 'payment is immutable'); END;
CREATE TRIGGER payment_no_delete BEFORE DELETE ON payments
    BEGIN SELECT RAISE(ABORT, 'payment is immutable'); END;
CREATE TABLE batch_runs (
    id INTEGER PRIMARY KEY,
    input_path TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    finished_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('RUNNING', 'COMPLETED')),
    posted INTEGER NOT NULL DEFAULT 0,
    retried INTEGER NOT NULL DEFAULT 0,
    rejected INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE batch_rejects (
    run_id INTEGER NOT NULL REFERENCES batch_runs(id),
    line_number INTEGER NOT NULL,
    raw_record TEXT NOT NULL,
    reason TEXT NOT NULL,
    PRIMARY KEY(run_id, line_number)
);
INSERT INTO customers VALUES (1, 'Amal Demo'), (2, 'Youssef Demo'), (3, 'Atlas Supplies Demo');
INSERT INTO accounts VALUES
    ('ACC00001', 1, 1000000, 1000000),
    ('ACC00002', 2, 250000, 250000),
    ('ACC00003', 3, 500000, 500000);
PRAGMA user_version = 1;
