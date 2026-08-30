import { useEffect, useState } from 'react'
import { apiFetch } from './identity/session'

/**
 * An image the API guards with the session token, usable in a plain `<img src>`.
 *
 * A bare `<img>` fails twice against such a route on split origins (2026-08-30): the
 * API returns its image paths relative (`/api/v1/studio/logo?v=…`), which the browser
 * resolves against the APP's host rather than the API's — and even with the right host
 * the tag cannot send the Authorization header. So the bytes are fetched through
 * `apiFetch` (which fixes both) and handed to the tag as a local object URL.
 *
 * Returns null while loading, for a null path, and for a refused fetch — callers render
 * the image only when a URL exists. The object URL is revoked when the path changes or
 * the caller unmounts.
 */
export function useAuthedImage(path: string | null): string | null {
  const [image, setImage] = useState<{ path: string; url: string } | null>(null)

  useEffect(() => {
    if (!path) return
    let alive = true
    let objectUrl: string | null = null
    void apiFetch(path)
      .then(async (response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        if (!alive) {
          // The caller is gone; nothing will ever render or revoke this one.
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setImage({ path, url })
      })
      .catch(() => undefined)
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  // Keyed by path rather than reset on change, so a stale image is never returned for a
  // new path — and no synchronous setState is needed in the effect.
  return image !== null && image.path === path ? image.url : null
}
