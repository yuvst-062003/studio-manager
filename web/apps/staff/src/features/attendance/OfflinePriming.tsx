// §6.1's step 6 — `offline prime`, and the sentence that makes it a gate:
//
//   "**Offline priming is not optional.** A coach whose very first session is in a basement
//   with no signal must already have the roster. The first launch **blocks** on this fetch
//   with a short progress indicator, and it re-runs on every foreground resume."
//
// So this renders **instead of** the app while it runs, not beside it. A progress indicator
// the coach can dismiss is a coach who reaches Today with an empty cache, which is the exact
// failure the blocking exists to prevent.
//
// It re-runs on foreground resume, which is where §10.4's 24-hour rule lands: `needsPriming`
// answers `true` for a store that has never been primed **and** for one whose window is a day
// old, and the two are the same fetch at different urgencies — a first launch blocks, a stale
// resume refreshes behind the roster the coach already has.
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { needsPriming, offlineStore, primeOfflineCache } from '@studio/core'
import type { PrimeState } from '@studio/core'
import type { StaffAttendanceClient } from './client'

export function useOfflinePriming(
  client: StaffAttendanceClient,
  clock: () => string = () => new Date().toISOString(),
  /** S4.2 — the prime WAITS for a resolved session. It used to race `/auth/refresh`,
   *  firing bootstrap four times into 401s on every cold start — self-healing, but four
   *  logged auth failures and a slower first paint on the app that most needs one. */
  enabled = true,
): { state: PrimeState; retry: () => void } {
  const [state, setState] = useState<PrimeState>('idle')

  const prime = useCallback(async () => {
    const store = offlineStore()
    // A store that already holds a fresh window does not block. §6.1's gate is about the
    // FIRST launch; a coach opening the app for the fourth time today has the rosters and
    // should not watch a spinner for them.
    if (!(await needsPriming(store, clock()))) {
      setState('ready')
      return
    }
    setState('priming')
    setState(
      await primeOfflineCache({
        store,
        getBootstrap: (window) => client.bootstrap(window),
        now: clock,
      }),
    )
  }, [client, clock])

  useEffect(() => {
    // `prime()` reaches setState, and react-hooks flags any setState an effect can reach
    // synchronously. It cannot tell that every one of them is behind an `await`: the first
    // statement inside is `await needsPriming(...)`, so the effect body has already yielded
    // before a single state update happens. Restructuring to satisfy the analysis would mean
    // a `setTimeout(…, 0)` whose only purpose is to be opaque to a linter, which is worse
    // than saying so here. The rule's own guidance — "subscribe for updates from some
    // external system, calling setState in a callback" — is exactly what this is; the
    // external system is the network and IndexedDB.
    if (!enabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void prime()
    // §6.1 — "it re-runs on every foreground resume". `visibilitychange` rather than
    // `focus`: a coach switching between the app and their camera roll mid-lesson triggers
    // focus repeatedly, and visibility is the event that actually means "back on screen".
    const onVisible = () => {
      if (document.visibilityState === 'visible') void prime()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [prime, enabled])

  return { state, retry: () => void prime() }
}

/**
 * The gate itself. Returns `null` once the cache is ready, so a caller renders
 * `<OfflinePrimingGate …/> ?? <TheApp/>` — the same shape `App.tsx` already uses for §6.5's
 * install walkthrough.
 */
export function OfflinePrimingGate({
  state,
  locale,
  onRetry,
}: {
  state: PrimeState
  locale: Locale
  onRetry: () => void
}) {
  if (state === 'ready') return null

  if (state === 'failed') {
    return (
      <section data-testid="priming-failed">
        <Alert iconLabel={t(locale, 'attendance.priming.failed')} live tone="danger">
          <strong>{t(locale, 'attendance.priming.failed')}</strong>
          {/* Said out loud, because the coach is about to walk into a basement and the app
              is telling them it is not ready. A silent retry button would leave them
              guessing whether it mattered. */}
          <span>{t(locale, 'attendance.priming.body')}</span>
        </Alert>
        <Button onClick={onRetry} variant="primary">
          {t(locale, 'attendance.priming.retry')}
        </Button>
      </section>
    )
  }

  return (
    <section data-testid="priming" role="status">
      <h1>{t(locale, 'attendance.priming.title')}</h1>
      <p>{t(locale, 'attendance.priming.body')}</p>
    </section>
  )
}
