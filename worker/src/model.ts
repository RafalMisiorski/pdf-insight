import { z } from 'zod'
import { checkModelOutput, modelOutputJsonSchema, type ModelOutput } from '../../src/lib/schema'
import { SYSTEM_PROMPT, retryMessage, wrapDocument } from './prompt'

// Failures the Worker maps to HTTP statuses and Polish messages.
export type ModelErrorKind = 'rate_limited' | 'timeout' | 'upstream' | 'invalid_output'

export class ModelError extends Error {
  readonly kind: ModelErrorKind
  readonly details: string[] // validation problems of the last answer; never document text
  constructor(kind: ModelErrorKind, details: string[] = []) {
    super(kind)
    this.kind = kind
    this.details = details
  }
}

type Content = { role: 'user' | 'model'; parts: { text: string }[] }

// Only the fields we read from Gemini's answer; anything else in the response is ignored.
const GeminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
      }),
    )
    .optional(),
})

// The brief wants results in under 30 seconds, so one budget covers the whole analysis, retry included,
// and leaves the rest for reading the PDF in the browser and the network.
export const BUDGET_MS = 27_000
// A retry with less time left than this would most likely end in a timeout, so it is skipped.
export const MIN_RETRY_MS = 8_000

async function generate(
  apiKey: string,
  model: string,
  contents: Content[],
  timeoutMs: number,
): Promise<string> {
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        // The key goes in a header, not in the URL, so it never lands in URL logs.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: modelOutputJsonSchema, // constrained decoding to our schema
            temperature: 0.2,
            thinkingConfig: { thinkingLevel: 'low' }, // extraction needs little reasoning; keeps latency down
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    )
  } catch {
    throw new ModelError('timeout') // aborted by the timeout or the network failed
  }
  if (res.status === 429) throw new ModelError('rate_limited')
  if (!res.ok) throw new ModelError('upstream')
  const parsed = GeminiResponseSchema.safeParse(await res.json())
  if (!parsed.success) throw new ModelError('upstream')
  const parts = parsed.data.candidates?.[0]?.content?.parts ?? []
  return parts.map((part) => part.text ?? '').join('')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined // invalid JSON fails validation below and triggers the retry
  }
}

// One call, then at most one retry when the answer is not valid JSON or fails the schema (rule from the brief),
// all within one deadline. `deadline` is a parameter so tests can start with little time left.
export async function analyze(
  apiKey: string,
  model: string,
  documentText: string,
  deadline = Date.now() + BUDGET_MS,
): Promise<ModelOutput> {
  const contents: Content[] = [{ role: 'user', parts: [{ text: wrapDocument(documentText) }] }]
  let problems: string[] = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now()
    if (attempt > 1 && remaining < MIN_RETRY_MS) break // too little time left for a useful retry
    const answer = await generate(apiKey, model, contents, remaining)
    const check = checkModelOutput(parseJson(answer))
    if (check.ok) return check.value
    problems = check.problems
    contents.push(
      { role: 'model', parts: [{ text: answer }] },
      { role: 'user', parts: [{ text: retryMessage(check.problems) }] },
    )
  }
  throw new ModelError('invalid_output', problems)
}
