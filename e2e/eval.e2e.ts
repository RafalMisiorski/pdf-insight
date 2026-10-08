import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// The training loop through the real UI: every PDF in EVAL_DIR is uploaded exactly as a user would,
// so pdf.js in the browser, the Worker and the model all take part. Each downloaded JSON is saved to
// EVAL_OUT as <name>.json for the scorer, and runs.json keeps the outcome and time of every file.
// It calls the paid model, so it runs on demand only: npm run eval (EVAL_DIR overrides the folder)
const inputDir = process.env.EVAL_DIR ?? 'eval/trainset/pdf'
const outputDir = process.env.EVAL_OUT ?? 'eval-output'
const files = existsSync(inputDir)
  ? readdirSync(inputDir)
      .filter((name) => /\.pdf$/i.test(name))
      .sort()
  : []

// The Worker allows 10 analyses per minute per IP; one start every 7 s stays below that.
const MIN_GAP_MS = 7_000
let lastStart = 0

type Run = { ok: boolean; ms: number; message?: string }

function record(file: string, run: Run) {
  const log = path.join(outputDir, 'runs.json')
  const runs: Record<string, Run> = existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : {}
  runs[file] = run
  writeFileSync(log, JSON.stringify(runs, null, 2) + '\n')
}

if (files.length === 0) {
  test('brak plików do oceny', () => {
    test.skip(true, `Brak plików PDF w ${inputDir} (EVAL_DIR).`)
  })
}

for (const file of files) {
  test(file, async ({ page }) => {
    test.setTimeout(180_000)
    mkdirSync(outputDir, { recursive: true })
    const wait = lastStart + MIN_GAP_MS - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastStart = Date.now()

    await page.goto('./')
    const started = Date.now()
    await page.getByLabel(/Przeciągnij plik PDF/).setInputFiles(path.join(inputDir, file))
    const result = page.locator('#results-title')
    const failure = page.getByRole('alert')
    await expect(result.or(failure)).toBeVisible({ timeout: 150_000 })
    const ms = Date.now() - started
    const output = path.join(outputDir, file.replace(/\.pdf$/i, '.json'))

    if (await failure.isVisible()) {
      // An error message is an outcome too (X01, X02 expect one); the scorer compares it with the label.
      rmSync(output, { force: true }) // never score a stale JSON from an earlier run
      record(file, { ok: false, ms, message: await failure.locator('p').first().innerText() })
      return
    }
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Pobierz JSON' }).click()
    await (await downloadPromise).saveAs(output)
    record(file, { ok: true, ms })
  })
}
