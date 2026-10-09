import { describe, expect, it } from 'vitest'
import { planDocument, type ReadPages } from './plan'
import { MAX_PARTS, MAX_SCAN_PAGES, MAX_TEXT_CHARS } from './schema'

type Kind = 'text' | 'image' | 'blank'

// A document as read from its pages: `kinds` says what each page holds.
function read(kinds: Kind[], pageText = 'Treść strony. '.repeat(10)): ReadPages {
  const pageTexts = kinds.map((kind) => (kind === 'text' ? pageText : ''))
  return {
    text: pageTexts.join('\n\n'),
    pageTexts,
    pagesWithoutText: kinds.flatMap((kind, index) => (kind === 'text' ? [] : [index + 1])),
    imagePages: kinds.flatMap((kind, index) => (kind === 'image' ? [index + 1] : [])),
  }
}

const pages = (count: number, kind: Kind): Kind[] => Array<Kind>(count).fill(kind)

describe('planDocument (docs/adr/0012)', () => {
  it('sends a text document that fits one request exactly as before', () => {
    const doc = read(['text', 'blank', 'text'])
    const plan = planDocument(doc)
    expect(plan.parts).toEqual([{ kind: 'text', pages: [1, 2, 3], text: doc.text }])
    expect(plan.blank).toEqual([2])
    expect(plan.skipped).toEqual([])
  })

  it('reads the pages that show only an image with OCR, next to the text, in page order', () => {
    const plan = planDocument(read(['image', 'text', 'text', 'image', 'blank']))
    expect(plan.parts.map((part) => [part.kind, part.pages])).toEqual([
      ['scan', [1, 4]],
      ['text', [2, 3, 5]],
    ])
    expect(plan.blank).toEqual([5])
  })

  it('splits a scan into batches of MAX_SCAN_PAGES pages', () => {
    const plan = planDocument(read(pages(20, 'image')))
    expect(plan.parts.map((part) => part.pages.length)).toEqual([MAX_SCAN_PAGES, MAX_SCAN_PAGES, 4])
    expect(plan.skipped).toEqual([])
  })

  it('keeps MAX_PARTS parts spread over the document, with the first and the last, and lists the rest', () => {
    const plan = planDocument(read(pages(80, 'image')))
    expect(plan.parts).toHaveLength(MAX_PARTS)
    expect(plan.parts[0].pages[0]).toBe(1)
    expect(plan.parts.at(-1)?.pages.at(-1)).toBe(80)
    expect(plan.skipped).toHaveLength(80 - MAX_PARTS * MAX_SCAN_PAGES)
  })

  it('samples a text longer than MAX_PARTS fragments evenly instead of failing', () => {
    const plan = planDocument(read(pages(10, 'text'), 'y'.repeat(MAX_TEXT_CHARS - 10)))
    expect(plan.parts).toHaveLength(MAX_PARTS)
    expect(plan.parts.every((part) => part.kind === 'text')).toBe(true)
    expect(plan.parts[0].pages).toEqual([1])
    expect(plan.parts.at(-1)?.pages).toEqual([10])
    expect(plan.skipped).toHaveLength(10 - MAX_PARTS)
  })

  it('shares the parts between text and scans when both need more than half', () => {
    const doc = read([...pages(8, 'text'), ...pages(80, 'image')], 'z'.repeat(MAX_TEXT_CHARS - 10))
    const kinds = planDocument(doc).parts.map((part) => part.kind)
    expect(kinds.filter((kind) => kind === 'text')).toHaveLength(MAX_PARTS / 2)
    expect(kinds.filter((kind) => kind === 'scan')).toHaveLength(MAX_PARTS / 2)
  })

  it('reads every page as an image when no page has text or an image (text drawn as shapes)', () => {
    const plan = planDocument(read(['blank', 'blank', 'blank']))
    expect(plan.parts).toEqual([{ kind: 'scan', pages: [1, 2, 3] }])
    expect(plan.blank).toEqual([])
  })
})
