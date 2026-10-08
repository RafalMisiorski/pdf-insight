import { useState } from 'react'
import { ApiError, analyzeDocument } from './api/analyze'
import { DropZone } from './components/DropZone'
import { History } from './components/History'
import { Results } from './components/Results'
import { checkPdfFile } from './lib/file'
import { addToHistory, clearHistory, loadHistory, type HistoryEntry } from './lib/history'
import type { ExtractedText } from './lib/pdf'
import type { Analysis, AnalyzeRequest } from './lib/schema'
import './App.css'

// One state at a time, so the screen can never show a result and an error together.
type State =
  | { phase: 'idle' }
  | { phase: 'reading'; fileName: string }
  | { phase: 'analyzing'; fileName: string }
  | { phase: 'done'; result: Analysis }
  | { phase: 'error'; message: string; retry: AnalyzeRequest | null } // retry = null: choose another file

export default function App() {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory) // read once, on the first render
  const busy = state.phase === 'reading' || state.phase === 'analyzing'

  async function analyze(request: AnalyzeRequest) {
    setState({ phase: 'analyzing', fileName: request.fileName })
    try {
      const result = await analyzeDocument(request)
      setState({ phase: 'done', result })
      setHistory(addToHistory(result, history))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany błąd.'
      // A retry re-sends the same text; it is not offered when it cannot help (e.g. a document too long).
      const retryable = !(error instanceof ApiError) || error.retryable
      setState({ phase: 'error', message, retry: retryable ? request : null })
    }
  }

  async function handleFile(file: File) {
    const check = await checkPdfFile(file)
    if (!check.ok) {
      setState({ phase: 'error', message: check.message, retry: null })
      return
    }
    setState({ phase: 'reading', fileName: file.name })
    let extracted: ExtractedText
    try {
      // pdf.js is most of the bundle, so it loads with the first file instead of with the page.
      const { extractText } = await import('./lib/pdf')
      extracted = await extractText(file)
    } catch {
      setState({
        phase: 'error',
        message: 'Nie udało się odczytać pliku. Może być uszkodzony albo zabezpieczony hasłem.',
        retry: null,
      })
      return
    }
    if (!extracted.hasTextLayer) {
      setState({
        phase: 'error',
        message:
          'Ten PDF nie ma warstwy tekstowej (to prawdopodobnie skan), więc nie da się odczytać jego treści.',
        retry: null,
      })
      return
    }
    await analyze({ fileName: file.name, pages: extracted.pages, text: extracted.text })
  }

  return (
    <main className="app">
      <header>
        <h1>PDF Insight</h1>
        <p>Wgraj plik PDF, a dostaniesz krótkie podsumowanie i dane w formacie JSON.</p>
      </header>

      <DropZone disabled={busy} onFile={handleFile} />

      <div className="status" aria-live="polite">
        {state.phase === 'idle' && <p className="muted">Nie wybrano jeszcze pliku.</p>}
        {state.phase === 'reading' && (
          <p className="loading">Odczytuję tekst z pliku {state.fileName}…</p>
        )}
        {state.phase === 'analyzing' && (
          <p className="loading">Analizuję dokument {state.fileName}…</p>
        )}
      </div>

      {state.phase === 'error' && (
        <div className="error" role="alert">
          <p>{state.message}</p>
          {state.retry ? (
            <button type="button" onClick={() => state.retry && analyze(state.retry)}>
              Spróbuj ponownie
            </button>
          ) : (
            <p className="muted">Wybierz inny plik.</p>
          )}
        </div>
      )}

      {state.phase === 'done' && <Results result={state.result} />}

      <History
        entries={history}
        disabled={busy}
        onOpen={(result) => setState({ phase: 'done', result })}
        onClear={() => setHistory(clearHistory())}
      />
    </main>
  )
}
