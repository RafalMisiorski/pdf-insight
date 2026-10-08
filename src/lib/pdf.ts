import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// pdf.js parses the file in a Web Worker. The ?url import makes Vite copy the worker into the build and
// return its final URL with the /pdf-insight/ base: the "pdf.js worker path" pitfall from the brief.
GlobalWorkerOptions.workerSrc = workerUrl

export type ExtractedText = {
  pages: number
  text: string // all pages joined, as sent for a document that fits one request
  pageTexts: string[] // per page, for splitting a long document on page boundaries
  hasTextLayer: boolean
}

// Fewer readable characters than this per page means the PDF is almost surely a scan without a text layer.
const MIN_CHARS_PER_PAGE = 20

// onPage reports progress after each page, for the progress steps in the UI.
export async function extractText(
  file: File,
  onPage?: (read: number, total: number) => void,
): Promise<ExtractedText> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    if (pdf.numPages === 0) throw new Error('PDF has no pages') // shown as an unreadable file
    const pageTexts: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      // Items are runs of text; marked-content items have no "str" and are skipped.
      const pageText = content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
        .join('')
      pageTexts.push(pageText.replace(/[ \t]+/g, ' ').trim())
      onPage?.(pageNumber, pdf.numPages)
    }
    const text = pageTexts.join('\n\n')
    const readable = text.replace(/\s/g, '').length
    return {
      pages: pdf.numPages,
      text,
      pageTexts,
      hasTextLayer: readable >= MIN_CHARS_PER_PAGE * pdf.numPages,
    }
  } finally {
    await task.destroy() // frees the worker's memory for this document (pdf.js 6: on the loading task)
  }
}

// Scans: pages rendered to JPEG for the model (docs/adr/0009-ocr-skanow.md). A fixed longer side keeps
// every page image readable and its size predictable, whatever the scan resolution was.
const LONG_SIDE_PX = 1600
const JPEG_QUALITY = 0.7

export async function renderPages(
  file: File,
  count: number,
  onPage?: (done: number, total: number) => void,
): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const total = Math.min(count, pdf.numPages)
    const images: string[] = []
    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const natural = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({
        scale: LONG_SIDE_PX / Math.max(natural.width, natural.height),
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise // pdf.js paints a white page background
      images.push(await toJpegBase64(canvas))
      onPage?.(pageNumber, total)
    }
    return images
  } finally {
    await task.destroy()
  }
}

// canvas -> JPEG Blob -> data URL; the model needs only the base64 part after the comma.
function toJpegBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas export failed'))
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(reader.error ?? new Error('Reading the image failed'))
        reader.readAsDataURL(blob)
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}
