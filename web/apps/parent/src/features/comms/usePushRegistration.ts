// §6.5's permission flow, and the branch the lane brief forbids collapsing.
//
// > "ON iOS, WEB PUSH EXISTS ONLY FOR A HOME-SCREEN WEB APP. In a Safari tab the Push API is
// > ABSENT — not denied, absent. There is nothing to request and no permission to grant.
// > Detect standalone display mode before you even consider showing a push prompt; on iOS in
// > a tab, show the install walkthrough instead. Android Chrome allows Web Push in a normal
// > tab, so the two platforms take different paths here and you must not share one code path
// > between them."
//
// So the FIRST thing this decides is which platform it is on, and the three outcomes are
// genuinely different states rather than three renderings of one:
//
//   iOS + browser display mode  → `unsupported-ios-tab`. Nothing to ask for. Teach the
//                                 install; a button here would do nothing when pressed and
//                                 the parent would conclude the app is broken.
//   iOS + standalone            → the API exists. Pre-prompt, then the OS dialog.
//   anything else               → Android/desktop Chromium. Web Push works in an ordinary
//                                 tab, so the install is not a precondition.
//
// **The value pre-prompt is not decoration.** §5.11 asks behind `נודיע לך אם שיעור מתבטל`
// first, and §6.5 is why: on iOS a denial is permanent and cannot be re-requested in-app.
// There is exactly one chance, and it is spent only after the parent has been told what it
// buys them.
import { useCallback, useMemo, useState } from 'react'
import { useDisplayMode } from '@studio/core'
import { isIosSafari } from '@studio/ui'
import type { ParentCommsClient } from './commsClient'

export type PushState =
  /** iOS in a Safari tab. The Push API is absent — §12: "not denied, absent". */
  | 'unsupported-ios-tab'
  /** This browser has no Push API at all (an old desktop, a webview). */
  | 'unsupported'
  /** Askable, and nothing has been asked yet. */
  | 'unasked'
  /** The value pre-prompt is on screen; the OS dialog has not been opened. */
  | 'pre-prompt'
  /** The OS refused. §5.11's persistent banner takes over from here. */
  | 'denied'
  /** Granted and registered with the API. */
  | 'registered'
  /** Granted, but the subscription or the API call failed. */
  | 'error'

type PushCapableNavigator = Navigator & { serviceWorker?: ServiceWorkerContainer }

export function platformOf(userAgent: string): 'ios' | 'android' | 'web' {
  if (isIosSafari(userAgent)) return 'ios'
  return /Android/i.test(userAgent) ? 'android' : 'web'
}

/**
 * `useDisplayMode()` is read rather than a build flag, and `app/../App.tsx` says why it must
 * stay that way: "M8 reports install rates from it, and a measurement that lies to make a dev
 * tab convenient is worse than the gate."
 */
export function usePushRegistration(
  client: ParentCommsClient,
  { userAgent = globalThis.navigator?.userAgent ?? '' }: { userAgent?: string } = {},
) {
  const displayMode = useDisplayMode()
  const platform = useMemo(() => platformOf(userAgent), [userAgent])

  const initial = useMemo<PushState>(() => {
    // The branch, first, before anything else is considered.
    if (platform === 'ios' && displayMode === 'browser') return 'unsupported-ios-tab'
    if (typeof globalThis.Notification === 'undefined') return 'unsupported'
    if (globalThis.Notification.permission === 'denied') return 'denied'
    if (globalThis.Notification.permission === 'granted') return 'unasked'
    return 'unasked'
  }, [platform, displayMode])

  const [state, setState] = useState<PushState>(initial)
  // `initial` is recomputed when the display mode changes — an iOS parent who installs
  // mid-session moves from `unsupported-ios-tab` to askable without a reload. `useState`'s
  // initialiser only runs once, so the derived value wins until something is asked.
  const effective = state === 'unasked' ? initial : state

  /** Show §5.11's value pre-prompt. Never the OS dialog directly. */
  const offer = useCallback(() => setState('pre-prompt'), [])
  const decline = useCallback(() => setState('unasked'), [])

  /**
   * The OS dialog, and only from the pre-prompt's accept button.
   *
   * Subscribes through the service worker registration the app ALREADY has —
   * `navigator.serviceWorker.ready` — rather than registering one here. The app's own
   * `registerSW.ts` owns that, and this lane does not.
   */
  const ask = useCallback(async () => {
    if (typeof globalThis.Notification === 'undefined') {
      setState('unsupported')
      return
    }
    const permission = await globalThis.Notification.requestPermission()
    if (permission !== 'granted') {
      setState('denied')
      return
    }
    try {
      const navigatorWithSW = globalThis.navigator as PushCapableNavigator
      const registration = await navigatorWithSW.serviceWorker?.ready
      const subscription = await registration?.pushManager.subscribe({
        userVisibleOnly: true,
      })
      if (!subscription) {
        setState('error')
        return
      }
      await client.registerPush(JSON.stringify(subscription), platform)
      setState('registered')
    } catch {
      // Granted but not registered. Reported as `error` rather than as `registered`, because
      // §5.11's whole point is that a doorbell nobody can hear must not look like one that
      // works — the delivery report would show `no_token` for this family and the office
      // would be told to help them install an app they already have.
      setState('error')
    }
  }, [client, platform])

  return { state: effective, platform, offer, decline, ask }
}
