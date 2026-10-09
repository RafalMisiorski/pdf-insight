import { z } from 'zod'
import { countSentences } from '../lib/sentences'
import {
  AnalysisSchema,
  type Analysis,
  type AnalyzeRequest,
  type MergeRequest,
  type Meta,
  type ScanRequest,
} from '../lib/schema'

// `retryable` tells the UI whether "Spróbuj ponownie" can help: not for a document that is too long.
export class ApiError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.retryable = retryable
  }
}

// A document to analyse, as the plan made it (docs/adr/0012-planer-dokumentu.md): text fragments and
// batches of page images, with the pages the plan left out and the pages that had nothing to read.
export type JobPart =
  | { kind: 'text'; pages: number[]; text: string }
  | { kind: 'scan'; pages: number[]; images: string[] }
export type AnalysisJob = {
  fileName: string
  pages: number
  parts: JobPart[]
  skipped: number[]
  blank: number[]
}

const SuccessSchema = z.object({ result: AnalysisSchema })
const FailureSchema = z.object({ error: z.string(), retryable: z.boolean().optional() })

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
    // The Worker says whether a retry can help; for other errors (e.g. a proxy) the status decides.
    const retryable = failure.success ? failure.data.retryable : undefined
    throw new ApiError(message, retryable ?? RETRYABLE_STATUSES.has(res.status))
  }
  const success = SuccessSchema.safeParse(body)
  // The same checks as in the Worker, again here: the schema and the 3-5 sentence rule.
  const result = success.success ? success.data.result : undefined
  const sentences = result ? countSentences(result.summary, result.document.language) : 0
  if (!result || sentences < 3 || sentences > 5) {
    throw new ApiError('Wynik analizy ma niepoprawny format. Spróbuj ponownie.', true)
  }
  return result
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

export function analyzeScan(
  request: ScanRequest,
  timeoutMs = CLIENT_TIMEOUT_MS,
): Promise<Analysis> {
  return post('/analyze-scan', request, timeoutMs)
}

// The time a document in parts may use from the start of its analysis: under the brief's 30 s, with a
// margin for the browser. The parts and the merge share it (docs/adr/0004).
const JOB_BUDGET_MS = 28_000
const MIN_MERGE_MS = 5_000 // with less time left the merge would only end in a timeout

function send(job: AnalysisJob, part: JobPart, budgetMs?: number): Promise<Analysis> {
  const { fileName, pages } = job
  return part.kind === 'text'
    ? analyzeDocument({ fileName, pages, text: part.text, budgetMs })
    : analyzeScan({ fileName, pages, images: part.images, budgetMs })
}

// onPartDone reports how many parts are done, for the progress steps.
export async function analyzeJob(
  job: AnalysisJob,
  onPartDone?: (done: number) => void,
): Promise<Analysis> {
  if (job.parts.length === 1) {
    // One part: the same request as before the plan, without a shared budget.
    return withMeta(job, await send(job, job.parts[0]), job.parts, [])
  }
  // Parts run in parallel, then the Worker merges their facts and writes one summary, all within one
  // budget. A part that fails does not stop the others: its pages are listed with the result.
  const started = Date.now()
  const left = () => JOB_BUDGET_MS - (Date.now() - started)
  let done = 0
  const settled = await Promise.allSettled(
    job.parts.map(async (part) => {
      const result = await send(job, part, 27_000)
      onPartDone?.((done += 1))
      return result
    }),
  )
  const analysed: JobPart[] = []
  const results: Analysis[] = []
  const failed: number[] = []
  let firstError: unknown
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      analysed.push(job.parts[index])
      results.push(outcome.value)
    } else {
      failed.push(...job.parts[index].pages)
      firstError ??= outcome.reason
    }
  })
  if (results.length === 0) throw firstError
  if (results.length === 1) return withMeta(job, results[0], analysed, failed)
  if (left() < MIN_MERGE_MS) {
    throw new ApiError('Analiza dokumentu nie zmieściła się w czasie. Spróbuj ponownie.', true)
  }
  const budgetMs = Math.min(27_000, Math.floor(left()))
  const { fileName, pages } = job
  const merged = await mergeAnalyses(
    { fileName, pages, parts: results, budgetMs },
    budgetMs + 5_000,
  )
  return withMeta(job, merged, analysed, failed)
}

// What the result says about its pages (app-added meta): which were read from images, which the
// limit left out, which failed and which had nothing to read. Empty lists are left out.
function withMeta(
  job: AnalysisJob,
  result: Analysis,
  analysed: JobPart[],
  failed: number[],
): Analysis {
  const ocr = analysed.flatMap((part) => (part.kind === 'scan' ? part.pages : []))
  const allImages = analysed.every((part) => part.kind === 'scan')
  const meta: Meta = {}
  if (allImages) meta.source = 'ocr'
  if (!allImages && ocr.length > 0) meta.pagesOcr = ocr
  if (job.skipped.length > 0) meta.pagesSkipped = job.skipped
  if (failed.length > 0) meta.pagesFailed = [...failed].sort((a, b) => a - b)
  if (job.blank.length > 0) meta.pagesWithoutText = job.blank
  const rest: Analysis = { ...result }
  delete rest.meta // the Worker's own scan meta is replaced by the lists above
  return Object.keys(meta).length > 0 ? { ...rest, meta } : rest
}
