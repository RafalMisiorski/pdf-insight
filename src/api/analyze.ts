import { z } from 'zod'
import { AnalysisSchema, type Analysis, type AnalyzeRequest } from '../lib/schema'

export class ApiError extends Error {}

const SuccessSchema = z.object({ result: AnalysisSchema })
const FailureSchema = z.object({ error: z.string() })

// Sends the extracted text to the Worker. The answer is validated again here, so nothing that breaks
// the schema is ever rendered, even if the Worker or the network returned something unexpected.
export async function analyzeDocument(request: AnalyzeRequest): Promise<Analysis> {
  let res: Response
  try {
    res = await fetch(`${import.meta.env.VITE_API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    throw new ApiError('Brak połączenia z serwerem analizy. Sprawdź internet i spróbuj ponownie.')
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const failure = FailureSchema.safeParse(body)
    throw new ApiError(
      failure.success ? failure.data.error : `Serwer analizy zwrócił błąd ${res.status}.`,
    )
  }
  const success = SuccessSchema.safeParse(body)
  if (!success.success) {
    throw new ApiError('Wynik analizy ma niepoprawny format. Spróbuj ponownie.')
  }
  return success.data.result
}
