import { describe, expect, it } from 'vitest'
import { MIN_EACH, wantsParallel } from './density'

const day = (i: number) =>
  `${String((i % 28) + 1).padStart(2, '0')}.${String(Math.floor(i / 28) + 1).padStart(2, '0')}.2026`

// One line per position with a distinct amount and a distinct date, the way a schedule prints them.
function schedule(amounts: number, dates: number): string {
  return Array.from({ length: Math.max(amounts, dates) }, (_, i) =>
    [`Pozycja ${i + 1}:`, i < amounts ? `${1000 + i},50 zł` : '', i < dates ? day(i) : ''].join(
      ' ',
    ),
  ).join('\n')
}

describe('wantsParallel (docs/adr/0011)', () => {
  it('sends a text with many amounts and many dates to the parallel field groups', () => {
    expect(wantsParallel(schedule(MIN_EACH, MIN_EACH))).toBe(true)
  })

  it('keeps one call when either group is below the threshold', () => {
    expect(wantsParallel(schedule(MIN_EACH - 1, 40))).toBe(false)
    expect(wantsParallel(schedule(40, MIN_EACH - 1))).toBe(false)
  })

  it('does not count dates such as 15.12.2025 as amounts', () => {
    expect(wantsParallel(schedule(0, 40))).toBe(false)
  })

  it('counts a repeated amount once', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Rata 1 500,00 zł, termin ${day(i)}`)
    expect(wantsParallel(text.join('\n'))).toBe(false)
  })

  it('reads whole amounts with a currency and dates written in words', () => {
    const text = Array.from(
      { length: MIN_EACH },
      (_, i) => `Wpłata ${i + 2} 300 zł z dnia ${i + 1} marca 2026`,
    )
    expect(wantsParallel(text.join('\n'))).toBe(true)
  })
})
