import { test, expect } from '@playwright/test';

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
