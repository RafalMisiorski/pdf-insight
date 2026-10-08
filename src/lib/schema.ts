import { z } from 'zod'
import { countSentences } from './sentences'

// Shared by the Worker (validates the model's answer) and the app (validates before rendering).
// looseObject: the brief allows adding fields, never removing them.

const isoDate = z.iso.date() // YYYY-MM-DD, ISO 8601

export const DOCUMENT_TYPES = ['faktura', 'umowa', 'oferta', 'raport', 'inne'] as const

// What the model fills in. fileName and pages are facts the app already knows, so the model never guesses them.
export const ModelOutputSchema = z.looseObject({
  document: z.looseObject({
    language: z.string().regex(/^[a-z]{2}$/), // ISO 639-1
    type: z.enum(DOCUMENT_TYPES),
    title: z.string().nullable(),
    date: isoDate.nullable(),
  }),
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(3).max(7),
  entities: z.looseObject({
    organizations: z.array(z.string()),
    people: z.array(z.string()),
  }),
  amounts: z.array(
    z.looseObject({
      value: z.number(),
      currency: z.string().regex(/^[A-Z]{3}$/), // ISO 4217
      context: z.string(),
    }),
  ),
  dates: z.array(z.looseObject({ date: isoDate, context: z.string() })),
  keywords: z.array(z.string()),
})

// The full result shown in the app and exported as .json (the schema from section 04 of the brief).
export const AnalysisSchema = ModelOutputSchema.extend({
  document: ModelOutputSchema.shape.document.extend({
    fileName: z.string().min(1),
    pages: z.number().int().positive(),
  }),
})

export type ModelOutput = z.infer<typeof ModelOutputSchema>
export type Analysis = z.infer<typeof AnalysisSchema>

// What the app sends to the Worker.
export const AnalyzeRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  pages: z.number().int().min(1).max(5000),
  text: z.string().min(1),
})
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>

// JSON Schema derived from the same Zod schema, so the model and the validator cannot drift apart.
export const modelOutputJsonSchema = z.toJSONSchema(ModelOutputSchema)

export type Check = { ok: true; value: ModelOutput } | { ok: false; problems: string[] }

// Zod checks the shape; the 3-5 sentence rule for the summary is checked separately.
export function checkModelOutput(raw: unknown): Check {
  const parsed = ModelOutputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    }
  }
  const sentences = countSentences(parsed.data.summary)
  if (sentences < 3 || sentences > 5) {
    return { ok: false, problems: [`summary: needs 3-5 sentences, got ${sentences}`] }
  }
  return { ok: true, value: parsed.data }
}
