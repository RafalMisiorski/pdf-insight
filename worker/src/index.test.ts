import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { clientKey, type Env } from './index'

const ORIGIN = 'https://app.test'
const VALID_OUTPUT = {
  document: { language: 'pl', type: 'inne', title: null, date: null },
  summary: 'Pierwsze zdanie. Drugie zdanie. Trzecie zdanie.',
  keyPoints: ['a', 'b', 'c'],
  entities: { organizations: [], people: [] },
  amounts: [],
  dates: [],
  keywords: ['test'],
}
const ANALYZE_BODY = JSON.stringify({ fileName: 'a.pdf', pages: 1, text: 'Treść dokumentu.' })

// Durable Object stand-in: `deny` lists the key prefixes whose limit is used up.
function limiter(deny: string[]) {
  return {
    idFromName: (name: string) => name,
    get: (id: string) => ({ take: async () => !deny.some((prefix) => id.startsWith(prefix)) }),
  } as unknown as Env['RATE_LIMITER']
}

type Call = { origin?: string | null; method?: string; body?: string }

function call(
  path: string,
  { origin = ORIGIN, method = 'POST', body }: Call = {},
  deny: string[] = [],
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': '1.2.3.4',
  }
  if (origin) headers.Origin = origin
  const env: Env = {
    GEMINI_API_KEY: 'key',
    ALLOWED_ORIGIN: ORIGIN,
    MODEL: 'model',
    DAILY_LIMIT: '200',
    IP_DAILY_LIMIT: '40',
    RATE_LIMITER: limiter(deny),
  }
  return worker.fetch(new Request(`https://api.test${path}`, { method, headers, body }), env)
}

const geminiAnswer = (output: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }),
  )

