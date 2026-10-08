import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  AnalysisSchema,
  type AnalyzeRequest,
  type MergeRequest,
  type ScanRequest,
} from '../src/lib/schema'

// The e2e build sends analyses to this fake address (playwright.config.ts). Every test answers it with
// page.route, so no request reaches the real Worker or the model and each answer is under test control.
const API = 'https://api.e2e.test/analyze'
const MERGE_API = 'https://api.e2e.test/merge'
const SCAN_API = 'https://api.e2e.test/analyze-scan'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name)
// A real model answer for faktura.pdf, checked against the app's own schema before any test uses it.
const analysis = AnalysisSchema.parse(
  JSON.parse(readFileSync(fixture('analysis-faktura.json'), 'utf8')),
)

type Reply = (route: Route, request: AnalyzeRequest) => Promise<void>

// Answers the API with `reply` and returns the request bodies the app sent, in order.
async function mockApi(page: Page, reply: Reply): Promise<AnalyzeRequest[]> {
  const requests: AnalyzeRequest[] = []
  await page.route(API, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS }) // CORS preflight, as the Worker answers it
      return
    }
    const request = route.request().postDataJSON() as AnalyzeRequest
    requests.push(request)
    await reply(route, request)
  })
  return requests
}

// Mirrors the Worker: the model's analysis plus fileName and pages taken from the request.
const success: Reply = (route, request) =>
  route.fulfill({
    headers: CORS,
    json: {
      result: {
        ...analysis,
        document: { ...analysis.document, fileName: request.fileName, pages: request.pages },
      },
    },
  })

const fileInput = (page: Page) => page.getByLabel(/Przeciągnij plik PDF/)
const resultTitle = (page: Page) => page.locator('#results-title')
const alert = (page: Page) => page.getByRole('alert')

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('stan pusty: zaproszenie do wgrania pliku i informacja o API AI', async ({ page }) => {
  await expect(page).toHaveTitle('PDF Insight')
  await expect(page.getByText('Nie wybrano jeszcze pliku.')).toBeVisible()
  await expect(page.getByText(/wysłana do zewnętrznego API AI/)).toBeVisible()
})

test('PDF z tekstem: wysyła wyciągnięty tekst, pokazuje wynik i pobiera ten sam JSON', async ({
  page,
}) => {
  const requests = await mockApi(page, success)
  await fileInput(page).setInputFiles(fixture('faktura.pdf'))

  await expect(resultTitle(page)).toHaveText('FAKTURA VAT nr FV/2026/09/0117')
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ fileName: 'faktura.pdf', pages: 1 })
  // pdf.js really read the text layer in the browser (its worker loaded from the /pdf-insight/ base).
  expect(requests[0].text).toContain('FV/2026/09/0117')
  expect(requests[0].text).toContain('Bursztynowa Drukarnia')

  await expect(page.locator('.facts')).toContainText('Faktura')
  await expect(page.locator('.facts')).toContainText('15.09.2026') // ISO date shown as DD.MM.YYYY
  await expect(page.locator('.card', { hasText: 'Kwoty' })).toContainText(/6\s150,00/) // 6 150,00 zł

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Pobierz JSON' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('faktura.json')
  const saved: unknown = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(saved).toEqual({
    ...analysis,
    document: { ...analysis.document, fileName: 'faktura.pdf', pages: 1 },
  })
})

test('postęp: kroki, licznik czasu i zablokowana strefa do końca analizy', async ({ page }) => {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await mockApi(page, async (route, request) => {
    await held
    await success(route, request)
  })
  await fileInput(page).setInputFiles(fixture('faktura.pdf'))

  const progress = page.getByRole('region', { name: 'Przetwarzam plik faktura.pdf' })
  const step = (label: string) => progress.getByRole('listitem').filter({ hasText: label })
  await expect(step('Analiza treści przez AI')).toHaveAttribute('aria-current', 'step')
  await expect(step('Odczyt tekstu z PDF')).toHaveClass(/done/)
  await expect(step('Sprawdzenie wyniku ze schematem')).toHaveClass(/pending/)
  await expect(progress).toContainText(/\d+ s · zwykle trwa to 5–10 sekund/)
  await expect(fileInput(page)).toBeDisabled()
  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])

  release()
  await expect(resultTitle(page)).toBeVisible()
  await expect(progress).toHaveCount(0)
  await expect(fileInput(page)).toBeEnabled()
})

