import { mergeFacts } from '../../src/lib/merge'
import {
  AnalyzeRequestSchema,
  MAX_TEXT_CHARS,
  MergeRequestSchema,
  type Analysis,
} from '../../src/lib/schema'
import { ModelError, analyze, mergeSummaries, type ModelErrorKind } from './model'
import type { RateLimiter } from './rateLimiter'

// The Durable Object class must be exported from the Worker's main module.
export { RateLimiter } from './rateLimiter'

interface Env {
  GEMINI_API_KEY: string // secret: `wrangler secret put GEMINI_API_KEY`, locally from .dev.vars
  ALLOWED_ORIGIN: string // the only browser origin allowed to call this API
  MODEL: string
  DAILY_LIMIT: string // analyses per UTC day for the whole demo
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>
}

const MAX_BODY_BYTES = 2_000_000
const PER_IP_PER_MINUTE = 10
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

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

// Asks the Durable Object for `key` whether one more request fits into its window.
function take(env: Env, key: string, limit: number, windowMs: number): Promise<boolean> {
  return env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(key)).take(limit, windowMs)
}

// Daily cap for the whole demo, counted only for requests that would reach the model.
function withinDailyLimit(env: Env): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10) // UTC date, e.g. 2026-10-09
  return take(env, `day:${day}`, Number(env.DAILY_LIMIT), DAY_MS)
}

// Runs the model work and maps its failures to an HTTP status and a Polish message.
async function respond(
  work: () => Promise<Analysis>,
  cors: Record<string, string>,
): Promise<Response> {
  try {
    return json({ result: await work() }, 200, cors)
  } catch (error) {
    if (error instanceof ModelError) {
      const { status, message } = MODEL_ERRORS[error.kind]
      return json({ error: message, details: error.details }, status, cors)
    }
    return json({ error: 'Nieoczekiwany błąd serwera.' }, 500, cors)
  }
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
    const path = new URL(request.url).pathname
    if (request.method !== 'POST' || (path !== '/analyze' && path !== '/merge')) {
      return json({ error: 'Nie znaleziono.' }, 404, cors)
    }

    // Per-IP limit before anything else is read, so a flood costs almost nothing.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (!(await take(env, `ip:${ip}`, PER_IP_PER_MINUTE, MINUTE_MS))) {
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
    const dailyLimitReached = json(
      { error: 'Dzienny limit analiz w tym demo został wyczerpany. Spróbuj jutro.' },
      429,
      cors,
    )

    if (path === '/merge') {
      // A long document: the app sends its analysed fragments (docs/adr/0008-dlugie-dokumenty.md).
      const input = MergeRequestSchema.safeParse(body)
      if (!input.success) return json({ error: 'Nieprawidłowe żądanie.' }, 400, cors)
      if (!(await withinDailyLimit(env))) return dailyLimitReached
      const { fileName, pages, parts } = input.data
      return respond(async () => {
        const facts = mergeFacts(parts) // code merges the facts, the model only the summary
        const merged = await mergeSummaries(env.GEMINI_API_KEY, env.MODEL, parts)
        return {
          document: { ...facts.document, fileName, pages },
          summary: merged.summary,
          keyPoints: merged.keyPoints,
          entities: facts.entities,
          amounts: facts.amounts,
          dates: facts.dates,
          keywords: facts.keywords,
        }
      }, cors)
    }

    const input = AnalyzeRequestSchema.safeParse(body)
    if (!input.success) return json({ error: 'Nieprawidłowe żądanie.' }, 400, cors)
    if (input.data.text.length > MAX_TEXT_CHARS) return tooLong
    if (!(await withinDailyLimit(env))) return dailyLimitReached
    const { fileName, pages, text } = input.data
    return respond(async () => {
      const output = await analyze(env.GEMINI_API_KEY, env.MODEL, text)
      // fileName and pages are facts the app knows; the model is never asked for them.
      return { ...output, document: { ...output.document, fileName, pages } }
    }, cors)
  },
} satisfies ExportedHandler<Env>
