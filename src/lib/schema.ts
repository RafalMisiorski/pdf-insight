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

// Our own fields, added by code (never by the model): how a result was obtained and what it misses.
export const MetaSchema = z.object({
  source: z.literal('ocr').optional(), // read from page images of a scan
  pagesAnalyzed: z.number().int().positive().optional(), // Worker: images in one scan request (the app replaces it)
  pagesWithoutText: z.array(z.number().int().positive()).optional(), // no text and no image to read
  pagesOcr: z.array(z.number().int().positive()).optional(), // read from page images (docs/adr/0012)
  pagesSkipped: z.array(z.number().int().positive()).optional(), // over the limit of one analysis
  pagesFailed: z.array(z.number().int().positive()).optional(), // their part ended with an error
})
export type Meta = z.infer<typeof MetaSchema>

// The full result shown in the app and exported as .json (the schema from section 04 of the brief).
// z.object drops unknown keys: a field the model added, for example because a document asked for it,
// never reaches the screen or the downloaded file. The model still gets the looser schema above,
// unchanged since the test-set run (worker/src/prompt.test.ts).
export const AnalysisSchema = z.object({
  document: z.object({
    fileName: z.string().min(1),
    pages: z.number().int().positive(),
    language: z.string().regex(/^[a-z]{2}$/),
    type: z.enum(DOCUMENT_TYPES),
    title: z.string().nullable(),
    date: isoDate.nullable(),
  }),
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(3).max(7),
  entities: z.object({ organizations: z.array(z.string()), people: z.array(z.string()) }),
  amounts: z.array(
    z.object({ value: z.number(), currency: z.string().regex(/^[A-Z]{3}$/), context: z.string() }),
  ),
  dates: z.array(z.object({ date: isoDate, context: z.string() })),
  keywords: z.array(z.string()),
  meta: MetaSchema.optional(),
})

export type ModelOutput = z.infer<typeof ModelOutputSchema>
export type Analysis = z.infer<typeof AnalysisSchema>

// Text limits shared by the app and the Worker. One request carries at most MAX_TEXT_CHARS characters
// (docs/adr/0008-dlugie-dokumenty.md). One document becomes at most MAX_PARTS parts, text fragments and
// batches of scanned pages, merged afterwards. 4 is the measured limit for a whole document within 30 s
// (docs/adr/0012-planer-dokumentu.md); with the merge that is 5 requests, within 10 a minute from one IP.
export const MAX_TEXT_CHARS = 400_000
export const MAX_PARTS = 4

// Scans go as page images: at most MAX_SCAN_PAGES pages, each image at most MAX_IMAGE_CHARS of base64
// (about 1.1 MB of JPEG).
export const MAX_SCAN_PAGES = 8
export const MAX_IMAGE_CHARS = 700_000 // 8 pages stay below the Worker's 6 MB limit for scans

// The whole analysis of a long document (fragments, then the merge) shares one time budget, so the
// app passes the time left with each request. A request alone never gets more than 27 s.
export const RequestBudgetSchema = z.number().int().min(1_000).max(27_000).optional()

// What the app sends to the Worker.
export const AnalyzeRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  pages: z.number().int().min(1).max(5000),
  text: z.string().min(1),
  budgetMs: RequestBudgetSchema,
  mode: z.enum(['single', 'parallel']).optional(), // local A/B only (docs/adr/0010, 0011)
})
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>

// A part's summary and key points go to the model again when merging, so their length is bounded:
// without it a client could send megabytes of "summary" through /merge.
const MergePartSchema = ModelOutputSchema.extend({
  summary: z.string().min(1).max(3_000),
  keyPoints: z.array(z.string().min(1).max(1_000)).min(3).max(7),
})

// What the app sends to merge the analysed parts of one document.
export const MergeRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  pages: z.number().int().min(1).max(5000),
  parts: z.array(MergePartSchema).min(2).max(MAX_PARTS),
  budgetMs: RequestBudgetSchema,
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
  budgetMs: RequestBudgetSchema,
})
export type ScanRequest = z.infer<typeof ScanRequestSchema>

// JSON Schema derived from the same Zod schema, so the model and the validator cannot drift apart.
export const modelOutputJsonSchema = z.toJSONSchema(ModelOutputSchema)
export const mergedSummaryJsonSchema = z.toJSONSchema(MergedSummarySchema)

export type Check<T = ModelOutput> = { ok: true; value: T } | { ok: false; problems: string[] }

// Zod checks the shape; the 3-5 sentence rule for the summary is checked separately.
export function checkModelOutput(raw: unknown): Check {
  return checkWithSummary(ModelOutputSchema, raw, (value) => value.document.language)
}

export function checkMergedSummary(raw: unknown): Check<MergedSummary> {
  return checkWithSummary(MergedSummarySchema, raw)
}

function checkWithSummary<T extends { summary: string }>(
  schema: z.ZodType<T>,
  raw: unknown,
  languageOf?: (value: T) => string,
): Check<T> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    }
  }
  const sentences = countSentences(parsed.data.summary, languageOf?.(parsed.data))
  if (sentences < 3 || sentences > 5) {
    return { ok: false, problems: [`summary: needs 3-5 sentences, got ${sentences}`] }
  }
  return { ok: true, value: parsed.data }
}

// Parallel field groups (docs/adr/0010, 0011): the same answer split into three groups of fields.
// Each group is a part of ModelOutputSchema, so the joined result passes the same checks.
export const CoreOutputSchema = ModelOutputSchema.pick({
  document: true,
  summary: true,
  keyPoints: true,
  entities: true,
  keywords: true,
})
export const AmountsOutputSchema = ModelOutputSchema.pick({ amounts: true })
export const DatesOutputSchema = ModelOutputSchema.pick({ dates: true })
export const coreJsonSchema = z.toJSONSchema(CoreOutputSchema)
export const amountsJsonSchema = z.toJSONSchema(AmountsOutputSchema)
export const datesJsonSchema = z.toJSONSchema(DatesOutputSchema)

export function checkCore(raw: unknown) {
  return checkWithSummary(CoreOutputSchema, raw, (value) => value.document.language)
}

// Shape only, for groups without a summary.
export function checkShape<T>(schema: z.ZodType<T>, raw: unknown): Check<T> {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, value: parsed.data }
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  }
}
