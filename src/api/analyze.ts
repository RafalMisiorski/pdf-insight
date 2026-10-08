import { z } from 'zod'
import { AnalysisSchema, type Analysis, type AnalyzeRequest } from '../lib/schema'

// `retryable` tells the UI whether "Spróbuj ponownie" can help: not for a document that is too long.
export class ApiError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.retryable = retryable
  }
}

const SuccessSchema = z.object({ result: AnalysisSchema })
const FailureSchema = z.object({ error: z.string() })

// The Worker answers within its own 27 s budget; this guard covers a stalled network on top of it.
export const CLIENT_TIMEOUT_MS = 35_000
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

// Sends the extracted text to the Worker. The answer is validated again here, so nothing that breaks
// the schema is ever rendered, even if the Worker or the network returned something unexpected.
export async function analyzeDocument(
  request: AnalyzeRequest,
  timeoutMs = CLIENT_TIMEOUT_MS,
): Promise<Analysis> {
  let res: Response
  try {
    res = await fetch(`${import.meta.env.VITE_API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
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
