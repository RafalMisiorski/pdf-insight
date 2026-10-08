import { useEffect, useState, type ReactNode } from 'react'

// The two phases in which the user waits; App keeps them in its state.
export type ProgressState =
  // pages = 0 until known; ocr = a scan whose page images are being prepared for the model
  | { phase: 'reading'; fileName: string; page: number; pages: number; ocr?: boolean }
  | {
      phase: 'analyzing'
      fileName: string
      parts: number
      partsDone: number
      startedAt: number
      ocr?: boolean
    }

type Step = { label: string; status: 'done' | 'current' | 'pending'; detail?: ReactNode }

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

// Its own component, so the one-second timer runs only while the analysis step is shown.
function AnalysisDetail({ state }: { state: Extract<ProgressState, { phase: 'analyzing' }> }) {
  const seconds = useElapsedSeconds(state.startedAt)
  if (state.parts === 1) return <>{seconds} s · zwykle trwa to 5–10 sekund</>
  if (state.partsDone < state.parts) {
    return (
      <>
        Długi dokument: gotowe fragmenty {state.partsDone} z {state.parts} · {seconds} s
      </>
    )
  }
  return <>Scalam wyniki fragmentów · {seconds} s</>
}

export function Progress({ state }: { state: ProgressState }) {
  const reading = state.phase === 'reading'
  const steps: Step[] = [
    {
      label: state.ocr ? 'Skan bez warstwy tekstowej: obrazy stron do OCR' : 'Odczyt tekstu z PDF',
      status: reading ? 'current' : 'done',
      detail: reading && state.pages > 0 ? `strona ${state.page} z ${state.pages}` : undefined,
    },
    {
      label: 'Analiza treści przez AI',
      status: reading ? 'pending' : 'current',
      detail: reading ? undefined : <AnalysisDetail state={state} />,
    },
    { label: 'Sprawdzenie wyniku ze schematem', status: 'pending' },
  ]
  const current = steps.find((step) => step.status === 'current')

  return (
    <section className="progress" aria-labelledby="progress-title">
      <h2 id="progress-title" className="progress-title">
        Przetwarzam plik {state.fileName}
      </h2>
      {/* Only the step name is announced; the counters below would be read out every second. */}
      <p className="sr-only" aria-live="polite">
        {current?.label}
      </p>
      <ol className="steps">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className={`step ${step.status}`}
            aria-current={step.status === 'current' ? 'step' : undefined}
          >
            <span className="step-marker" aria-hidden="true">
              {step.status === 'done' ? '✓' : index + 1}
            </span>
            <span className="step-text">
              <span className="step-label">{step.label}</span>
              {step.detail && <span className="step-detail">{step.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {reading && state.pages > 0 && (
        <progress
          className="bar"
          value={state.page}
          max={state.pages}
          aria-label="Odczytane strony"
        />
      )}
    </section>
  )
}
