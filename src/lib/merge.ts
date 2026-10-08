import type { ModelOutput } from './schema'

// Facts from the fragments of one long document, merged by code: nothing is rewritten, duplicates go.
// The summary and key points need reading across fragments, so the model writes only those.
// Pick, not Omit: the schema allows extra keys, and Omit over such a type would drop the known ones.
export type MergedFacts = Pick<
  ModelOutput,
  'document' | 'entities' | 'amounts' | 'dates' | 'keywords'
>

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

function unique<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyOf(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function mergeFacts(parts: ModelOutput[]): MergedFacts {
  const [first] = parts
  return {
    // The first fragment holds the title page; a later fragment only fills a missing title or date.
    document: {
      ...first.document,
      title: first.document.title ?? parts.find((p) => p.document.title)?.document.title ?? null,
      date: first.document.date ?? parts.find((p) => p.document.date)?.document.date ?? null,
    },
    entities: {
      organizations: unique(
        parts.flatMap((p) => p.entities.organizations),
        normalize,
      ),
      people: unique(
        parts.flatMap((p) => p.entities.people),
        normalize,
      ),
    },
    amounts: unique(
      parts.flatMap((p) => p.amounts),
      (a) => `${a.value}|${a.currency}|${normalize(a.context)}`,
    ),
    dates: unique(
      parts.flatMap((p) => p.dates),
      (d) => `${d.date}|${normalize(d.context)}`,
    ),
    keywords: unique(
      parts.flatMap((p) => p.keywords),
      normalize,
    ),
  }
}
