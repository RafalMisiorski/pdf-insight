import { describe, expect, it } from 'vitest'
import { takeSlot } from './window'

describe('takeSlot', () => {
  it('accepts up to the limit inside the window and refuses the next request', () => {
    let hits: number[] = []
    const results = Array.from({ length: 11 }, (_, i) => {
      const slot = takeSlot(hits, 1_000 + i, 10, 60_000)
      hits = slot.hits
      return slot.allowed
    })
    expect(results.slice(0, 10).every(Boolean)).toBe(true)
    expect(results[10]).toBe(false)
  })

  it('frees a slot once the oldest request leaves the window', () => {
    const full = Array.from({ length: 10 }, (_, i) => i * 1_000) // requests at 0..9 s
    expect(takeSlot(full, 59_999, 10, 60_000).allowed).toBe(false)
    const later = takeSlot(full, 60_000, 10, 60_000) // the request from 0 s has expired
    expect(later.allowed).toBe(true)
    expect(later.hits).toHaveLength(10)
  })

  it('does not record refused requests, so retrying does not extend the block', () => {
    const full = Array.from({ length: 10 }, (_, i) => i)
    expect(takeSlot(full, 100, 10, 60_000).hits).toHaveLength(10)
  })
})