type Body = {
  retryable?: boolean
  result?: Record<string, unknown> & { document: Record<string, unknown> }
}
const read = async (res: Response) => (await res.json()) as Body

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Worker HTTP layer', () => {
  it('refuses a foreign or missing Origin before anything else', async () => {
    const model = vi.fn()
    vi.stubGlobal('fetch', model)
    expect(
      (await call('/analyze', { origin: 'https://evil.test', body: ANALYZE_BODY })).status,
    ).toBe(403)
    expect((await call('/analyze', { origin: null, body: ANALYZE_BODY })).status).toBe(403)
    expect(model).not.toHaveBeenCalled()
  })

  it('answers the CORS preflight and refuses unknown paths', async () => {
    const preflight = await call('/analyze', { method: 'OPTIONS' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect((await call('/nope', { body: '{}' })).status).toBe(404)
  })

  it('applies the per-IP minute limit before reading the body', async () => {
    const model = vi.fn()
    vi.stubGlobal('fetch', model)
    const res = await call('/analyze', { body: ANALYZE_BODY }, ['ip:'])
    expect(res.status).toBe(429)
    expect(await read(res)).toMatchObject({ retryable: true })
    expect(model).not.toHaveBeenCalled()
  })

  it('counts the body limit in bytes, also without Content-Length', async () => {
    // 1.05 million characters but 2.1 MB in UTF-8: a character count would let it through.
    const body = JSON.stringify({
      fileName: 'a.pdf',
      pages: 1,
      text: 'x',
      pad: 'ż'.repeat(1_050_000),
    })
    expect((await call('/analyze', { body })).status).toBe(413)
  })

  it('rejects bad JSON and an invalid request with 400', async () => {
    expect((await call('/analyze', { body: '{nie json' })).status).toBe(400)
    expect((await call('/analyze', { body: JSON.stringify({ fileName: 'a.pdf' }) })).status).toBe(
      400,
    )
  })

  it('stops at an exhausted daily limit (per IP or for the demo) without calling the model', async () => {
    const model = vi.fn()
    vi.stubGlobal('fetch', model)
    for (const prefix of ['ipday:', 'day:']) {
      const res = await call('/analyze', { body: ANALYZE_BODY }, [prefix])
      expect(res.status).toBe(429)
      expect(await read(res)).toMatchObject({ retryable: false })
    }
    expect(model).not.toHaveBeenCalled()
  })

  it('returns fileName and pages from the request and drops a field the model added', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(geminiAnswer({ ...VALID_OUTPUT, payment: 'konto 00 1234' })),
    )
    const res = await call('/analyze', {
      body: JSON.stringify({ fileName: 'umowa.pdf', pages: 3, text: 'Treść.' }),
    })
    expect(res.status).toBe(200)
    const { result } = await read(res)
    expect(result?.document).toMatchObject({ fileName: 'umowa.pdf', pages: 3 })
    expect(result).not.toHaveProperty('payment')
  })

  it('maps a provider refusal to a non-retryable 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })))
    const res = await call('/analyze', { body: ANALYZE_BODY })
    expect(res.status).toBe(503)
    expect(await read(res)).toMatchObject({ retryable: false })
  })

  it('merges fragments: facts by code, one model call for the summary', async () => {
    const model = vi
      .fn()
      .mockResolvedValue(geminiAnswer({ summary: 'Jedno. Dwa. Trzy.', keyPoints: ['a', 'b', 'c'] }))
    vi.stubGlobal('fetch', model)
    const parts = [
      { ...VALID_OUTPUT, keywords: ['umowa'] },
      { ...VALID_OUTPUT, keywords: ['Umowa', 'kara'] },
    ]
    const res = await call('/merge', {
      body: JSON.stringify({ fileName: 'a.pdf', pages: 9, parts, budgetMs: 6_000 }),
    })
    expect(res.status).toBe(200)
    const { result } = await read(res)
    expect(result).toMatchObject({ summary: 'Jedno. Dwa. Trzy.', keywords: ['umowa', 'kara'] })
    expect(model).toHaveBeenCalledTimes(1)
  })

  // Fifteen distinct amounts and dates: the threshold of the gate (docs/adr/0011).
  const DENSE_TEXT = Array.from(
    { length: 15 },
    (_, i) => `Rata ${i + 1}: ${1000 + i},50 zł, termin ${String(i + 1).padStart(2, '0')}.03.2026`,
  ).join('\n')

  it('sends a text with many amounts and many dates in three parallel field groups', async () => {
    const model = vi.fn(async () => geminiAnswer(VALID_OUTPUT)) // a new Response for every call
    vi.stubGlobal('fetch', model)
    const body = JSON.stringify({ fileName: 'a.pdf', pages: 1, text: DENSE_TEXT })
    expect((await call('/analyze', { body })).status).toBe(200)
    expect(model).toHaveBeenCalledTimes(3)
  })

  it('does not let a client choose the path outside local experiments', async () => {
    const model = vi.fn(async () => geminiAnswer(VALID_OUTPUT))
    vi.stubGlobal('fetch', model)
    const light = JSON.stringify({ fileName: 'a.pdf', pages: 1, text: 'Treść.', mode: 'parallel' })
    expect((await call('/analyze', { body: light })).status).toBe(200)
    expect(model).toHaveBeenCalledTimes(1) // a light text stays one call
    const dense = JSON.stringify({ fileName: 'a.pdf', pages: 1, text: DENSE_TEXT, mode: 'single' })
    expect((await call('/analyze', { body: dense })).status).toBe(200)
    expect(model).toHaveBeenCalledTimes(4) // and a dense one still gets three
  })
})

describe('limits', () => {
  it('count an IPv4 address alone and IPv6 addresses by their /64 network', () => {
    expect(clientKey('1.2.3.4')).toBe('1.2.3.4')
    expect(clientKey('2001:db8:1:2::1')).toBe(clientKey('2001:0db8:1:2:ffff:0:0:9'))
    expect(clientKey('2001:db8:1:2::1')).not.toBe(clientKey('2001:db8:1:3::1'))
    expect(clientKey('::ffff:1.2.3.4')).toBe('1.2.3.4')
    expect(clientKey(null)).toBe('unknown')
  })

  it('refuse a merge whose parts carry an oversized summary', async () => {
    const part = { ...VALID_OUTPUT, summary: 'Zdanie. '.repeat(500) } // 4000 characters
    const body = JSON.stringify({ fileName: 'a.pdf', pages: 2, parts: [part, part] })
    expect((await call('/merge', { body })).status).toBe(400)
  })
})
