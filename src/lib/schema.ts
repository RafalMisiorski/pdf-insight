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

// Text limits shared by the app and the Worker. One request carries at most MAX_TEXT_CHARS characters;
// a longer document is split into at most MAX_PARTS fragments (docs/adr/0008-dlugie-dokumenty.md).
export const MAX_TEXT_CHARS = 400_000
export const MAX_PARTS = 4

// Scans go as page images: at most MAX_SCAN_PAGES pages, each image at most MAX_IMAGE_CHARS of base64
// (about 1.1 MB of JPEG).
export const MAX_SCAN_PAGES = 8
export const MAX_IMAGE_CHARS = 1_500_000

// What the app sends to the Worker.
export const AnalyzeRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  pages: z.number().int().min(1).max(5000),
  text: z.string().min(1),
})
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>

// What the app sends to merge the analysed fragments of one long document.
export const MergeRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  pages: z.number().int().min(1).max(5000),
  parts: z.array(ModelOutputSchema).min(2).max(MAX_PARTS),
})
export type MergeRequest = z.infer<typeof MergeRequestSchema>

// What the model writes when merging: only the fields that need reading across all fragments.
export const MergedSummarySchema = z.looseObject({
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(3).max(7),
})
export type MergedSummary = z.infer<typeof MergedSummarySchema>

// What the app sends for a scan without a text layer: JPEG page images in base64, in page order
// (docs/adr/0009-ocr-skanow.md).
export const ScanRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  pages: z.number().int().min(1).max(5000),
  images: z.array(z.string().min(1).max(MAX_IMAGE_CHARS)).min(1).max(MAX_SCAN_PAGES),
})
export type ScanRequest = z.infer<typeof ScanRequestSchema>

// Added to a result read from page images, so the JSON itself says how it was obtained.
export const ScanMetaSchema = z.object({
  source: z.literal('ocr'),
  pagesAnalyzed: z.number().int().positive(),
})
export type ScanMeta = z.infer<typeof ScanMetaSchema>

// JSON Schema derived from the same Zod schema, so the model and the validator cannot drift apart.
export const modelOutputJsonSchema = z.toJSONSchema(ModelOutputSchema)
export const mergedSummaryJsonSchema = z.toJSONSchema(MergedSummarySchema)

export type Check<T = ModelOutput> = { ok: true; value: T } | { ok: false; problems: string[] }

// Zod checks the shape; the 3-5 sentence rule for the summary is checked separately.
export function checkModelOutput(raw: unknown): Check {
  return checkWithSummary(ModelOutputSchema, raw)
}

export function checkMergedSummary(raw: unknown): Check<MergedSummary> {
  return checkWithSummary(MergedSummarySchema, raw)
}

function checkWithSummary<T extends { summary: string }>(
  schema: z.ZodType<T>,
  raw: unknown,
): Check<T> {
  const parsed = schema.safeParse(raw)
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
