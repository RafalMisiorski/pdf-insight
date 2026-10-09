import { describe, expect, it } from 'vitest'
import {
  AnalysisSchema,
  AnalyzeRequestSchema,
  checkModelOutput,
  MAX_SCAN_PAGES,
  MergeRequestSchema,
  ScanRequestSchema,
} from './schema'

const valid = {
  document: { language: 'pl', type: 'faktura', title: 'Faktura VAT nr 1/2026', date: '2026-09-15' },
  summary:
    'Firma Alfa wystawiła fakturę dla firmy Beta. Faktura dotyczy druku katalogów. Do zapłaty jest 6150 zł.',
  keyPoints: ['Druk katalogów', 'Projekt okładki', 'Termin płatności 29.09.2026'],
  entities: { organizations: ['Alfa sp. z o.o.'], people: [] },
  amounts: [{ value: 6150, currency: 'PLN', context: 'do zapłaty' }],
  dates: [{ date: '2026-09-29', context: 'termin płatności' }],
  keywords: ['faktura'],
}

describe('checkModelOutput', () => {
  it('accepts a valid answer', () => {
    expect(checkModelOutput(valid).ok).toBe(true)
  })

  it('accepts extra fields, because the brief allows adding fields', () => {
    expect(checkModelOutput({ ...valid, meta: { model: 'x' } }).ok).toBe(true)
  })

  it('accepts null for a missing title and date ("the model does not guess")', () => {
    const answer = { ...valid, document: { ...valid.document, title: null, date: null } }
    expect(checkModelOutput(answer).ok).toBe(true)
  })

  it('rejects a document type outside the enum', () => {
    const answer = { ...valid, document: { ...valid.document, type: 'list' } }
    expect(checkModelOutput(answer).ok).toBe(false)
  })

  it('rejects dates that are not ISO 8601 and currencies that are not ISO 4217', () => {
    expect(checkModelOutput({ ...valid, dates: [{ date: '29.09.2026', context: 'x' }] }).ok).toBe(
      false,
    )
    expect(
      checkModelOutput({ ...valid, amounts: [{ value: 1, currency: 'zł', context: 'x' }] }).ok,
    ).toBe(false)
  })

  it('rejects a missing required field', () => {
    const withoutKeywords: Record<string, unknown> = { ...valid }
    delete withoutKeywords.keywords
    expect(checkModelOutput(withoutKeywords).ok).toBe(false)
  })

  it('rejects a summary outside 3-5 sentences', () => {
    expect(checkModelOutput({ ...valid, summary: 'Jedno zdanie.' }).ok).toBe(false)
  })

  it('rejects text that is not JSON at all', () => {
    expect(checkModelOutput(undefined).ok).toBe(false)
  })
})

describe('AnalysisSchema', () => {
  it('requires fileName and pages on the final result', () => {
    expect(AnalysisSchema.safeParse(valid).success).toBe(false)
    const full = { ...valid, document: { ...valid.document, fileName: 'a.pdf', pages: 1 } }
    expect(AnalysisSchema.safeParse(full).success).toBe(true)
  })
})

describe('AnalysisSchema drops what the model added', () => {
  it('removes unknown fields at every level and keeps our own meta', () => {
    const full = {
      ...valid,
      document: { ...valid.document, fileName: 'a.pdf', pages: 1, note: 'x' },
      payment: 'Zapłać na konto 00 1234',
      amounts: [{ value: 6150, currency: 'PLN', context: 'do zapłaty', iban: 'PL00' }],
      meta: { source: 'ocr', pagesAnalyzed: 1 },
    }
    const parsed = AnalysisSchema.parse(full)
    expect(parsed).not.toHaveProperty('payment')
    expect(parsed.document).not.toHaveProperty('note')
    expect(parsed.amounts[0]).not.toHaveProperty('iban')
    expect(parsed.meta).toEqual({ source: 'ocr', pagesAnalyzed: 1 })
  })
})

describe('checkModelOutput edge cases', () => {
  it('rejects 2 and 8 key points and accepts 3 and 7', () => {
    for (const [count, ok] of [
      [2, false],
      [3, true],
      [7, true],
      [8, false],
    ] as const) {
      const keyPoints = Array.from({ length: count }, (_, i) => `Punkt ${i + 1}`)
      expect(checkModelOutput({ ...valid, keyPoints }).ok).toBe(ok)
    }
  })

  it('rejects an amount given as text and a missing nested field', () => {
    expect(
      checkModelOutput({ ...valid, amounts: [{ value: '6150', currency: 'PLN', context: 'x' }] })
        .ok,
    ).toBe(false)
    expect(checkModelOutput({ ...valid, entities: { organizations: [] } }).ok).toBe(false)
  })

  it('accepts only a two-letter lowercase language code', () => {
    for (const language of ['PL', 'pol', 'pl-PL']) {
      expect(checkModelOutput({ ...valid, document: { ...valid.document, language } }).ok).toBe(
        false,
      )
    }
  })
})

describe('request schemas', () => {
  it('rejects empty text and zero pages', () => {
    expect(AnalyzeRequestSchema.safeParse({ fileName: 'a.pdf', pages: 1, text: '' }).success).toBe(
      false,
    )
    expect(AnalyzeRequestSchema.safeParse({ fileName: 'a.pdf', pages: 0, text: 'x' }).success).toBe(
      false,
    )
  })

  it('limits a scan to MAX_SCAN_PAGES images and a merge to 2..MAX_PARTS fragments', () => {
    const images = (n: number) => Array.from({ length: n }, () => 'AAAA')
    expect(
      ScanRequestSchema.safeParse({ fileName: 'a.pdf', pages: 9, images: images(MAX_SCAN_PAGES) })
        .success,
    ).toBe(true)
    expect(
      ScanRequestSchema.safeParse({
        fileName: 'a.pdf',
        pages: 9,
        images: images(MAX_SCAN_PAGES + 1),
      }).success,
    ).toBe(false)
    expect(
      MergeRequestSchema.safeParse({ fileName: 'a.pdf', pages: 3, parts: [valid] }).success,
    ).toBe(false)
    expect(
      MergeRequestSchema.safeParse({ fileName: 'a.pdf', pages: 3, parts: [valid, valid] }).success,
    ).toBe(true)
  })
})
