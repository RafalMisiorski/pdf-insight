import { describe, expect, it } from 'vitest'
import { mergeFacts } from './merge'
import type { ModelOutput } from './schema'

const part = (overrides: Partial<ModelOutput>): ModelOutput => ({
  document: { language: 'pl', type: 'umowa', title: null, date: null },
  summary: 'Jedno. Dwa. Trzy.',
  keyPoints: ['a', 'b', 'c'],
  entities: { organizations: [], people: [] },
  amounts: [],
  dates: [],
  keywords: [],
  ...overrides,
})

describe('mergeFacts', () => {
  it('joins the facts of all fragments in order and drops only exact duplicates', () => {
    const merged = mergeFacts([
      part({
        entities: { organizations: ['Kwadrat sp. z o.o.'], people: ['Jan Nowak'] },
        amounts: [{ value: 100, currency: 'PLN', context: 'Opłata' }],
        keywords: ['umowa'],
      }),
      part({
        entities: { organizations: ['kwadrat sp. z o.o.', 'Trójkąt S.A.'], people: ['Ewa Lis'] },
        amounts: [
          { value: 100, currency: 'PLN', context: 'opłata' },
          { value: 100, currency: 'PLN', context: 'Kara umowna' },
        ],
        keywords: ['Umowa', 'kara'],
      }),
    ])
    expect(merged.entities.organizations).toEqual(['Kwadrat sp. z o.o.', 'Trójkąt S.A.'])
    expect(merged.entities.people).toEqual(['Jan Nowak', 'Ewa Lis'])
    // The same value in another context is another fact, so it stays.
    expect(merged.amounts).toEqual([
      { value: 100, currency: 'PLN', context: 'Opłata' },
      { value: 100, currency: 'PLN', context: 'Kara umowna' },
    ])
    expect(merged.keywords).toEqual(['umowa', 'kara'])
  })

  it('takes the document data from the first fragment and fills a missing title or date', () => {
    const merged = mergeFacts([
      part({ document: { language: 'pl', type: 'umowa', title: 'Umowa 7/2026', date: null } }),
      part({ document: { language: 'pl', type: 'inne', title: 'Załącznik', date: '2026-10-01' } }),
    ])
    expect(merged.document).toEqual({
      language: 'pl',
      type: 'umowa',
      title: 'Umowa 7/2026',
      date: '2026-10-01',
    })
  })
})
