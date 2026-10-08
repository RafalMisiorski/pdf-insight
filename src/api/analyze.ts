import { z } from 'zod'
import {
  AnalysisSchema,
  type Analysis,
  type AnalyzeRequest,
  type MergeRequest,
} from '../lib/schema'

// `retryable` tells the UI whether "Spróbuj ponownie" can help: not for a document that is too long.
export class ApiError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.retryable = retryable
  }
}

// A document to analyse: its text in one part, or in fragments when it is longer than one request.
export type AnalysisJob = { fileName: string; pages: number; parts: string[] }

const SuccessSchema = z.object({ result: AnalysisSchema })
const FailureSchema = z.object({ error: z.string() })

// The Worker answers within its own 27 s budget; this guard covers a stalled network on top of it.
export const CLIENT_TIMEOUT_MS = 35_000
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

// Sends one request to the Worker. The answer is validated again here, so nothing that breaks the
// schema is ever rendered, even if the Worker or the network returned something unexpected.
async function post(path: string, payload: unknown, timeoutMs: number): Promise<Analysis> {
  let res: Response
  try {
    res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('Analiza trwa zbyt długo. Spróbuj ponownie.', true)
    }
    throw new ApiError(
      'Brak połączenia z serwerem analizy. Sprawdź internet i spróbuj ponownie.',
      true,
    )
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const failure = FailureSchema.safeParse(body)
    const message = failure.success
      ? failure.data.error
      : `Serwer analizy zwrócił błąd ${res.status}.`
    throw new ApiError(message, RETRYABLE_STATUSES.has(res.status))
  }
  const success = SuccessSchema.safeParse(body)
  if (!success.success) {
    throw new ApiError('Wynik analizy ma niepoprawny format. Spróbuj ponownie.', true)
  }
  return success.data.result
}

export function analyzeDocument(
  request: AnalyzeRequest,
  timeoutMs = CLIENT_TIMEOUT_MS,
): Promise<Analysis> {
  return post('/analyze', request, timeoutMs)
}

export function mergeAnalyses(
  request: MergeRequest,
  timeoutMs = CLIENT_TIMEOUT_MS,
): Promise<Analysis> {
  return post('/merge', request, timeoutMs)
}

// onPartDone reports how many fragments of a long document are done, for the progress steps.
export async function analyzeJob(
  job: AnalysisJob,
  onPartDone?: (done: number) => void,
): Promise<Analysis> {
  const { fileName, pages, parts } = job
  if (parts.length === 1) return analyzeDocument({ fileName, pages, text: parts[0] })
  // Fragments are analysed in parallel, then the Worker merges their facts and writes one summary.
  let done = 0
  const results = await Promise.all(
    parts.map(async (text) => {
      const result = await analyzeDocument({ fileName, pages, text })
      onPartDone?.((done += 1))
      return result
    }),
  )
  return mergeAnalyses({ fileName, pages, parts: results })
}
