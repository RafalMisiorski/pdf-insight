import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { AnalysisSchema } from '../src/lib/schema'

// Smoke test of the deployed chain: GitHub Pages, pdf.js in the browser, the Worker (CORS, limits),
// the model and the schema check. It calls the paid model, so it runs on demand only: npm run test:live
test('wdrożona aplikacja analizuje fakturę od wgrania do pobrania JSON', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('./')
  await page
    .getByLabel(/Przeciągnij plik PDF/)
    .setInputFiles(path.join(import.meta.dirname, 'fixtures', 'faktura.pdf'))

  await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 90_000 })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Pobierz JSON' }).click()
  const saved: unknown = JSON.parse(readFileSync(await (await downloadPromise).path(), 'utf8'))

  const result = AnalysisSchema.parse(saved)
  expect(result.document).toMatchObject({
    fileName: 'faktura.pdf',
    pages: 1,
    type: 'faktura',
    language: 'pl',
  })
})
