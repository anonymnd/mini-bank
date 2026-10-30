import type { Payment } from './api';

export type PaymentFilterStatus = 'ALL' | Payment['status'];

export function filterPayments(
    payments: readonly Payment[],
    query: string,
    status: PaymentFilterStatus,
): Payment[] {
    const term = query.trim().toLowerCase();
    return payments.filter(
        (payment) =>
            (status === 'ALL' || payment.status === status) &&
            (!term ||
                [
                    payment.reference,
                    payment.source,
                    payment.destination,
                    payment.reason,
                    payment.reversal_of,
                    payment.reversed_by,
                ].some((value) => value?.toLowerCase().includes(term))),
    );
}

function csvCell(value: string): string {
    // CSV quoting alone does not prevent spreadsheet formula execution. Keep
    // identifiers beginning with formula markers as literal spreadsheet text.
    const literal = /^\s*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + literal.replaceAll('"', '""') + '"';
}

export function paymentsCsv(payments: readonly Payment[]): string {
    const header = [
        'reference',
        'source_account',
        'destination_account',
        'amount_mad',
        'currency',
        'status',
        'reason',
        'reversal_of',
        'reversed_by',
        'created_at_utc',
    ];
    const rows = payments.map((payment) => {
        if (!Number.isSafeInteger(payment.cents) || payment.cents < 1) {
            throw new Error('Cannot export invalid payment amounts. Refresh and reconcile first.');
        }
        const amount = `${Math.trunc(payment.cents / 100)}.${String(payment.cents % 100).padStart(2, '0')}`;
        return [
            payment.reference,
            payment.source,
            payment.destination,
            amount,
            'MAD',
            payment.status,
            payment.reason,
            payment.reversal_of ?? '',
            payment.reversed_by ?? '',
            payment.created_at,
        ];
    });
    return (
        '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
    );
}
