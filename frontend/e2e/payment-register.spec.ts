import { test, expect } from '@playwright/test';
import type { Payment } from '../src/app/api';
import { filterPayments, paymentsCsv } from '../src/app/payment-register';

const posted: Payment = {
    reference: 'FILTER-POSTED',
    source: 'ACC00001',
    destination: 'ACC00002',
    cents: 1,
    status: 'POSTED',
    reason: '',
    reversal_of: null,
    reversed_by: null,
    created_at: '2026-10-30T12:00:00.000Z',
};
const rejected: Payment = {
    ...posted,
    reference: 'FILTER-REJECTED',
    status: 'REJECTED',
    reason: 'INSUFFICIENT_FUNDS',
    cents: 99999999999,
};

test('register filters combine case-insensitive search and status without mutating source rows', () => {
    const payments = [posted, rejected];
    expect(filterPayments(payments, ' filter- ', 'POSTED')).toEqual([posted]);
    expect(filterPayments(payments, 'funds', 'REJECTED')).toEqual([rejected]);
    expect(filterPayments(payments, 'acc00002', 'ALL')).toEqual(payments);
    expect(filterPayments(payments, 'unmatched', 'ALL')).toEqual([]);
    expect(filterPayments(payments, 'filter-posted', 'REJECTED')).toEqual([]);
    expect(payments).toEqual([posted, rejected]);
});

test('CSV preserves exact cents, escapes multiline quoted fields and neutralizes formulas', () => {
    const csv = paymentsCsv([
        posted,
        rejected,
        { ...posted, reference: '-FORMULA', reason: ' =HYPERLINK("bad")\r\nnext,line' },
    ]);
    expect(csv.startsWith('\uFEFF"reference",')).toBeTruthy();
    expect(csv).toContain('"0.01","MAD"');
    expect(csv).toContain('"999999999.99","MAD"');
    expect(csv).toContain('"\'-FORMULA"');
    expect(csv).toContain('"\' =HYPERLINK(""bad"")\r\nnext,line"');
    expect(csv).toContain('"2026-10-30T12:00:00.000Z"');
    expect(() => paymentsCsv([{ ...posted, cents: 1.5 }])).toThrow('invalid payment amounts');
});
