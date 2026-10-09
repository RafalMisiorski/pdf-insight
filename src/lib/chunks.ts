// Splits a long document into consecutive fragments of at most `limit` characters. Cuts fall between
// pages; only a single page longer than the limit is cut inside it, at the last space before the limit.
// Used only for text longer than one request may carry: shorter text is sent exactly as before.
export function splitIntoParts(pageTexts: string[], limit: number): string[] {
  const pages = pageTexts.map((text, index) => ({ page: index + 1, text }))
  return splitPages(pages, limit).map((fragment) => fragment.text)
}

export type Fragment = { pages: number[]; text: string }

// The same split over chosen pages, remembering which pages each fragment holds (docs/adr/0012).
export function splitPages(pages: { page: number; text: string }[], limit: number): Fragment[] {
  const fragments: Fragment[] = []
  let current: Fragment = { pages: [], text: '' }
  for (const { page, text } of pages) {
    for (const piece of cutLongPage(text, limit)) {
      const joined = current.text ? `${current.text}\n\n${piece}` : piece
      if (joined.length <= limit) {
        current.text = joined
        if (current.pages.at(-1) !== page) current.pages.push(page)
        continue
      }
      fragments.push(current)
      current = { pages: [page], text: piece }
    }
  }
  if (current.text) fragments.push(current)
  return fragments
}

function cutLongPage(page: string, limit: number): string[] {
  const pieces: string[] = []
  let rest = page
  while (rest.length > limit) {
    const space = rest.lastIndexOf(' ', limit)
    const cut = space > 0 ? space : limit
    pieces.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  pieces.push(rest)
  return pieces
}
