import type { ReactNode } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Alert } from './Alert'
import { Button } from './Button'

/**
 * The one recovery affordance, shared by all three apps (dashboard F1a, parent P8,
 * staff S11).
 *
 * `onRetry` is required by type: a screen that cannot re-fetch cannot use this
 * primitive, which is the point. These apps register a service worker, so a browser
 * refresh may serve the same failure straight from cache — the retry must be a real
 * re-fetch, never `location.reload()`.
 *
 * `offline` swaps the copy: "you are offline" and "that failed" are different
 * messages, and only one of them is worth retrying immediately. The staff app feeds
 * this from its network state (S5); the parent app from §10.1's vocabulary.
 */
export function LoadFailed({
  locale,
  onRetry,
  detail,
  offline = false,
}: {
  locale: Locale
  onRetry: () => void
  detail?: ReactNode
  offline?: boolean
}) {
  return (
    <div className="studio-load-failed" data-offline={offline || undefined} data-testid="load-failed">
      <Alert iconLabel={t(locale, 'common.loadFailed.icon')} tone="danger">
        {detail ?? t(locale, offline ? 'common.loadFailed.offline' : 'common.loadFailed.body')}
      </Alert>
      <Button data-testid="load-failed-retry" onClick={onRetry} variant="secondary">
        {t(locale, 'common.loadFailed.retry')}
      </Button>
    </div>
  )
}
