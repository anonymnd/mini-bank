import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 45_000,
    expect: { timeout: 10_000 },
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:8766',
        viewport: { width: 1440, height: 1040 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'node e2e/server.mjs',
        url: 'http://127.0.0.1:8766',
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
