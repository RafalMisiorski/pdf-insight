import type { Analysis } from '../lib/schema'

const TYPE_LABELS: Record<Analysis['document']['type'], string> = {
  faktura: 'Faktura',
  umowa: 'Umowa',
  oferta: 'Oferta',
  raport: 'Raport',
  inne: 'Inny dokument',
}

// ISO dates stay ISO in the JSON; on screen they are shown the Polish way (DD.MM.YYYY).
function formatDate(iso: string): string {
  return iso.split('-').reverse().join('.')
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(value)
}

function languageName(code: string): string {
  return new Intl.DisplayNames(['pl'], { type: 'language' }).of(code) ?? code
}

// The file is built in the browser: a Blob with the JSON text, a temporary object URL and a hidden link.
function downloadJson(result: Analysis) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${result.document.fileName.replace(/\.pdf$/i, '')}.json`
  link.click()
  // Revoking at once can cancel the download in some browsers; a few seconds later it is safe.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="muted">{empty}</p>
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

export function Results({ result }: { result: Analysis }) {
  const doc = result.document
  return (
    <section className="results" aria-labelledby="results-title">
      <h2 id="results-title">{doc.title ?? doc.fileName}</h2>
      <dl className="facts">
        <div>
          <dt>Typ</dt>
          <dd>{TYPE_LABELS[doc.type]}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{doc.date ? formatDate(doc.date) : 'brak w dokumencie'}</dd>
        </div>
        <div>
          <dt>Język</dt>
          <dd>{languageName(doc.language)}</dd>
        </div>
        <div>
          <dt>Strony</dt>
          <dd>{doc.pages}</dd>
        </div>
      </dl>

      <div className="card">
        <h3>Podsumowanie</h3>
        <p>{result.summary}</p>
      </div>

      <div className="card">
        <h3>Najważniejsze punkty</h3>
        <List items={result.keyPoints} empty="Brak." />
      </div>

      <div className="grid">
        <div className="card">
          <h3>Organizacje</h3>
          <List items={result.entities.organizations} empty="Brak w dokumencie." />
        </div>
        <div className="card">
          <h3>Osoby</h3>
          <List items={result.entities.people} empty="Brak w dokumencie." />
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h3>Kwoty</h3>
          <List
            items={result.amounts.map((a) => `${formatMoney(a.value, a.currency)}: ${a.context}`)}
            empty="Brak w dokumencie."
          />
        </div>
        <div className="card">
          <h3>Daty</h3>
          <List
            items={result.dates.map((d) => `${formatDate(d.date)}: ${d.context}`)}
            empty="Brak w dokumencie."
          />
        </div>
      </div>

      <div className="card">
        <h3>Słowa kluczowe</h3>
        <List items={result.keywords} empty="Brak." />
      </div>

      <div className="card">
        <div className="json-header">
          <h3>JSON</h3>
          <button type="button" onClick={() => downloadJson(result)}>
            Pobierz JSON
          </button>
        </div>
        <pre className="json" tabIndex={0} aria-label="Podgląd JSON">
          {JSON.stringify(result, null, 2)}
        </pre>
      </div>
    </section>
  )
}