test.describe('walidacja pliku przed odczytem, bez wysyłania czegokolwiek', () => {
  const cases = [
    {
      name: 'plik, który nie jest PDF-em',
      file: { name: 'notatki.txt', mimeType: 'text/plain', buffer: Buffer.from('zwykły tekst') },
      message: 'Wybrany plik nie jest plikiem PDF.',
    },
    {
      name: 'rozszerzenie .pdf bez sygnatury %PDF-',
      file: { name: 'udawany.pdf', mimeType: 'application/pdf', buffer: Buffer.from('to nie PDF') },
      message: 'nie jest poprawnym dokumentem PDF',
    },
    {
      name: 'plik większy niż 10 MB',
      file: {
        name: 'duzy.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(10 * 1024 * 1024)]),
      },
      message: 'Plik jest za duży. Limit to 10 MB.',
    },
  ]
  for (const { name, file, message } of cases) {
    test(name, async ({ page }) => {
      const requests = await mockApi(page, success)
      await fileInput(page).setInputFiles(file)
      await expect(alert(page)).toContainText(message)
      await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toHaveCount(0)
      expect(requests).toHaveLength(0)
    })
  }
})

test('skan bez warstwy tekstowej: obrazy stron idą do OCR, wynik mówi, że to skan', async ({
  page,
}) => {
  const texts = await mockApi(page, success)
  const scans: ScanRequest[] = []
  await page.route(SCAN_API, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    const request = route.request().postDataJSON() as ScanRequest
    scans.push(request)
    await route.fulfill({
      headers: CORS,
      json: {
        result: {
          ...analysis,
          document: { ...analysis.document, fileName: request.fileName, pages: request.pages },
          meta: { source: 'ocr', pagesAnalyzed: request.images.length },
        },
      },
    })
  })
  await fileInput(page).setInputFiles(fixture('skan.pdf'))

  await expect(resultTitle(page)).toBeVisible()
  expect(texts).toHaveLength(0) // a scan sends no text
  expect(scans).toHaveLength(1)
  expect(scans[0].images).toHaveLength(1)
  expect(scans[0].images[0].startsWith('/9j/')).toBe(true) // base64 of a JPEG file starts with /9j/
  await expect(page.getByText(/odczytano z obrazów stron \(OCR\)/)).toBeVisible()
})

test('błąd serwera: komunikat z Workera i ponowienie tego samego żądania', async ({ page }) => {
  let calls = 0
  const requests = await mockApi(page, (route, request) => {
    calls += 1
    if (calls > 1) return success(route, request)
    return route.fulfill({
      status: 502,
      headers: CORS,
      json: { error: 'Model zwrócił niepoprawny wynik. Spróbuj ponownie.' },
    })
  })
  await fileInput(page).setInputFiles(fixture('faktura.pdf'))

  await expect(alert(page)).toContainText('Model zwrócił niepoprawny wynik.')
  await page.getByRole('button', { name: 'Spróbuj ponownie' }).click()
  await expect(resultTitle(page)).toBeVisible()
  await expect(alert(page)).toHaveCount(0)
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0]) // the retry re-sends the same text, no new extraction
})

test('brak sieci: komunikat i przycisk ponowienia', async ({ page }) => {
  await mockApi(page, (route) => route.abort('internetdisconnected'))
  await fileInput(page).setInputFiles(fixture('faktura.pdf'))
  await expect(alert(page)).toContainText('Brak połączenia z serwerem analizy')
  await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible()
})

test('odpowiedź niezgodna ze schematem nie jest wyświetlana', async ({ page }) => {
  await mockApi(page, (route) =>
    route.fulfill({ headers: CORS, json: { result: { summary: 'Brak pozostałych pól.' } } }),
  )
  await fileInput(page).setInputFiles(fixture('faktura.pdf'))
  await expect(alert(page)).toContainText('Wynik analizy ma niepoprawny format')
  await expect(resultTitle(page)).toHaveCount(0)
})

