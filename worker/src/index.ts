import { mergeFacts } from '../../src/lib/merge'
import { wantsParallel } from './density'
import {
  AnalysisSchema,
  AnalyzeRequestSchema,
  MAX_TEXT_CHARS,
  MergeRequestSchema,
  ScanRequestSchema,
  type Analysis,
  type Meta,
} from '../../src/lib/schema'
import {
  BUDGET_MS,
  ModelError,
  analyze,
  analyzeParallel,
  analyzeScan,
  mergeSummaries,
  type ModelErrorKind,
} from './model'
import type { RateLimiter } from './rateLimiter'

// The Durable Object class must be exported from the Worker's main module.
export { RateLimiter } from './rateLimiter'

export interface Env {
  GEMINI_API_KEY: string // secret: `wrangler secret put GEMINI_API_KEY`, locally from .dev.vars
  ALLOWED_ORIGIN: string // the only browser origin allowed to call this API
  MODEL: string
  DAILY_LIMIT: string // analysed requests per UTC day for the whole demo (one makes up to 6 model calls)
  IP_DAILY_LIMIT: string // analysed requests per UTC day from one client (see clientKey)
  ALLOW_EXPERIMENTS?: string // '1' only in local runs: lets `mode` force one path for an A/B
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>
}

const MAX_BODY_BYTES = 2_000_000
const MAX_SCAN_BODY_BYTES = 6_000_000 // page images of a scan (docs/adr/0009-ocr-skanow.md)
const PATHS = new Set(['/analyze', '/merge', '/analyze-scan'])
const PER_IP_PER_MINUTE = 10
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

// `retryable` tells the app whether "Spróbuj ponownie" can help with this error.
const MODEL_ERRORS: Record<
  ModelErrorKind,
  { status: number; message: string; retryable: boolean }
