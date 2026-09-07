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
  /**
   * The parent said no to the value pre-prompt. Nothing is offered again.
   *
   * **This state did not exist until 2026-09-07, and its absence was the bug.** `decline`
   * set the state back to `'unasked'` — the exact state that draws the offer — so a parent
   * who declined was returned to the start and asked again on the next visit, and the next,
   * forever. §5.11 wants the DENIED banner to persist, which it still does; it never asked
   * for the invitation to.
   */
  | 'declined'
  /** The value pre-prompt is on screen; the OS dialog has not been opened. */
  | 'pre-prompt'
  /** The OS refused. §5.11's persistent banner takes over from here. */
  | 'denied'
  /** Granted and registered with the API. */
  | 'registered'
  /** Granted, but the subscription or the API call failed. */
  | 'error'

type PushCapableNavigator = Navigator & { serviceWorker?: ServiceWorkerContainer }

/**
 * Where a decline is remembered.
 *
 * `localStorage`, not the server: this is a device-level preference like the theme and the
 * staff app's `TOUR_SEEN_KEY`, and the OS permission it is about is device-level too. A
 * parent who declines on their phone and later opens the app on a tablet is a parent who
 * has never been asked on that tablet, which is the honest reading.
 */
export const PUSH_DECLINED_KEY = 'studio.parent.push-declined'

function wasDeclined(): boolean {
  try {
    return globalThis.localStorage?.getItem(PUSH_DECLINED_KEY) !== null
  } catch {
    // A private window, or storage the browser refuses. Asking again is the safe direction:
    // the worst case is one more invitation, and the alternative is silently never offering
    // push to a parent whose browser blocks storage.
    return false
  }
}

export function platformOf(userAgent: string): 'ios' | 'android' | 'web' {
  if (isIosSafari(userAgent)) return 'ios'
  return /Android/i.test(userAgent) ? 'android' : 'web'
}

/**
 * `PushManager.subscribe`'s `applicationServerKey` wants raw bytes, and the server hands
 * back the VAPID public key as base64url (RFC 4648 §5, no padding) -- the standard MDN
 * conversion, exported so `useStaffPushRegistration.ts` and this hook's own tests read the
 * exact same bytes rather than two implementations that could quietly drift apart.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = globalThis.atob(base64)
  // `new Uint8Array(length)`, not `.from()` -- `.from()` infers `Uint8Array<ArrayBufferLike>`,
  // which `PushSubscriptionOptionsInit.applicationServerKey` (`BufferSource`) rejects because
  // `ArrayBufferLike` admits a `SharedArrayBuffer`. Allocating the length up front is backed
  // by a real `ArrayBuffer`.
  const bytes = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) bytes[i] = rawData.charCodeAt(i)
  return bytes
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
    // Checked AFTER the permission states, never before: the OS is the authority on whether
    // push is on, and a remembered decline must not hide a `denied` banner §5.11 requires.
    if (wasDeclined()) return 'declined'
    return 'unasked'
  }, [platform, displayMode])

  const [state, setState] = useState<PushState>(initial)
  // `initial` is recomputed when the display mode changes — an iOS parent who installs
  // mid-session moves from `unsupported-ios-tab` to askable without a reload. `useState`'s
  // initialiser only runs once, so the derived value wins until something is asked.
  const effective = state === 'unasked' ? initial : state

  /** Show §5.11's value pre-prompt. Never the OS dialog directly. */
  const offer = useCallback(() => setState('pre-prompt'), [])
  const decline = useCallback(() => {
    try {
      globalThis.localStorage?.setItem(PUSH_DECLINED_KEY, new Date().toISOString())
    } catch {
      // Storage refused. The decline still holds for this session — worse than remembering
      // it, better than ignoring the answer the parent just gave.
    }
    setState('declined')
  }, [])

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
      // HB-push-transport's second break: this used to call `subscribe` with no
      // `applicationServerKey` at all, which Chrome and Safari both reject outright. Fetched
      // rather than baked in at build time, so rotating the key pair needs no rebuild of
      // three separate PWA bundles.
      const { public_key: publicKey } = await client.vapidPublicKey()
      if (!publicKey) {
        setState('error')
        return
      }
      const navigatorWithSW = globalThis.navigator as PushCapableNavigator
      const registration = await navigatorWithSW.serviceWorker?.ready
      const subscription = await registration?.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
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

  /**
   * The other direction, for screen 8's notifications switch.
   *
   * **`unsubscribe()` is what actually stops the buzzing; the API call is bookkeeping.**
   * The stored token is `JSON.stringify(subscription)`, so the delete matches only if the
   * browser serialises it identically — normally it does, and when it does not the device
   * has still genuinely unsubscribed and the stale row simply stops resolving. Ordering
   * matters: tell the server first, because after `unsubscribe()` there is no token left
   * to name the row with.
   */
  const turnOff = useCallback(async () => {
    try {
      const navigatorWithSW = globalThis.navigator as PushCapableNavigator
      const registration = await navigatorWithSW.serviceWorker?.ready
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await client.deregisterPush(JSON.stringify(subscription))
        await subscription.unsubscribe()
      }
      setState('unasked')
    } catch {
      setState('error')
    }
  }, [client])

  return { state: effective, platform, offer, decline, ask, turnOff }
}
