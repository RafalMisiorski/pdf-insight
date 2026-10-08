import { describe, expect, it } from 'vitest'
import { splitIntoParts } from './chunks'

const page = (char: string, length: number) => char.repeat(length)

describe('splitIntoParts', () => {
  it('packs whole pages into fragments up to the limit, in order', () => {
    const parts = splitIntoParts([page('a', 60), page('b', 30), page('c', 50)], 100)
    expect(parts).toEqual([`${page('a', 60)}\n\n${page('b', 30)}`, page('c', 50)])
  })

  it('never returns a fragment longer than the limit', () => {
    const pages = Array.from({ length: 50 }, (_, i) => page('x', 37 + i))
    for (const part of splitIntoParts(pages, 200)) expect(part.length).toBeLessThanOrEqual(200)
  })

  it('cuts a single page longer than the limit at the last space, losing no word', () => {
    const words = Array.from({ length: 40 }, () => 'słowo').join(' ') // 239 characters
    const parts = splitIntoParts([words], 100)
    expect(parts).toHaveLength(3)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(100)
    expect(parts.join(' ')).toBe(words)
  })

  it('keeps every page: the fragments joined again give the whole text', () => {
    const pages = ['Strona pierwsza.', 'Strona druga.', 'Strona trzecia.']
    expect(splitIntoParts(pages, 20).join('\n\n')).toBe(pages.join('\n\n'))
  })
})
