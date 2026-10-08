import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// pdf.js parses the file in a Web Worker. The ?url import makes Vite copy the worker into the build and
// return its final URL with the /pdf-insight/ base: the "pdf.js worker path" pitfall from the brief.
GlobalWorkerOptions.workerSrc = workerUrl

export type ExtractedText = { pages: number; text: string; hasTextLayer: boolean }

// Fewer readable characters than this per page means the PDF is almost surely a scan without a text layer.
const MIN_CHARS_PER_PAGE = 20

export async function extractText(file: File): Promise<ExtractedText> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      // Items are runs of text; marked-content items have no "str" and are skipped.
      const pageText = content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
        .join('')
      pages.push(pageText.replace(/[ \t]+/g, ' ').trim())
    }
    const text = pages.join('\n\n')
    const readable = text.replace(/\s/g, '').length
    return {
      pages: pdf.numPages,
      text,
      hasTextLayer: readable >= MIN_CHARS_PER_PAGE * pdf.numPages,
    }
  } finally {
    await task.destroy() // frees the worker's memory for this document (pdf.js 6: on the loading task)
  }
}
