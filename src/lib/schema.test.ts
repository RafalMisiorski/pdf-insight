import { describe, expect, it } from 'vitest'
import { AnalysisSchema, checkModelOutput } from './schema'

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
