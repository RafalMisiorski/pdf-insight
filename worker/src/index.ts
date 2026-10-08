import { AnalyzeRequestSchema, type Analysis } from '../../src/lib/schema'
import { ModelError, analyze, type ModelErrorKind } from './model'

// Minimal shape of Cloudflare's rate-limiting binding (configured in wrangler.toml).
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

interface Env {
  GEMINI_API_KEY: string // secret: `wrangler secret put GEMINI_API_KEY`, locally from .dev.vars
  ALLOWED_ORIGIN: string // the only browser origin allowed to call this API
  MODEL: string
  MAX_TEXT_CHARS: string
  LIMITER?: RateLimiter // absent in some local setups, so the check is optional
}

const MAX_BODY_BYTES = 2_000_000

const MODEL_ERRORS: Record<ModelErrorKind, { status: number; message: string }> = {
  rate_limited: {
    status: 429,
    message: 'Usługa AI ma chwilowo za dużo zapytań. Spróbuj ponownie za minutę.',
  },
  timeout: { status: 504, message: 'Analiza trwała zbyt długo. Spróbuj ponownie.' },
  upstream: { status: 502, message: 'Usługa AI zwróciła błąd. Spróbuj ponownie.' },
  invalid_output: {
    status: 502,
    message: 'Model dwa razy zwrócił wynik niezgodny ze schematem. Spróbuj ponownie.',
  },
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS: only the demo's own origin may call the API from a browser. Not authentication:
    // a script can fake the header, which is why the rate and size limits below also exist.
    const origin = request.headers.get('Origin')
    if (origin !== env.ALLOWED_ORIGIN) {
      return json({ error: 'Niedozwolone pochodzenie żądania.' }, 403)
    }
    const cors = corsHeaders(origin)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors }) // browser preflight before the POST
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/analyze') {
      return json({ error: 'Nie znaleziono.' }, 404, cors)
    }

    // Rate limit per client IP (approximate: counted per Cloudflare location).
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) {
      return json({ error: 'Za dużo zapytań. Spróbuj ponownie za minutę.' }, 429, cors)
    }

    // Size limits: refuse a large declared body before reading it, then check what arrived.
    const tooLong = json({ error: 'Dokument jest za długi do analizy.' }, 413, cors)
    if (Number(request.headers.get('Content-Length') ?? '0') > MAX_BODY_BYTES) return tooLong
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) return tooLong

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return json({ error: 'Nieprawidłowe żądanie.' }, 400, cors)
    }
    const input = AnalyzeRequestSchema.safeParse(body)
    if (!input.success) return json({ error: 'Nieprawidłowe żądanie.' }, 400, cors)
    if (input.data.text.length > Number(env.MAX_TEXT_CHARS)) return tooLong

    try {
      const output = await analyze(env.GEMINI_API_KEY, env.MODEL, input.data.text)
      // fileName and pages are facts the app knows; the model is never asked for them.
      const result: Analysis = {
        ...output,
        document: { ...output.document, fileName: input.data.fileName, pages: input.data.pages },
      }
      return json({ result }, 200, cors)
    } catch (error) {
      if (error instanceof ModelError) {
        const { status, message } = MODEL_ERRORS[error.kind]
        return json({ error: message, details: error.details }, status, cors)
      }
      return json({ error: 'Nieoczekiwany błąd serwera.' }, 500, cors)
    }
  },
} satisfies ExportedHandler<Env>
