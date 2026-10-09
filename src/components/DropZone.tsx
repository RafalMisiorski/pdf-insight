import { useEffect, useState, type DragEvent } from 'react'
import { MAX_PARTS, MAX_SCAN_PAGES } from '../lib/schema'

type Props = {
  disabled: boolean
  onFile: (file: File) => void
}

// One <label> wraps a native file input: clicking anywhere opens the picker, the input keeps keyboard
// access (Tab, then Enter or Space), and drag & drop is handled on the same element.
export function DropZone({ disabled, onFile }: Props) {
  const [dragging, setDragging] = useState(false)

  // A file dropped next to the zone would make the browser open it and leave the app.
  useEffect(() => {
    const keepInApp = (event: globalThis.DragEvent) => event.preventDefault()
    window.addEventListener('dragover', keepInApp)
    window.addEventListener('drop', keepInApp)
    return () => {
      window.removeEventListener('dragover', keepInApp)
      window.removeEventListener('drop', keepInApp)
    }
  }, [])

  function take(files: FileList | null) {
    const file = files?.[0]
    if (file) onFile(file)
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault() // without this the browser opens the dropped file itself
    if (!disabled) setDragging(true)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    if (!disabled) take(event.dataTransfer.files)
  }

  return (
    <section className="upload">
      <label
        className={`dropzone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={disabled}
          onChange={(event) => {
            take(event.target.files)
            event.target.value = '' // lets the same file be chosen again after an error
          }}
        />
        <span className="dropzone-title">
          Przeciągnij plik PDF tutaj albo kliknij, aby go wybrać
        </span>
        <span className="dropzone-hint">
          PDF do 10 MB. Strony bez warstwy tekstowej odczyta OCR (do {MAX_PARTS * MAX_SCAN_PAGES}{' '}
          stron).
        </span>
      </label>
      <p className="notice">
        Treść pliku (tekst albo obrazy stron skanu) zostanie wysłana do zewnętrznego API AI (Google
        Gemini) w celu analizy. Nie wgrywaj dokumentów z danymi poufnymi.
      </p>
    </section>
  )
}
