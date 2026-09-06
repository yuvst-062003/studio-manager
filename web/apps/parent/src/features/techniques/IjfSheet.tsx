/** The IJF's own page for a technique, shown full screen.
 *
 * WHY A FRAME AND NOT A COPY. `judo.ijf.org/robots.txt` carries
 * `Content-Signal: search=yes, ai-train=no, use=reference` and an express EU copyright
 * reservation: link and cite, do not reproduce. So their 3D animation and their written
 * description stay on their page, under their name. They send no `X-Frame-Options` and no
 * `Content-Security-Policy`, so framing is not something we are working around.
 *
 * WHY FULL SCREEN. Theirs is a desktop-era page. Inline in a phone column it reads as a
 * broken part of our screen; behind its own bar, with their domain on the face of it, it
 * reads as somewhere else — which is what it is.
 */
import { useEffect, useRef, useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { EmptyState, Button } from '@studio/ui'

export function IjfSheet({
  locale,
  title,
  url,
  onClose,
}: {
  locale: Locale
  title: string
  url: string
  onClose: () => void
}) {
  const [failed, setFailed] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Escape closes it, and focus starts on the close control rather than inside the
  // frame — a keyboard user who lands in someone else's document has no way back out.
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [onClose])

  // A frame that cannot load is the failure this screen is most likely to meet: the dojo
  // has bad signal, or their site is down. `onError` does not fire for every such case,
  // so an offline browser is treated as failed up front rather than left staring at a
  // white rectangle. The app "refuses rather than pretends".
  const offline = !(globalThis.navigator?.onLine ?? true)
  const broken = failed || offline

  return (
    <div aria-label={t(locale, 'techniques.ijf.heading')} className="studio-ijf" role="dialog" aria-modal="true">
      <div className="studio-ijf__panel">
        <div className="studio-ijf__bar">
          <div className="studio-ijf__titles">
            <p className="studio-ijf__title">
              <bdi>{title}</bdi> · {t(locale, 'techniques.ijf.heading')}
            </p>
            {/* Named where it is read, not in a tooltip. */}
            <span className="studio-ijf__attribution">{t(locale, 'techniques.ijf.attribution')}</span>
          </div>
          <a
            aria-label={t(locale, 'techniques.ijf.external')}
            className="studio-ijf__action"
            href={url}
            rel="noreferrer noopener"
            target="_blank"
          >
            <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M21 14v7H3V3h7" />
            </svg>
          </a>
          <button
            aria-label={t(locale, 'techniques.ijf.close')}
            className="studio-ijf__action"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="studio-ijf__body">
          {broken ? (
            <div className="studio-ijf__failed">
              <EmptyState
                action={
                  <Button
                    onClick={() => globalThis.open?.(url, '_blank', 'noopener')}
                    variant="secondary"
                  >
                    {t(locale, 'techniques.ijf.external')}
                  </Button>
                }
                description={t(locale, 'techniques.ijf.failed.hint')}
                title={t(locale, 'techniques.ijf.failed')}
              />
            </div>
          ) : (
            <iframe
              className="studio-ijf__frame"
              onError={() => setFailed(true)}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-popups"
              src={url}
              title={t(locale, 'techniques.ijf.heading')}
            />
          )}
        </div>
      </div>
    </div>
  )
}
