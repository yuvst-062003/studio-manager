// The mid-session half of swUpdate.ts's policy: a new build is downloaded and waiting,
// and this toast is the invitation to take it. It never reloads on its own — dismissing
// just hides it, and the update applies itself on the next launch anyway, which is why
// the dismiss button can honestly say "later".
import { useEffect, useRef, useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { SW_UPDATE_EVENT } from './swUpdate'
import type { SwUpdateDetail } from './swUpdate'

export function UpdateToast({ locale }: { locale: Locale }) {
  const [ready, setReady] = useState(false)
  const applyRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<SwUpdateDetail>).detail
      if (!detail?.apply) return
      applyRef.current = detail.apply
      setReady(true)
    }
    globalThis.addEventListener(SW_UPDATE_EVENT, handler)
    return () => globalThis.removeEventListener(SW_UPDATE_EVENT, handler)
  }, [])

  if (!ready) return null

  return (
    <div className="studio-update-toast" role="status" data-testid="update-toast">
      <span className="studio-update-toast__text">{t(locale, 'common.update.available')}</span>
      <button
        type="button"
        className="studio-update-toast__reload"
        data-testid="update-toast-reload"
        onClick={() => applyRef.current?.()}
      >
        {t(locale, 'common.update.reload')}
      </button>
      <button
        type="button"
        className="studio-update-toast__dismiss"
        data-testid="update-toast-dismiss"
        onClick={() => setReady(false)}
      >
        {t(locale, 'common.update.dismiss')}
      </button>
    </div>
  )
}