> = {
  rate_limited: {
    status: 429,
    message: 'Usługa AI ma chwilowo za dużo zapytań. Spróbuj ponownie za minutę.',
    retryable: true,
  },
  timeout: {
    status: 504,
    message: 'Analiza trwała zbyt długo. Spróbuj ponownie.',
    retryable: true,
  },
  upstream: { status: 502, message: 'Usługa AI zwróciła błąd. Spróbuj ponownie.', retryable: true },
  invalid_output: {
    status: 502,
    message: 'Model dwa razy zwrócił wynik niezgodny ze schematem. Spróbuj ponownie.',
    retryable: true,
  },
  rejected: {
    status: 503,
    message: 'Usługa AI odrzuciła zapytanie albo jest niedostępna dla tego demo. Spróbuj później.',
    retryable: false,
  },
  blocked: {
    status: 422,
    message: 'Usługa AI odmówiła analizy tego dokumentu (filtr bezpieczeństwa dostawcy).',
    retryable: false,
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

function fail(
  message: string,
  status: number,
  retryable: boolean,
  cors: Record<string, string> = {},
) {
  return json({ error: message, retryable }, status, cors)
}

// Asks the Durable Object for `key` whether one more request fits into its window.
function take(env: Env, key: string, limit: number, windowMs: number): Promise<boolean> {
  return env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(key)).take(limit, windowMs)
}

// Daily limits, counted only for requests that would reach the model: one IP address cannot use up the
// whole demo, and the demo as a whole cannot use up the prepaid model budget (docs/adr/0007).
async function dailyLimitError(env: Env, ip: string, cors: Record<string, string>) {
  const day = new Date().toISOString().slice(0, 10) // UTC date, e.g. 2026-10-09
  if (!(await take(env, `ipday:${ip}:${day}`, Number(env.IP_DAILY_LIMIT), DAY_MS))) {
    return fail('Wykorzystano dzienny limit analiz z tego adresu. Spróbuj jutro.', 429, false, cors)
  }
  if (!(await take(env, `day:${day}`, Number(env.DAILY_LIMIT), DAY_MS))) {
    return fail(
      'Dzienny limit analiz w tym demo został wyczerpany. Spróbuj jutro.',
      429,
      false,
      cors,
    )
  }
  return null
}

// Runs the model work and maps its failures to an HTTP status and a Polish message. The result goes
// through the strict schema on the way out: only the brief's fields and our own meta leave the Worker.
async function respond(work: () => Promise<Analysis>, cors: Record<string, string>) {
  try {
    return json({ result: AnalysisSchema.parse(await work()) }, 200, cors)
  } catch (error) {
    if (error instanceof ModelError) {
      const { status, message, retryable } = MODEL_ERRORS[error.kind]
      return json({ error: message, retryable, details: error.details }, status, cors)
    }
    return fail('Nieoczekiwany błąd serwera.', 500, true, cors)
  }
}

// The client the limits count: an IPv4 address, or the /64 network of an IPv6 address, because one user
// usually gets a whole /64 and could otherwise pass the limits by changing the last part of the address.
export function clientKey(ip: string | null): string {
  if (!ip) return 'unknown'
  if (!ip.includes(':')) return ip
  const last = ip.split(':').at(-1) ?? ''
  if (last.includes('.')) return last // an IPv4 address written as IPv6 (::ffff:1.2.3.4)
  const [head, tail = ''] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const zeros = Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0')
  const groups = [...left, ...zeros, ...right].slice(0, 4)
  return `${groups.map((group) => group.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`
}

// The time a request may use: the budget the app passed (time left for a long document), at most 27 s.
const deadlineFor = (budgetMs: number | undefined) =>
  Date.now() + Math.min(BUDGET_MS, budgetMs ?? BUDGET_MS)

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS: only the demo's own origin may call the API from a browser. Not authentication:
    // a script can fake the header, which is why the rate and size limits below also exist.
    const origin = request.headers.get('Origin')
    if (origin !== env.ALLOWED_ORIGIN) return fail('Niedozwolone pochodzenie żądania.', 403, false)
    const cors = corsHeaders(origin)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors }) // browser preflight before the POST
    }
    const path = new URL(request.url).pathname
    if (request.method !== 'POST' || !PATHS.has(path))
      return fail('Nie znaleziono.', 404, false, cors)

    // Per-IP limit before anything else is read, so a flood costs almost nothing.
    const ip = clientKey(request.headers.get('CF-Connecting-IP'))
    if (!(await take(env, `ip:${ip}`, PER_IP_PER_MINUTE, MINUTE_MS))) {
      return fail('Za dużo zapytań. Spróbuj ponownie za minutę.', 429, true, cors)
    }

    // Size limits in bytes: refuse a large declared body before reading it, then check what arrived.
    const tooLong = fail('Dokument jest za długi do analizy.', 413, false, cors)
    const maxBody = path === '/analyze-scan' ? MAX_SCAN_BODY_BYTES : MAX_BODY_BYTES
    if (Number(request.headers.get('Content-Length') ?? '0') > maxBody) return tooLong
    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > maxBody) return tooLong

    let body: unknown
    try {
      body = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return fail('Nieprawidłowe żądanie.', 400, false, cors)
    }
    const badRequest = fail('Nieprawidłowe żądanie.', 400, false, cors)

    if (path === '/analyze-scan') {
      // A scan without a text layer: page images instead of text (docs/adr/0009-ocr-skanow.md).
      const input = ScanRequestSchema.safeParse(body)
      if (!input.success) return badRequest
      const limited = await dailyLimitError(env, ip, cors)
      if (limited) return limited
      const { fileName, pages, images, budgetMs } = input.data
      return respond(async () => {
        const output = await analyzeScan(
          env.GEMINI_API_KEY,
          env.MODEL,
          images,
          pages,
          deadlineFor(budgetMs),
        )
        const meta: Meta = { source: 'ocr', pagesAnalyzed: images.length }
        return { ...output, document: { ...output.document, fileName, pages }, meta }
      }, cors)
    }

    if (path === '/merge') {
      // A document in parts: the app sends its analysed fragments and scan batches (docs/adr/0008, 0012).
      const input = MergeRequestSchema.safeParse(body)
      if (!input.success) return badRequest
      const limited = await dailyLimitError(env, ip, cors)
      if (limited) return limited
      const { fileName, pages, parts, budgetMs } = input.data
      return respond(async () => {
        const facts = mergeFacts(parts) // code merges the facts, the model only the summary
        const merged = await mergeSummaries(
          env.GEMINI_API_KEY,
          env.MODEL,
          parts,
          deadlineFor(budgetMs),
        )
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
    if (!input.success) return badRequest
    if (input.data.text.length > MAX_TEXT_CHARS) return tooLong
    const limited = await dailyLimitError(env, ip, cors)
    if (limited) return limited
    const { fileName, pages, text, budgetMs, mode } = input.data
    // A text with many amounts and many dates goes in three parallel field groups, any other in one
    // call (docs/adr/0011). The Worker decides, so a client cannot ask for three calls; only a local
    // experiment may force one path for the A/B.
    const forced = env.ALLOW_EXPERIMENTS === '1' ? mode : undefined
    const parallel = forced ? forced === 'parallel' : wantsParallel(text)
    const run = parallel ? analyzeParallel : analyze
    return respond(async () => {
      const output = await run(env.GEMINI_API_KEY, env.MODEL, text, deadlineFor(budgetMs))
      // fileName and pages are facts the app knows; the model is never asked for them.
      return { ...output, document: { ...output.document, fileName, pages } }
    }, cors)
  },
} satisfies ExportedHandler<Env>
