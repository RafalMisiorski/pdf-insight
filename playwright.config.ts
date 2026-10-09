import { defineConfig, devices } from '@playwright/test'

// Browser tests in real browsers, in these projects:
// - chromium, firefox, webkit: the production build with the analysis API mocked per test (page.route).
//   Deterministic, free and without secrets, so CI runs them on every push.
// - live: one smoke test of the deployed app (GitHub Pages, Worker, model). On demand: npm run test:live
// - eval: the training set through the real UI, JSON saved for scoring. On demand: npm run eval
const PORT = 4173
// 127.0.0.1 rather than localhost: on Windows localhost may resolve to IPv6 or IPv4, which made one run
// in 225 fail with ERR_CONNECTION_REFUSED under parallel load.
const LOCAL_URL = `http://127.0.0.1:${PORT}/pdf-insight/`
const PAGES_URL = 'https://rafalmisiorski.github.io/pdf-insight/'
const MOCKED = { testIgnore: /(live|eval)\.e2e\.ts/, fullyParallel: true }

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.e2e\.ts/,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', ...MOCKED, use: { ...devices['Desktop Chrome'], baseURL: LOCAL_URL } },
    { name: 'firefox', ...MOCKED, use: { ...devices['Desktop Firefox'], baseURL: LOCAL_URL } },
    { name: 'webkit', ...MOCKED, use: { ...devices['Desktop Safari'], baseURL: LOCAL_URL } },
    {
      name: 'live',
      testMatch: /live\.e2e\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: PAGES_URL },
    },
    {
      name: 'eval',
      testMatch: /eval\.e2e\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: process.env.EVAL_BASE_URL ?? PAGES_URL },
    },
  ],
  webServer: {
    // A separate build whose API address is a fake host that only page.route answers.
    command: `npx vite build --outDir e2e/.dist && npx vite preview --outDir e2e/.dist --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: LOCAL_URL,
    env: { VITE_API_URL: 'https://api.e2e.test' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
