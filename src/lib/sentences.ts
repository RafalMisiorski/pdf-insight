// Counts sentences in a summary, for the brief's "3-5 sentences" rule.
// A naive split on dots counts "sp. z o.o." as three sentences, so a dot ends a sentence only when
// the next word starts like a sentence and the word before the dot is not an abbreviation that precedes a name.

// Abbreviations that stand BEFORE a name or a number, so the next word starts with a capital or a digit
// although the sentence goes on ("ul. Kwiatowa", "dr Nowak", "art. 659", "ust. 2", "m.in. Kowalski").
// Company forms such as "sp.k.", "sp. j.", "S.A." or "Ltd." are NOT listed: they often end a sentence.
const PREFIX_ABBREVIATIONS = new Set([
  // addresses, titles and everyday Polish
  ...[
    'ul',
    'al',
    'pl',
    'os',
    'woj',
    'nr',
    'tel',
    'ok',
    'np',
    'm.in',
    'tj',
    'tzw',
    'wg',
    'zob',
    'por',
  ],
  ...['dr', 'hab', 'prof', 'mgr', 'inż', 'mec', 'adw', 'ks', 'red', 'św', 'im', 'godz', 'tys'],
  // legal and document references, followed by a number ("art. 659", "§ 9 ust. 2", "zał. 3")
  ...['art', 'ust', 'pkt', 'lit', 'poz', 'par', 'zał', 'rozdz', 'str', 'tab', 'rys', 'dz'],
  // English
  ...['mr', 'mrs', 'ms', 'no', 'vs', 'st', 'approx', 'sec', 'e.g', 'i.e', 'cf'],
])

const ENDS_WITH_TERMINAL = /[.!?]["”')]?$/
const STARTS_LIKE_SENTENCE = /^["„“'(¿¡]?[\p{Lu}\p{N}]/u

// Scripts without letter case (Chinese, Japanese, Korean, Arabic, Hebrew, Thai, Hindi) give no
// capital-letter signal, and Japanese ends sentences with "。", so there the Unicode sentence rules decide.
const CASELESS_LETTERS =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}]/gu
const CASED_LETTERS = /[\p{Lu}\p{Ll}]/gu

function isPrefixAbbreviation(word: string, previous: string | undefined): boolean {
  const core = word
    .replace(/^["„“'(]+/, '')
    .replace(/\.+$/, '')
    .toLowerCase()
  // After "sp." a single letter closes a company form ("sp. j.", "sp. k."), which can end a sentence.
  const closesCompanyForm = previous?.toLowerCase() === 'sp.'
  // Otherwise a single letter is an initial ("J. Kowalski"); "r." (roku) usually ends a sentence.
  const isInitial = /^\p{L}$/u.test(core) && core !== 'r' && !closesCompanyForm
  return PREFIX_ABBREVIATIONS.has(core) || isInitial
}

function countWithSegmenter(text: string, language?: string): number {
  const segments = new Intl.Segmenter(language, { granularity: 'sentence' }).segment(text)
  return [...segments].filter((part) => part.segment.trim().length > 0).length
}

// `language` (ISO 639-1, from the analysis) only helps the Unicode rules for caseless scripts.
export function countSentences(text: string, language?: string): number {
  const caseless = text.match(CASELESS_LETTERS)?.length ?? 0
  const cased = text.match(CASED_LETTERS)?.length ?? 0
  if (caseless > cased) return countWithSegmenter(text, language)

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
    if (word.endsWith('.') && isPrefixAbbreviation(word, words[i - 1])) continue // "ul. Kwiatowa"
    count++
  }
  // Text that does not end with punctuation still has one more sentence.
  if (!ENDS_WITH_TERMINAL.test(words[words.length - 1])) count++
  return count
}
