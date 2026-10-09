import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { MAX_IMAGE_CHARS } from './schema'

// pdf.js parses the file in a Web Worker. The ?url import makes Vite copy the worker into the build and
// return its final URL with the /pdf-insight/ base: the "pdf.js worker path" pitfall from the brief.
GlobalWorkerOptions.workerSrc = workerUrl

export type ExtractedText = {
  pages: number
  text: string // all pages joined, as sent for a document that fits one request
  pageTexts: string[] // per page, for splitting a long document on page boundaries
  pagesWithoutText: number[] // 1-based pages with (almost) no text
  imagePages: number[] // of those, the pages that show an image, e.g. scanned pages: they go to OCR
}

// Fewer readable characters than this on a page means the page is almost surely an image without text.
const MIN_CHARS_PER_PAGE = 20

// Drawing operations that paint an image. A page without text that has one of them is read with OCR;
// a page with neither is blank, or its text is drawn as shapes (docs/adr/0012-planer-dokumentu.md).
const IMAGE_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintImageMaskXObject,
])

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
    const imagePages: number[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      // Items are runs of text; marked-content items have no "str" and are skipped.
      const pageText = content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
        .join('')
      const cleaned = pageText.replace(/[ \t]+/g, ' ').trim()
      pageTexts.push(cleaned)
      if (cleaned.replace(/\s/g, '').length < MIN_CHARS_PER_PAGE) {
        const { fnArray } = await page.getOperatorList()
        if (fnArray.some((fn) => IMAGE_OPS.has(fn))) imagePages.push(pageNumber)
      }
      onPage?.(pageNumber, pdf.numPages)
    }
    // Pages are judged one by one, so text pages and scanned pages of one PDF are both read.
    const pagesWithoutText = pageTexts.flatMap((pageText, index) =>
      pageText.replace(/\s/g, '').length < MIN_CHARS_PER_PAGE ? [index + 1] : [],
    )
    return {
      pages: pdf.numPages,
      text: pageTexts.join('\n\n'),
      pageTexts,
      pagesWithoutText,
      imagePages,
    }
  } finally {
    await task.destroy() // frees the worker's memory for this document (pdf.js 6: on the loading task)
  }
}

// Scans: pages rendered to JPEG for the model (docs/adr/0009-ocr-skanow.md). A fixed longer side keeps
// every page image readable and its size predictable, whatever the scan resolution was.
const LONG_SIDE_PX = 1600
// Lower qualities are tried only for a page whose image would exceed MAX_IMAGE_CHARS.
const JPEG_QUALITIES = [0.7, 0.5, 0.35]

// pageNumbers are 1-based; the images come back in the same order.
export async function renderPages(
  file: File,
  pageNumbers: number[],
  onPage?: (done: number, total: number) => void,
): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const images: string[] = []
    for (const pageNumber of pageNumbers) {
      const page = await pdf.getPage(pageNumber)
      const natural = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({
        scale: LONG_SIDE_PX / Math.max(natural.width, natural.height),
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise // pdf.js paints a white page background
      images.push(await smallEnoughJpeg(canvas, pageNumber))
      onPage?.(images.length, pageNumbers.length)
    }
    return images
  } finally {
    await task.destroy()
  }
}

async function smallEnoughJpeg(canvas: HTMLCanvasElement, pageNumber: number): Promise<string> {
  for (const quality of JPEG_QUALITIES) {
    const base64 = await toJpegBase64(canvas, quality)
    if (base64.length <= MAX_IMAGE_CHARS) return base64
  }
  throw new Error(`Page ${pageNumber} is too large even at the lowest JPEG quality`)
}

// canvas -> JPEG Blob -> data URL; the model needs only the base64 part after the comma.
function toJpegBase64(canvas: HTMLCanvasElement, quality: number): Promise<string> {
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
      quality,
    )
  })
}
