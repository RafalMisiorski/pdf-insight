import { useState } from 'react'
import { ApiError, analyzeJob, type AnalysisJob } from './api/analyze'
import { DropZone } from './components/DropZone'
import { History } from './components/History'
import { Progress, type ProgressState } from './components/Progress'
import { Results } from './components/Results'
import { splitIntoParts } from './lib/chunks'
import { checkPdfFile } from './lib/file'
import { addToHistory, clearHistory, loadHistory, type HistoryEntry } from './lib/history'
import type { ExtractedText } from './lib/pdf'
import { MAX_PARTS, MAX_TEXT_CHARS, type Analysis } from './lib/schema'
import './App.css'

// One state at a time, so the screen can never show a result and an error together.
type State =
  | { phase: 'idle' }
  | ProgressState // reading the PDF, then waiting for the analysis
  | { phase: 'done'; result: Analysis }
  | { phase: 'error'; message: string; retry: AnalysisJob | null } // retry = null: choose another file

export default function App() {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory) // read once, on the first render
  const busy = state.phase === 'reading' || state.phase === 'analyzing'

  async function analyze(job: AnalysisJob) {
    setState({
      phase: 'analyzing',
      fileName: job.fileName,
      parts: job.parts.length,
      partsDone: 0,
      startedAt: Date.now(),
    })
    try {
      const result = await analyzeJob(job, (partsDone) =>
        setState((current) =>
          current.phase === 'analyzing' ? { ...current, partsDone } : current,
        ),
      )
      setState({ phase: 'done', result })
      setHistory(addToHistory(result, history))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany błąd.'
      // A retry re-sends the same text; it is not offered when it cannot help (e.g. a document too long).
      const retryable = !(error instanceof ApiError) || error.retryable
      setState({ phase: 'error', message, retry: retryable ? job : null })
    }
  }

  async function handleFile(file: File) {
    const check = await checkPdfFile(file)
    if (!check.ok) {
      setState({ phase: 'error', message: check.message, retry: null })
      return
    }
    setState({ phase: 'reading', fileName: file.name, page: 0, pages: 0 })
    let extracted: ExtractedText
    try {
      // pdf.js is most of the bundle, so it loads with the first file instead of with the page.
      const { extractText } = await import('./lib/pdf')
      extracted = await extractText(file, (page, pages) =>
        setState({ phase: 'reading', fileName: file.name, page, pages }),
      )
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
    // Text that fits one request is sent as it is; a longer one goes in fragments (docs/adr/0008).
    const parts =
      extracted.text.length <= MAX_TEXT_CHARS
        ? [extracted.text]
        : splitIntoParts(extracted.pageTexts, MAX_TEXT_CHARS)
    if (parts.length > MAX_PARTS) {
      setState({
        phase: 'error',
        message: 'Dokument jest za długi do analizy (limit to około 1,6 mln znaków tekstu).',
        retry: null,
      })
      return
    }
    await analyze({ fileName: file.name, pages: extracted.pages, parts })
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
      </div>

      {(state.phase === 'reading' || state.phase === 'analyzing') && <Progress state={state} />}

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
