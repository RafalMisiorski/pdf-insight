export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB, limit from the brief

export type FileCheck = { ok: true } | { ok: false; message: string }

// Cheap checks first (empty, size, extension or MIME type), then the signature:
// every PDF file starts with the bytes "%PDF-", whatever its name says.
export async function checkPdfFile(file: File): Promise<FileCheck> {
  if (file.size === 0) return { ok: false, message: 'Plik jest pusty.' }
  if (file.size > MAX_FILE_BYTES)
    return { ok: false, message: 'Plik jest za duży. Limit to 10 MB.' }
  const namedLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!namedLikePdf) return { ok: false, message: 'Wybrany plik nie jest plikiem PDF.' }
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (String.fromCharCode(...head) !== '%PDF-') {
    return {
      ok: false,
      message: 'Plik ma rozszerzenie PDF, ale nie jest poprawnym dokumentem PDF.',
    }
  }
  return { ok: true }
}
