import { useState, type DragEvent } from 'react'

type Props = {
  disabled: boolean
  onFile: (file: File) => void
}

// One <label> wraps a native file input: clicking anywhere opens the picker, the input keeps keyboard
// access (Tab, then Enter or Space), and drag & drop is handled on the same element.
export function DropZone({ disabled, onFile }: Props) {
  const [dragging, setDragging] = useState(false)

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
        <span className="dropzone-hint">Tylko PDF z warstwą tekstową, maksymalnie 10 MB</span>
      </label>
      <p className="notice">
        Tekst z pliku zostanie wysłany do zewnętrznego API AI (Google Gemini) w celu analizy. Nie
        wgrywaj dokumentów z danymi poufnymi.
      </p>
    </section>
  )
}
