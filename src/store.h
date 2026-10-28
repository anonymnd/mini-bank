#ifndef MINIBANK_STORE_H
#define MINIBANK_STORE_H

#include <stdint.h>

/* CALL ABI: BY REFERENCE; BINARY-LONG=int, S9(18) COMP-5=int64_t.
 * PIC X arguments are space-padded (not NUL-terminated): ref/original=24,
 * account=8, status=8, reason=40 bytes. Path/query strings are terminated.
 * Raw reject input has an explicit length. Caller owns payment transactions.
 * Store results: -1=technical failure, 0=success/not found, 1=found.
 * Reports may return 4 for a business/control failure.
 */
int mb_open(const char *path, const int *create);
int mb_close(void);
int mb_init(void);
int mb_begin(void);
int mb_commit(void);
int mb_rollback(void);
int mb_find(const char *ref, char *source, char *destination, int64_t *cents,
            char *status, char *reason, char *original);
int mb_account(const char *account, int64_t *balance);
int mb_reversed(const char *ref);
int mb_write(const char *ref, const char *source, const char *destination,
             const int64_t *cents, const char *reason, const char *original);
int mb_accounts(const char *query);
int mb_history(const char *account);
int mb_reconcile(void);
int mb_batch_start(const char *path, int64_t *id);
int mb_batch_reject(const int64_t *id, const int *line, const char *raw,
                    const int *length, const char *reason);
int mb_batch_finish(const int64_t *id, const int *posted, const int *retried,
                    const int *rejected);
int mb_rejects(void);
int mb_runs(void);

#endif
