import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeDocument } from './analyze'

const REQUEST = { fileName: 'a.pdf', pages: 1, text: 'tekst' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('analyzeDocument', () => {
  it('turns a stalled request into a timeout message that allows a retry', async () => {
    // A fetch that never answers and only reacts to the abort signal, like a dead connection.
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    await expect(analyzeDocument(REQUEST, 20)).rejects.toMatchObject({
      message: 'Analiza trwa zbyt długo. Spróbuj ponownie.',
      retryable: true,
    })
  })

  it('shows the Worker message and offers no retry for a document that is too long', async () => {
    const reply = Response.json({ error: 'Dokument jest za długi do analizy.' }, { status: 413 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply))
    await expect(analyzeDocument(REQUEST)).rejects.toMatchObject({
      message: 'Dokument jest za długi do analizy.',
      retryable: false,
    })
  })

  it('allows a retry after a rate limit', async () => {
    const reply = Response.json({ error: 'Za dużo zapytań.' }, { status: 429 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply))
    await expect(analyzeDocument(REQUEST)).rejects.toMatchObject({ retryable: true })
  })
})