test('przeciągnij i upuść działa tak samo jak wybór pliku', async ({ page }) => {
  const requests = await mockApi(page, success)
  const base64 = readFileSync(fixture('faktura.pdf')).toString('base64')
  // A real DataTransfer with a File, built in the page, as the browser creates it for a dropped file.
  const dataTransfer = await page.evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'faktura.pdf', { type: 'application/pdf' }))
    return transfer
  }, base64)
  await page.locator('.dropzone').dispatchEvent('drop', { dataTransfer })

  await expect(resultTitle(page)).toBeVisible()
  expect(requests[0]).toMatchObject({ fileName: 'faktura.pdf', pages: 1 })
})

test('klawiatura: Tab przenosi fokus do strefy, spacja otwiera wybór pliku', async ({ page }) => {
  await mockApi(page, success)
  await page.keyboard.press('Tab')
  await expect(fileInput(page)).toBeFocused()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.keyboard.press('Space')
  await (await chooserPromise).setFiles(fixture('faktura.pdf'))
  await expect(resultTitle(page)).toBeVisible()
})

test('ekran 360 px: wynik bez poziomego przewijania strony', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await mockApi(page, success)
  await fileInput(page).setInputFiles(fixture('faktura.pdf'))
  await expect(resultTitle(page)).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('dostępność: axe bez naruszeń w stanie pustym, błędu i wyniku, w obu motywach', async ({
  page,
}) => {
  const violations = async () =>
    (await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.help}`)
  await mockApi(page, success)
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await page.goto('./')
    expect(await violations(), `pusty, ${colorScheme}`).toEqual([])
    await fileInput(page).setInputFiles({
      name: 'notatki.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('to nie PDF'),
    })
    await expect(alert(page)).toBeVisible()
    expect(await violations(), `błąd, ${colorScheme}`).toEqual([])
    await fileInput(page).setInputFiles(fixture('faktura.pdf'))
    await expect(resultTitle(page)).toBeVisible()
    expect(await violations(), `wynik, ${colorScheme}`).toEqual([])
  }
})

test.describe('historia w przeglądarce', () => {
  const STORAGE_KEY = 'pdf-insight:history'

  test('wynik wraca po odświeżeniu bez nowego żądania i znika po wyczyszczeniu', async ({
    page,
  }) => {
    const requests = await mockApi(page, success)
    await fileInput(page).setInputFiles(fixture('faktura.pdf'))
    await expect(resultTitle(page)).toBeVisible()

    await page.reload()
    const history = page.getByRole('region', { name: 'Ostatnie analizy' })
    await history.getByRole('button', { name: 'FAKTURA VAT nr FV/2026/09/0117' }).click()
    await expect(resultTitle(page)).toHaveText('FAKTURA VAT nr FV/2026/09/0117')
    expect(requests).toHaveLength(1) // opened from history, not analysed again

    await history.getByRole('button', { name: 'Wyczyść historię' }).click()
    await expect(history).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Ostatnie analizy' })).toHaveCount(0)
  })

  test('trzyma 5 ostatnich wyników, najnowszy na górze', async ({ page }) => {
    const old = (n: number) => ({
      savedAt: `2026-10-0${n}T10:00:00.000Z`,
      result: { ...analysis, document: { ...analysis.document, title: `Starszy ${n}` } },
    })
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      STORAGE_KEY,
      JSON.stringify([5, 4, 3, 2, 1].map(old)),
    ] as const)
    await page.goto('./')
    await mockApi(page, success)
    await fileInput(page).setInputFiles(fixture('faktura.pdf'))
    await expect(resultTitle(page)).toBeVisible()

    const items = page.getByRole('region', { name: 'Ostatnie analizy' }).getByRole('listitem')
    await expect(items).toHaveCount(5)
    await expect(items.first()).toContainText('FAKTURA VAT nr FV/2026/09/0117')
    await expect(items.last()).toContainText('Starszy 2') // the oldest entry dropped out
  })

  test('uszkodzone dane w localStorage nie psują aplikacji', async ({ page }) => {
    await page.addInitScript(([key]) => localStorage.setItem(key, '{to nie jest JSON'), [
      STORAGE_KEY,
    ] as const)
    await page.goto('./')
    await expect(page.getByText('Nie wybrano jeszcze pliku.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Ostatnie analizy' })).toHaveCount(0)
    await mockApi(page, success)
    await fileInput(page).setInputFiles(fixture('faktura.pdf'))
    await expect(resultTitle(page)).toBeVisible()
  })
})

test.describe('pliki, których nie da się odczytać', () => {
  for (const [name, file] of [
    ['PDF zabezpieczony hasłem', 'zaszyfrowany.pdf'],
    ['uszkodzony PDF z poprawną sygnaturą', 'uszkodzony.pdf'],
  ] as const) {
    test(`${name}: komunikat bez wysyłania`, async ({ page }) => {
      const requests = await mockApi(page, success)
      await fileInput(page).setInputFiles(fixture(file))
      await expect(alert(page)).toContainText('Nie udało się odczytać pliku')
      expect(requests).toHaveLength(0)
    })
  }
})

test('błąd, którego ponowienie nie naprawi (413): bez przycisku ponowienia', async ({ page }) => {
  await mockApi(page, (route) =>
    route.fulfill({
      status: 413,
      headers: CORS,
      json: { error: 'Dokument jest za długi do analizy.' },
    }),
  )
  await fileInput(page).setInputFiles(fixture('faktura.pdf'))
  await expect(alert(page)).toContainText('Dokument jest za długi do analizy.')
  await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toHaveCount(0)
  await expect(alert(page)).toContainText('Wybierz inny plik.')
})

test('treść od modelu jest wyświetlana jako tekst, a nie wykonywana (XSS)', async ({ page }) => {
  const payload = '<img src=x onerror="window.__xss = 1">'
  await mockApi(page, (route, request) =>
    route.fulfill({
      headers: CORS,
      json: {
        result: {
          ...analysis,
          summary: `${payload} Drugie zdanie. Trzecie zdanie.`,
          keywords: [payload],
          document: {
            ...analysis.document,
            title: payload,
            fileName: request.fileName,
            pages: request.pages,
          },
        },
      },
    }),
  )
  await fileInput(page).setInputFiles(fixture('faktura.pdf'))
  await expect(resultTitle(page)).toHaveText(payload)
  await expect(page.locator('.results img')).toHaveCount(0)
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined()
})

test('długi dokument (ponad 400 tys. znaków): fragmenty równolegle, potem jedno scalenie', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const fragments = await mockApi(page, success)
  const merges: MergeRequest[] = []
  let releaseMerge: () => void = () => {}
  const mergeHeld = new Promise<void>((resolve) => (releaseMerge = resolve))
  await page.route(MERGE_API, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    const request = route.request().postDataJSON() as MergeRequest
    merges.push(request)
    await mergeHeld // released once the test has seen the merging step
    await route.fulfill({
      headers: CORS,
      json: {
        result: {
          ...analysis,
          document: {
            ...analysis.document,
            title: 'Wynik scalony',
            fileName: request.fileName,
            pages: request.pages,
          },
        },
      },
    })
  })
  await fileInput(page).setInputFiles(fixture('dlugi.pdf')) // about 700 thousand characters
  await expect(page.getByText(/Scalam wyniki fragmentów · \d+ s/)).toBeVisible({ timeout: 60_000 })
  releaseMerge()
  await expect(resultTitle(page)).toHaveText('Wynik scalony')

  expect(fragments).toHaveLength(2)
  for (const fragment of fragments) expect(fragment.text.length).toBeLessThanOrEqual(400_000)
  expect(fragments[0].text.startsWith('Warunki współpracy')).toBe(true) // the title page leads
  expect(merges).toHaveLength(1)
  expect(merges[0].parts).toHaveLength(2)
})
