// F7b — authenticated file downloads. A bare <a href> cannot carry the Authorization
// header apiFetch attaches, so exports fetch a blob and hand it to the browser. The
// object URL is revoked after the click; the filename comes from the caller because the
// server's Content-Disposition is not readable across the fetch/anchor seam.
import { apiFetch } from './identity/session'

export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await apiFetch(path)
  if (!response.ok) throw new Error(String(response.status))
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
