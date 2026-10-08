import { z } from 'zod'
import { AnalysisSchema, type Analysis } from './schema'

// The last few analyses, kept only in this browser. Only the JSON result is stored, never the PDF or its text.
const STORAGE_KEY = 'pdf-insight:history'
export const HISTORY_LIMIT = 5

const EntrySchema = z.object({ savedAt: z.iso.datetime(), result: AnalysisSchema })
export type HistoryEntry = z.infer<typeof EntrySchema>

// Storage can be missing, full or blocked (private mode, blocked site data) and old data can be broken,
// so every read and write is guarded and each entry is validated again: the app works without history.
export function loadHistory(): HistoryEntry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored
      .flatMap((entry) => {
        const parsed = EntrySchema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
      })
      .slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

export function addToHistory(result: Analysis, history: HistoryEntry[]): HistoryEntry[] {
  const next = [{ savedAt: new Date().toISOString(), result }, ...history].slice(0, HISTORY_LIMIT)
  save(next)
  return next
}

export function clearHistory(): HistoryEntry[] {
  save([])
  return []
}

function save(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage full or blocked: the result is still shown, only the history is not kept.
  }
}
