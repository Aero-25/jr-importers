import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests run against the built output, not the dev server.
 *
 * The dev server transpiles on demand and papers over problems the production
 * bundle has — a bad dynamic import or a chunk that fails to resolve shows up
 * only in a real build, which is exactly the class of fault that reaches the
 * counter.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npx vite preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
