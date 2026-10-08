import { z } from 'zod'
import {
  checkMergedSummary,
  checkModelOutput,
  mergedSummaryJsonSchema,
  modelOutputJsonSchema,
  type Check,
  type MergedSummary,
  type ModelOutput,
} from '../../src/lib/schema'
import {
  MERGE_PROMPT,
  SCAN_PROMPT,
  SYSTEM_PROMPT,
  retryMessage,
  scanMessage,
  wrapDocument,
  wrapParts,
} from './prompt'

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

// A message part is text or, for scans, an inline JPEG page image in base64.
type Part = { text: string } | { inline_data: { mime_type: string; data: string } }
type Content = { role: 'user' | 'model'; parts: Part[] }

// One kind of model call: its rules, the JSON schema the answer must follow, the message and the check.
type Task<T> = {
  systemPrompt: string
  jsonSchema: unknown
  userParts: Part[]
  check: (raw: unknown) => Check<T>
}

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
  systemPrompt: string,
  jsonSchema: unknown,
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
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: jsonSchema, // constrained decoding to our schema
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

// One call, then at most one retry when the answer is not valid JSON or fails its check (rule from the
// brief), all within one deadline.
async function runValidated<T>(
  apiKey: string,
  model: string,
  task: Task<T>,
  deadline: number,
): Promise<T> {
  const contents: Content[] = [{ role: 'user', parts: task.userParts }]
  let problems: string[] = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now()
    if (attempt > 1 && remaining < MIN_RETRY_MS) break // too little time left for a useful retry
    const answer = await generate(
      apiKey,
      model,
      task.systemPrompt,
      task.jsonSchema,
      contents,
      remaining,
    )
    const check = task.check(parseJson(answer))
    if (check.ok) return check.value
    problems = check.problems
    contents.push(
      { role: 'model', parts: [{ text: answer }] },
      { role: 'user', parts: [{ text: retryMessage(check.problems) }] },
    )
  }
  throw new ModelError('invalid_output', problems)
}

// The text path: one document (or one fragment of a long one) in, the full analysis out.
// `deadline` is a parameter so tests can start with little time left.
export function analyze(
  apiKey: string,
  model: string,
  documentText: string,
  deadline = Date.now() + BUDGET_MS,
): Promise<ModelOutput> {
  return runValidated(
    apiKey,
    model,
    {
      systemPrompt: SYSTEM_PROMPT,
      jsonSchema: modelOutputJsonSchema,
      userParts: [{ text: wrapDocument(documentText) }],
      check: checkModelOutput,
    },
    deadline,
  )
}

// Long documents: one summary and key points across all fragments; their facts are merged by code.
export function mergeSummaries(
  apiKey: string,
  model: string,
  parts: ModelOutput[],
  deadline = Date.now() + BUDGET_MS,
): Promise<MergedSummary> {
  return runValidated(
    apiKey,
    model,
    {
      systemPrompt: MERGE_PROMPT,
      jsonSchema: mergedSummaryJsonSchema,
      userParts: [{ text: wrapParts(parts) }],
      check: checkMergedSummary,
    },
    deadline,
  )
}

// Scans: a short instruction, then one inline JPEG part per page, with the same check and retry.
export function analyzeScan(
  apiKey: string,
  model: string,
  images: string[],
  totalPages: number,
  deadline = Date.now() + BUDGET_MS,
): Promise<ModelOutput> {
  return runValidated(
    apiKey,
    model,
    {
      systemPrompt: SCAN_PROMPT,
      jsonSchema: modelOutputJsonSchema,
      userParts: [
        { text: scanMessage(images.length, totalPages) },
        ...images.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })),
      ],
      check: checkModelOutput,
    },
    deadline,
  )
}
