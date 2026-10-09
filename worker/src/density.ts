// Decides whether the answer will be long enough, and split between amounts and dates evenly enough,
// for parallel field groups to shorten it (docs/adr/0011). It only counts patterns in the text, so it
// costs no model call.

// Amounts: a number with two decimals ("12 345,50", "1.234,56", "1,234.56") or a whole number with a
// currency ("1 500 zł"). The lookarounds keep dates such as 15.12.2025 out of the count.
const AMOUNT =
  /(?<![\d.,])(?:\d{1,3}(?:[ \u00a0.,]\d{3})+|\d+)[.,]\d{2}(?![.,]?\d)|(?<![\d.,])\d+(?:[ \u00a0]\d{3})*\s?(?:zł|pln|eur|usd|gbp|€)/gi

// Dates: 15.12.2025, 15/12/2025, 2025-12-15, "15 grudnia 2025" and "15 December 2025".
const DATE =
  /\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/gi

// From docs/adr/0010: with fewer distinct amounts or dates one call is fast enough, and when one of the
// two groups is small, splitting does not shorten the longest part of the answer.
export const MIN_EACH = 15

// True as soon as the text holds `n` distinct matches. Stopping early keeps a long text full of amounts
// far below the 10 ms of CPU a free-plan Worker gets per request.
function hasDistinct(text: string, pattern: RegExp, n: number): boolean {
  const seen = new Set<string>()
  for (const match of text.matchAll(pattern)) {
    seen.add(match[0].replace(/\s/g, '').toLowerCase())
    if (seen.size >= n) return true
  }
  return false
}

export function wantsParallel(text: string): boolean {
  return hasDistinct(text, AMOUNT, MIN_EACH) && hasDistinct(text, DATE, MIN_EACH)
}
