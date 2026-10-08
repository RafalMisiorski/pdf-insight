// Splits a long document into consecutive fragments of at most `limit` characters. Cuts fall between
// pages; only a single page longer than the limit is cut inside it, at the last space before the limit.
// Used only for text longer than one request may carry: shorter text is sent exactly as before.
export function splitIntoParts(pageTexts: string[], limit: number): string[] {
  const parts: string[] = []
  let current = ''
  for (const piece of pageTexts.flatMap((page) => cutLongPage(page, limit))) {
    const joined = current ? `${current}\n\n${piece}` : piece
    if (joined.length <= limit) {
      current = joined
      continue
    }
    parts.push(current)
    current = piece
  }
  if (current) parts.push(current)
  return parts
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
