import { afterEach, describe, expect, it, vi } from 'vitest'
import { modelOutputJsonSchema, type ModelOutput } from '../../src/lib/schema'
import { analyze, BUDGET_MS, mergeSummaries, ModelError } from './model'
import { MERGE_PROMPT, SYSTEM_PROMPT, wrapDocument } from './prompt'

// A model answer that passes the schema and the 3-5 sentence rule.
const VALID: ModelOutput = {
  document: { language: 'pl', type: 'inne', title: null, date: null },
  summary: 'Pierwsze zdanie. Drugie zdanie. Trzecie zdanie.',
  keyPoints: ['a', 'b', 'c'],
  entities: { organizations: [], people: [] },
  amounts: [],
  dates: [],
  keywords: ['test'],
}

// Gemini's response envelope around the text the model produced.
function geminiReply(text: string, status = 200) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('analyze', () => {
  it('retries once when the first answer fails validation and returns the second', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(geminiReply('{"summary": "nie JSON zgodny ze schematem"}'))
      .mockResolvedValueOnce(geminiReply(JSON.stringify(VALID)))
    vi.stubGlobal('fetch', fetch)

    await expect(analyze('key', 'model', 'tekst')).resolves.toMatchObject({
      summary: VALID.summary,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('skips the retry when too little of the time budget is left', async () => {
    const fetch = vi.fn().mockResolvedValue(geminiReply('to nie jest JSON'))
    vi.stubGlobal('fetch', fetch)

    // Only 5 s left: the first call may run, a retry would only end in a timeout.
    const error = await analyze('key', 'model', 'tekst', Date.now() + 5_000).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ModelError)
    expect((error as ModelError).kind).toBe('invalid_output')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('gives the first call the whole budget as its timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiReply(JSON.stringify(VALID))))

    await analyze('key', 'model', 'tekst')
    const [ms] = timeout.mock.calls[0]
    expect(ms).toBeGreaterThan(BUDGET_MS - 1_000)
    expect(ms).toBeLessThanOrEqual(BUDGET_MS)
    timeout.mockRestore()
  })

  it('maps HTTP 429 from the provider to rate_limited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiReply('', 429)))
    await expect(analyze('key', 'model', 'tekst')).rejects.toMatchObject({ kind: 'rate_limited' })
  })
})

describe('the request sent to Gemini', () => {
  it('uses the frozen text-path prompt, wrapper and schema', async () => {
    const fetch = vi.fn().mockResolvedValue(geminiReply(JSON.stringify(VALID)))
    vi.stubGlobal('fetch', fetch)
    await analyze('key', 'model', 'tekst')
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM_PROMPT)
    expect(body.contents[0].parts[0].text).toBe(wrapDocument('tekst'))
    expect(body.generationConfig.responseJsonSchema).toEqual(modelOutputJsonSchema)
  })

  it('merges summaries with the merge prompt and retries a summary that is too short', async () => {
    const short = { summary: 'Za krótko.', keyPoints: ['a', 'b', 'c'] }
    const good = { summary: 'Jedno. Dwa. Trzy.', keyPoints: ['a', 'b', 'c'] }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(geminiReply(JSON.stringify(short)))
      .mockResolvedValueOnce(geminiReply(JSON.stringify(good)))
    vi.stubGlobal('fetch', fetch)
    await expect(mergeSummaries('key', 'model', [VALID, VALID])).resolves.toMatchObject(good)
    expect(fetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(fetch.mock.calls[0][1].body)
    expect(firstBody.systemInstruction.parts[0].text).toBe(MERGE_PROMPT)
  })
})
