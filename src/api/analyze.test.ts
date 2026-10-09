import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeDocument, analyzeJob, type AnalysisJob } from './analyze'

const REQUEST = { fileName: 'a.pdf', pages: 1, text: 'tekst' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('analyzeDocument', () => {
  it('turns a stalled request into a timeout message that allows a retry', async () => {
    // A fetch that never answers and only reacts to the abort signal, like a dead connection.
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    await expect(analyzeDocument(REQUEST, 20)).rejects.toMatchObject({
      message: 'Analiza trwa zbyt długo. Spróbuj ponownie.',
      retryable: true,
    })
  })

  it('shows the Worker message and offers no retry for a document that is too long', async () => {
    const reply = Response.json({ error: 'Dokument jest za długi do analizy.' }, { status: 413 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply))
    await expect(analyzeDocument(REQUEST)).rejects.toMatchObject({
      message: 'Dokument jest za długi do analizy.',
      retryable: false,
    })
  })

  it('allows a retry after a rate limit', async () => {
    const reply = Response.json({ error: 'Za dużo zapytań.' }, { status: 429 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply))
    await expect(analyzeDocument(REQUEST)).rejects.toMatchObject({ retryable: true })
  })
})

describe('analyzeJob (docs/adr/0012)', () => {
  const RESULT = {
    document: {
      language: 'pl',
      type: 'faktura',
      title: 'FAKTURA VAT nr FV/2026/09/0117',
      date: '2026-09-15',
      fileName: 'T01_faktura_pl.pdf',
      pages: 1,
    },
    summary:
      'Dokument to faktura VAT nr FV/2026/09/0117 wystawiona 15 września 2026 roku w Gdyni przez firmę Bursztynowa Drukarnia sp. z o.o. Nabywcą usług jest Pracownia Architektoniczna Lis i Wspólnicy sp.k. z Krakowa. Przedmiotem zamówienia był druk 500 sztuk katalogów A4 oraz projekt graficzny okładki na łączną kwotę brutto 6 150,00 PLN. Płatność ma zostać uregulowana przelewem bankowym w terminie do 29 września 2026 roku.',
    keyPoints: [
      'Faktura VAT nr FV/2026/09/0117 wystawiona dnia 15.09.2026 r.',
      'Sprzedawca: Bursztynowa Drukarnia sp. z o.o., Nabywca: Pracownia Architektoniczna Lis i Wspólnicy sp.k.',
      'Pozycje faktury obejmują druk 500 sztuk katalogów A4 oraz projekt graficzny okładki',
    ],
    entities: { organizations: [], people: [] },
    amounts: [],
    dates: [],
    keywords: ['faktura VAT', 'druk katalogów'],
  }
  type Sent = { path: string; body: Record<string, unknown> }

  // The Worker stand-in: every request is recorded; `fails` decides which ones answer with an error.
  function worker(fails: (sent: Sent) => boolean = () => false): Sent[] {
    const sent: Sent[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const request = {
        path: `/${url.split('/').at(-1)}`, // the API address is empty in unit tests
        body: JSON.parse(String(init.body)),
      }
      sent.push(request)
      if (fails(request)) return Response.json({ error: 'Błąd.', retryable: true }, { status: 503 })
      return Response.json({ result: RESULT })
    })
    return sent
  }

  const job = (parts: AnalysisJob['parts']): AnalysisJob => ({
    fileName: 'a.pdf',
    pages: 3,
    parts,
    skipped: [],
    blank: [],
  })

  it('sends a single part exactly as before: no shared budget and no page lists', async () => {
    const sent = worker()
    const result = await analyzeJob(job([{ kind: 'text', pages: [1, 2, 3], text: 'tekst' }]))
    expect(sent).toEqual([
      { path: '/analyze', body: { fileName: 'a.pdf', pages: 3, text: 'tekst' } },
    ])
    expect(result.meta).toBeUndefined()
  })

  it('analyses text and scanned pages in parallel, merges them and says which pages were read with OCR', async () => {
    const sent = worker()
    const result = await analyzeJob(
      job([
        { kind: 'text', pages: [1, 2], text: 'tekst' },
        { kind: 'scan', pages: [3], images: ['obraz'] },
      ]),
    )
    expect(sent.map((request) => request.path)).toEqual(['/analyze', '/analyze-scan', '/merge'])
    expect(result.meta).toEqual({ pagesOcr: [3] })
  })

  it('lists the pages of a failed part instead of failing the whole document', async () => {
    worker(
      (request) => request.path === '/analyze-scan' && request.body.images?.toString() === 'zły',
    )
    const result = await analyzeJob(
      job([
        { kind: 'text', pages: [1], text: 'tekst' },
        { kind: 'scan', pages: [2], images: ['zły'] },
        { kind: 'scan', pages: [3], images: ['dobry'] },
      ]),
    )
    expect(result.meta).toEqual({ pagesOcr: [3], pagesFailed: [2] })
  })

  it('fails only when no part could be analysed', async () => {
    worker(() => true)
    const parts: AnalysisJob['parts'] = [
      { kind: 'text', pages: [1], text: 'tekst' },
      { kind: 'scan', pages: [2], images: ['obraz'] },
    ]
    await expect(analyzeJob(job(parts))).rejects.toMatchObject({ retryable: true })
  })
})
