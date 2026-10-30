import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('operator journey uses actual COBOL: review, cancel, post, retry, reverse, batch and reconcile', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your operations, in view.' })).toBeVisible();
    await expect(page.locator('.metric.featured')).toContainText('17,500.00');
    await page.getByRole('link', { name: 'New transfer' }).click();
    await page.getByLabel('From account').selectOption('ACC00001');
    await page.getByLabel('To account').selectOption('ACC00002');
    await page.getByLabel('Amount MAD').fill('125.50');
    await page.getByLabel('Unique payment reference').fill('BROWSER-001');
    await page.getByRole('button', { name: 'Review transfer' }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm this transfer' })).toBeVisible();
    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page.getByText('Your first transfer will appear here.')).toBeVisible();
    await page.getByRole('button', { name: 'Review transfer' }).click();
    await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
    await expect(page.locator('.notice.success')).toContainText('BROWSER-001 | POSTED');
    await page.getByLabel('Unique payment reference').fill('BROWSER-001');
    await page.getByRole('button', { name: 'Review transfer' }).click();
    await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
    await expect(page.locator('.notice.success')).toContainText('ALREADY_POSTED');
    await page
        .getByRole('row')
        .filter({ hasText: 'BROWSER-001' })
        .getByRole('button', { name: 'Reverse', exact: true })
        .click();
    await page.getByLabel('New reversal reference').fill('BROWSER-REV');
    await page.getByRole('button', { name: 'Confirm reversal', exact: true }).click();
    await expect(page.locator('.notice.success')).toContainText('BROWSER-REV | POSTED');
    await page.getByRole('navigation').getByRole('link', { name: 'Accounts', exact: true }).click();
    await page.getByLabel('Search accounts').fill('Amal');
    await expect(page.getByRole('row').filter({ hasText: 'Amal Demo' })).toContainText('10,000.00');
    await page.getByRole('button', { name: 'View history' }).click();
    await expect(page.locator('.detail-panel')).toContainText('BROWSER-REV');
    await page.getByRole('navigation').getByRole('link', { name: 'Batch operations' }).click();
    const content = 'BROWSER-BATCH'.padEnd(24) + 'ACC00001ACC00002000000010.00\nmalformed\n';
    await page.locator('input[type=file]').setInputFiles({
        name: 'browser.dat',
        mimeType: 'text/plain',
        buffer: Buffer.from(content),
    });
    await page.getByRole('button', { name: 'Review import' }).click();
    await page.getByRole('button', { name: 'Confirm import' }).click();
    await expect(page.locator('.notice.error')).toContainText('Posted: 1');
    await expect(page.locator('.notice.error')).toContainText('Rejected: 1');
    await expect(page.getByText('INVALID_RECORD_LENGTH_EXPECT_52', { exact: true })).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Financial controls' }).click();
    await page.getByRole('button', { name: 'Run reconciliation' }).click();
    await expect(page.getByRole('heading', { name: 'All financial checks passed.' })).toBeVisible();
    await expect(page.locator('.control-output')).toContainText('RECONCILIATION OK');
    await page.getByRole('navigation').getByRole('link', { name: 'Overview', exact: true }).click();
    await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true });
    expect(errors).toEqual([]);
});

test('mobile navigation, empty search, validation and reduced-motion layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your operations, in view.' })).toBeVisible();
    await expect(page.locator('.metric.featured')).toContainText('17,500.00');
    expect(
        await page.evaluate(() => ({
            document: document.documentElement.scrollWidth,
            viewport: innerWidth,
            scroll: scrollX,
        })),
    ).toEqual({ document: 390, viewport: 390, scroll: 0 });
    await page.screenshot({ path: 'test-results/overview-mobile.png', fullPage: true });
    await page.getByRole('navigation').getByRole('link', { name: 'Accounts', exact: true }).click();
    await page.getByLabel('Search accounts').fill('no customer');
    await expect(page.getByText('No accounts match your search.')).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Payments', exact: true }).click();
    await page.getByRole('button', { name: 'Review transfer' }).click();
    await expect(page.getByRole('alert')).toContainText('Choose both accounts');
    expect(
        await page.evaluate(() => ({
            document: document.documentElement.scrollWidth,
            viewport: innerWidth,
            scroll: scrollX,
        })),
    ).toEqual({ document: 390, viewport: 390, scroll: 0 });
});

test('payment filters and CSV export match the visible register', async ({ page }) => {
    const session = await page.request.get('/api/session');
    const { token } = await session.json();
    for (const [reference, amount] of [
        ['FILTER-POSTED', '0.01'],
        ['FILTER-REJECTED', '20000.00'],
    ]) {
        const response = await page.request.post('/api/transfers', {
            headers: { 'X-MiniBank-Token': token },
            data: { reference, source: 'ACC00001', destination: 'ACC00002', amount },
        });
        expect(response.status()).toBe(reference === 'FILTER-POSTED' ? 200 : 422);
    }
    await page.goto('/payments');
    await page.getByLabel('Search payments').fill('filter-');
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('REJECTED');
    await expect(page.getByRole('row').filter({ hasText: 'FILTER-REJECTED' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'FILTER-POSTED' })).toHaveCount(0);
    await expect(page.getByText(/Showing 1 of/)).toBeVisible();
    const downloadReady = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toMatch(/^minibank-payments-\d{4}-\d{2}-\d{2}\.csv$/);
    const path = await download.path();
    expect(path).not.toBeNull();
    const csv = await readFile(path!, 'utf8');
    expect(csv).toContain('FILTER-REJECTED');
    expect(csv).toContain('INSUFFICIENT_FUNDS');
    expect(csv).not.toContain('FILTER-POSTED');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2);
    await page.getByLabel('Search payments').fill('does-not-exist');
    await expect(page.getByText('No payments match your filters.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'FILTER-POSTED' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'FILTER-REJECTED' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: 'test-results/payments-filters-mobile.png', fullPage: true });
});
