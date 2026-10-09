import { useEffect, useRef } from 'react'
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

// "always" groups thousands also in four-digit numbers ("4 200,00 zł"), the way invoices print them.
function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    useGrouping: 'always',
  }).format(value)
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

// [2, 3, 4, 7] -> "2–4, 7": the pages left out of the analysis, in short form.
function formatPageList(pages: number[]): string {
  const ranges: string[] = []
  for (let i = 0; i < pages.length; i++) {
    let end = i
    while (end + 1 < pages.length && pages[end + 1] === pages[end] + 1) end++
    ranges.push(end > i ? `${pages[i]}–${pages[end]}` : `${pages[i]}`)
    i = end
  }
  return ranges.join(', ')
}

const Empty = () => <p className="muted">Brak w dokumencie.</p>

// One sentence about a list of pages: `one` for a single page, `many` for more, {pages} for the list.
function PagesNotice({ pages, one, many }: { pages?: number[]; one: string; many: string }) {
  if (!pages || pages.length === 0) return null
  const sentence = pages.length === 1 ? one : many
  return <p className="scan-notice">{sentence.replace('{pages}', formatPageList(pages))}</p>
}

function List({ items, lang }: { items: string[]; lang?: string }) {
  if (items.length === 0) return <Empty />
  return (
    <ul lang={lang}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

// A two-column table: the value (dates and amounts stay on one line) and what it refers to.
// Numeric values are right-aligned, so the decimal commas line up.
function FactTable({
  head,
  rows,
  numeric = false,
  lang,
}: {
  head: string
  rows: { value: string; context: string }[]
  numeric?: boolean
  lang?: string
}) {
  const valueClass = numeric ? 'value num' : 'value'
  if (rows.length === 0) return <Empty />
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col" className={numeric ? 'num' : undefined}>
            {head}
          </th>
          <th scope="col">Czego dotyczy</th>
        </tr>
      </thead>
      <tbody lang={lang}>
        {rows.map((row, index) => (
          <tr key={index}>
            <td className={valueClass}>{row.value}</td>
            <td>{row.context}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Results({ result }: { result: Analysis }) {
  const doc = result.document
  const meta = result.meta ?? {}
  const lang = doc.language // labels stay Polish, the document's own text is marked with its language
  const title = useRef<HTMLHeadingElement>(null)
  // Keyboard and screen-reader users land on the result as soon as it appears.
  useEffect(() => title.current?.focus(), [result])
  return (
    <section className="results" aria-labelledby="results-title">
      <h2 id="results-title" ref={title} tabIndex={-1} lang={lang}>
        {doc.title ?? doc.fileName}
      </h2>
      <p className="subtitle">Plik: {doc.fileName}</p>
      {meta.source === 'ocr' && (
        <p className="scan-notice">
          Ten PDF to skan bez warstwy tekstowej, więc treść odczytano z obrazów stron (OCR)
          {meta.pagesAnalyzed !== undefined && meta.pagesAnalyzed < doc.pages
            ? `: z pierwszych ${meta.pagesAnalyzed} z ${doc.pages} stron`
            : ''}
          . Pojedyncze znaki mogą być odczytane błędnie.
        </p>
      )}
      <PagesNotice
        pages={meta.pagesOcr}
        one="Strona {pages} nie ma warstwy tekstowej, więc odczytano ją z obrazu (OCR). Pojedyncze znaki mogą być odczytane błędnie."
        many="Strony {pages} nie mają warstwy tekstowej, więc odczytano je z obrazów (OCR). Pojedyncze znaki mogą być odczytane błędnie."
      />
      <PagesNotice
        pages={meta.pagesSkipped}
        one="Strona {pages} nie została przeanalizowana, bo dokument przekracza limit jednej analizy. Podsumowanie dotyczy pozostałych stron."
        many="Strony {pages} nie zostały przeanalizowane, bo dokument przekracza limit jednej analizy. Podsumowanie dotyczy pozostałych stron."
      />
      <PagesNotice
        pages={meta.pagesFailed}
        one="Analiza strony {pages} nie powiodła się (błąd albo przekroczony czas). Podsumowanie dotyczy pozostałych stron."
        many="Analiza stron {pages} nie powiodła się (błąd albo przekroczony czas). Podsumowanie dotyczy pozostałych stron."
      />
      <PagesNotice
        pages={meta.pagesWithoutText}
        one="Strona {pages} nie ma tekstu ani obrazu do odczytania (np. pusta strona), więc nie trafiła do analizy."
        many="Strony {pages} nie mają tekstu ani obrazu do odczytania (np. puste strony), więc nie trafiły do analizy."
      />
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
        <p lang={lang}>{result.summary}</p>
      </div>

      <div className="card">
        <h3>Najważniejsze punkty</h3>
        <List items={result.keyPoints} lang={lang} />
      </div>

      <div className="grid">
        <div className="card">
          <h3>Organizacje</h3>
          <List items={result.entities.organizations} lang={lang} />
        </div>
        <div className="card">
          <h3>Osoby</h3>
          <List items={result.entities.people} lang={lang} />
        </div>
      </div>

      <div className="card">
        <h3>Kwoty</h3>
        <FactTable
          head="Kwota"
          numeric
          lang={lang}
          rows={result.amounts.map((a) => ({
            value: formatMoney(a.value, a.currency),
            context: a.context,
          }))}
        />
      </div>

      <div className="grid">
        <div className="card">
          <h3>Daty</h3>
          <FactTable
            head="Data"
            lang={lang}
            rows={result.dates.map((d) => ({ value: formatDate(d.date), context: d.context }))}
          />
        </div>
        <div className="card">
          <h3>Słowa kluczowe</h3>
          {result.keywords.length === 0 ? (
            <p className="muted">Brak.</p>
          ) : (
            <ul className="chips" lang={lang}>
              {result.keywords.map((keyword, index) => (
                <li key={index}>{keyword}</li>
              ))}
            </ul>
          )}
        </div>
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
