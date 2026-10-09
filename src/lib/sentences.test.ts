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

  it('lets a company form written with a space ("sp. j.", "sp. k.") end a sentence', () => {
    const text =
      'Nabywcą jest Hotel Nad Zalewem sp. j. Sprzedawcą jest Ogrody Lis sp. k. ' +
      'Termin płatności to 20.10.2026 r.'
    expect(countSentences(text)).toBe(3)
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

  it('does not end a sentence at legal and reference abbreviations before a number', () => {
    expect(
      countSentences(
        'Umowa podlega przepisom art. 659 Kodeksu cywilnego. Kary określa § 9 ust. 2 umowy. ' +
          'Wynagrodzenie opisuje pkt. 3 załącznika.',
      ),
    ).toBe(3)
    expect(
      countSentences('Zgodnie z poz. 4 cennika i zał. 2 opłata rośnie. Termin to 14 dni.'),
    ).toBe(2)
  })

  it('accepts Spanish sentences that start with ¿ or ¡', () => {
    expect(countSentences('El contrato termina en 2027. ¿Quién paga? ¡El cliente paga todo!')).toBe(
      3,
    )
  })

  it('counts sentences in scripts without letter case (Japanese, Arabic)', () => {
    expect(
      countSentences(
        '契約は二年間有効です。料金は毎月払います。解約は三か月前に通知します。',
        'ja',
      ),
    ).toBe(3)
    expect(
      countSentences('العقد ساري لمدة سنتين. يدفع العميل شهريا. يمكن الإنهاء بإشعار مسبق.', 'ar'),
    ).toBe(3)
  })

  it('returns 0 for empty text', () => {
    expect(countSentences('   ')).toBe(0)
  })
})
