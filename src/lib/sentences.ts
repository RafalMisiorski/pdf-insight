// Counts sentences in a summary, for the brief's "3-5 sentences" rule.
// A naive split on dots counts "sp. z o.o." as three sentences, so a dot ends a sentence only when
// the next word starts like a sentence and the word before the dot is not an abbreviation that precedes a name.

// Abbreviations that stand BEFORE a name or a number, so the next word starts with a capital or a digit
// although the sentence goes on ("ul. Kwiatowa", "dr Nowak", "ok. 120 osób", "m.in. Kowalski").
// Company forms such as "sp.k.", "S.A." or "Ltd." are NOT listed: they often end a sentence.
const PREFIX_ABBREVIATIONS = new Set([
  'ul',
  'al',
  'pl',
  'nr',
  'tel',
  'ok',
  'np',
  'm.in',
  'tj',
  'tzw',
  'dr',
  'prof',
  'mgr',
  'inż',
  'św',
  'godz',
  'mr',
  'mrs',
  'ms',
  'no',
  'vs',
  'st',
  'approx',
])

const ENDS_WITH_TERMINAL = /[.!?]["”')]?$/
const STARTS_LIKE_SENTENCE = /^["„“'(]?[\p{Lu}\p{N}]/u

function isPrefixAbbreviation(word: string): boolean {
  const core = word
    .replace(/^["„“'(]+/, '')
    .replace(/\.+$/, '')
    .toLowerCase()
  // A single letter is an initial ("J. Kowalski"); "r." (roku) is left out because it usually ends a sentence.
  const isInitial = /^\p{L}$/u.test(core) && core !== 'r'
  return PREFIX_ABBREVIATIONS.has(core) || isInitial
}

export function countSentences(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 0
  let count = 0
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const next = words[i + 1]
    if (!ENDS_WITH_TERMINAL.test(word)) continue
    if (next === undefined) {
      count++ // the last word closes the last sentence
      continue
    }
    if (!STARTS_LIKE_SENTENCE.test(next)) continue // "sp. z o.o. z siedzibą"
    if (word.endsWith('.') && isPrefixAbbreviation(word)) continue // "ul. Kwiatowa"
    count++
  }
  // Text that does not end with punctuation still has one more sentence.
  if (!ENDS_WITH_TERMINAL.test(words[words.length - 1])) count++
  return count
}
