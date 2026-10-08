import { describe, expect, it } from 'vitest'
import { countSentences } from './sentences'

describe('countSentences', () => {
  it('does not split inside "sp. z o.o." and counts a company form that ends a sentence', () => {
    const text =
      'Faktura wystawiona przez Bursztynowa Drukarnia sp. z o.o. dla firmy Lis i Wspólnicy sp.k. ' +
      'Obejmuje druk katalogów. Do zapłaty jest 6 150,00 zł do 29.09.2026 r.'
    expect(countSentences(text)).toBe(3)
  })

  it('does not split after abbreviations that precede a name or a number', () => {
    expect(
      countSentences(
        'Lokal przy ul. Ogrodowej 3 wynajęto. Czynsz to ok. 6 800 zł. Kaucja jest zwrotna.',
      ),
    ).toBe(3)
    expect(
      countSentences('Szkolenie poprowadzi dr Nowak, m.in. Kowalski też. Rabat wynosi 10%.'),
    ).toBe(2)
  })

  it('treats a single letter before a dot as an initial', () => {
    expect(
      countSentences(
        'Najemcą jest J. Wrona. Okres najmu to trzy lata. Czynsz płatny jest co miesiąc.',
      ),
    ).toBe(3)
  })

  it('counts English text and a last sentence without final punctuation', () => {
    expect(
      countSentences(
        'Revenue reached EUR 4,850,000. Costs fell at Baltic Fresh Foods Ltd. Review in December',
      ),
    ).toBe(3)
  })

  it('known limitation: a single letter before a dot counts as an initial, not a sentence end', () => {
    // "dla firmy B." looks exactly like "J. Wrona"; initials win, so the two sentences count as one.
    expect(countSentences('Faktura dla firmy B. Termin płatności to 14 dni.')).toBe(1)
  })

  it('returns 0 for empty text', () => {
    expect(countSentences('   ')).toBe(0)
  })
})
