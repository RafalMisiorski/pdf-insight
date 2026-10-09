import { splitPages } from './chunks'
import { MAX_PARTS, MAX_SCAN_PAGES, MAX_TEXT_CHARS } from './schema'

// What one document becomes before it is sent (docs/adr/0012): text fragments from the pages with text
// and batches of page images for the pages that show only an image, such as scanned pages. One
// analysis has at most MAX_PARTS parts; the rest is dropped evenly across the document, always keeping
// the first part, and the dropped pages are listed with the result.
export type PlannedPart =
  { kind: 'text'; pages: number[]; text: string } | { kind: 'scan'; pages: number[] }

export type Plan = {
  parts: PlannedPart[]
  skipped: number[] // pages left out by the limit of one analysis
  blank: number[] // pages with neither text nor an image, so with nothing to read
}

export type ReadPages = {
  text: string
  pageTexts: string[]
  pagesWithoutText: number[]
  imagePages: number[]
}

export function planDocument({ text, pageTexts, pagesWithoutText, imagePages }: ReadPages): Plan {
  // A document without scanned pages that fits one request is sent exactly as before.
  if (imagePages.length === 0 && text.trim() && text.length <= MAX_TEXT_CHARS) {
    const pages = pageTexts.map((_, index) => index + 1)
    return { parts: [{ kind: 'text', pages, text }], skipped: [], blank: pagesWithoutText }
  }
  const scanned = new Set(imagePages)
  const textPages = pageTexts.flatMap((pageText, index) =>
    scanned.has(index + 1) ? [] : [{ page: index + 1, text: pageText }],
  )
  const fragments = splitPages(textPages, MAX_TEXT_CHARS).filter((fragment) => fragment.text.trim())
  // No text and no image anywhere: the text may be drawn as shapes, so every page is read as an image.
  const scanPages =
    fragments.length === 0 && imagePages.length === 0
      ? pageTexts.map((_, index) => index + 1)
      : imagePages
  const texts: PlannedPart[] = fragments.map((fragment) => ({ kind: 'text', ...fragment }))
  const scans: PlannedPart[] = chunk(scanPages, MAX_SCAN_PAGES).map((pages) => ({
    kind: 'scan',
    pages,
  }))
  // Text and scans share the parts: a side that needs fewer than half leaves the rest to the other.
  const half = Math.floor(MAX_PARTS / 2)
  const textCount = Math.min(texts.length, Math.max(half, MAX_PARTS - scans.length))
  const scanCount = Math.min(scans.length, MAX_PARTS - textCount)
  const parts = [...spread(texts, textCount), ...spread(scans, scanCount)].sort(
    (a, b) => a.pages[0] - b.pages[0],
  )
  const blank = pagesWithoutText.filter((page) => !scanPages.includes(page))
  const sent = new Set(parts.flatMap((part) => part.pages))
  const planned = new Set([...texts, ...scans].flatMap((part) => part.pages))
  const skipped = [...planned].filter((page) => !sent.has(page) && !blank.includes(page))
  return { parts, skipped: skipped.sort((a, b) => a - b), blank }
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )
}

// `count` items spread evenly over the list, the first and the last included, in their order.
function spread<T>(items: T[], count: number): T[] {
  if (count >= items.length) return items
  if (count <= 1) return items.slice(0, count)
  return Array.from(
    { length: count },
    (_, index) => items[Math.round((index * (items.length - 1)) / (count - 1))],
  )
}
