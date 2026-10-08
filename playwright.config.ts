import { defineConfig, devices } from '@playwright/test'

// Browser tests in a real Chromium, in three projects:
// - chromium: the production build with the analysis API mocked per test (page.route). Deterministic,
//   free and without secrets, so CI runs it on every push.
// - live: one smoke test of the deployed app (GitHub Pages, Worker, model). On demand: npm run test:live
// - eval: the training set through the real UI, JSON saved for scoring. On demand: npm run eval
const PORT = 4173
const PAGES_URL = 'https://rafalmisiorski.github.io/pdf-insight/'

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.e2e\.ts/,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      testIgnore: /(live|eval)\.e2e\.ts/,
      fullyParallel: true,
      use: { baseURL: `http://localhost:${PORT}/pdf-insight/` },
    },
    { name: 'live', testMatch: /live\.e2e\.ts/, use: { baseURL: PAGES_URL } },
    {
      name: 'eval',
      testMatch: /eval\.e2e\.ts/,
      use: { baseURL: process.env.EVAL_BASE_URL ?? PAGES_URL },
    },
  ],
  webServer: {
    // A separate build whose API address is a fake host that only page.route answers.
    command: `npx vite build --outDir e2e/.dist && npx vite preview --outDir e2e/.dist --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/pdf-insight/`,
    env: { VITE_API_URL: 'https://api.e2e.test' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
