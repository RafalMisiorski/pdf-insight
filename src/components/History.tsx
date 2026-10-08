import type { Analysis } from '../lib/schema'
import type { HistoryEntry } from '../lib/history'

type Props = {
  entries: HistoryEntry[]
  disabled: boolean
  onOpen: (result: Analysis) => void
  onClear: () => void
}

const formatSavedAt = (iso: string) =>
  new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

export function History({ entries, disabled, onOpen, onClear }: Props) {
  if (entries.length === 0) return null
  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-header">
        <h2 id="history-title">Ostatnie analizy</h2>
        <button type="button" className="secondary" disabled={disabled} onClick={onClear}>
          Wyczyść historię
        </button>
      </div>
      <ul>
        {entries.map((entry) => (
          <li key={entry.savedAt}>
            <button
              type="button"
              className="link"
              disabled={disabled}
              onClick={() => onOpen(entry.result)}
            >
              {entry.result.document.title ?? entry.result.document.fileName}
            </button>
            <span className="muted">
              {' '}
              · {entry.result.document.fileName} · {formatSavedAt(entry.savedAt)}
            </span>
          </li>
        ))}
      </ul>
      <p className="notice">
        Historia (tylko wyniki JSON) jest zapisana wyłącznie w tej przeglądarce.
      </p>
    </section>
  )
}
