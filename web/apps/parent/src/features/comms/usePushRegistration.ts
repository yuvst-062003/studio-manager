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
import { useCallback, useEffect, useMemo, useState } from 'react'
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
 * The device's record of the LAST launch's answer — bug #27.
 *
 * `localStorage`, the same convention `THEME_STORAGE_KEY` follows: this is a device-level
 * preference, and the OS permission it is about is device-level too. A parent who answers
 * on their phone and later opens the app on a tablet is a parent who has never been asked
 * on that tablet, which is the honest reading.
 *
 * **It stores which answer, not merely that one was given.** The key it replaces
 * (`PUSH_DECLINED_KEY`, below) recorded only a refusal, so a parent who said YES had
 * nothing written down at all — and `initial` mapped their granted permission back to
 * `'unasked'`, which is the exact state that draws the invitation. The owner walked the
 * deployed app on 2026-09-08 and met that invitation on every launch.
 */
export const PUSH_ANSWER_KEY = 'studio.parent.push-answer'

/**
 * The 2026-09-07 key, still READ and never written.
 *
 * Every parent who declined before #27 landed has this set and nothing under
 * `PUSH_ANSWER_KEY`. Dropping it would ask all of them again on their next launch —
 * which is the bug, arriving from the other direction.
 */
export const PUSH_DECLINED_KEY = 'studio.parent.push-declined'

export type PushAnswer = 'granted' | 'declined'

function rememberedAnswer(): PushAnswer | null {
  try {
    const answer = globalThis.localStorage?.getItem(PUSH_ANSWER_KEY)
    if (answer === 'granted' || answer === 'declined') return answer
    return globalThis.localStorage?.getItem(PUSH_DECLINED_KEY) == null ? null : 'declined'
  } catch {
    // A private window, or storage the browser refuses. Asking again is the safe direction:
    // the worst case is one more invitation, and the alternative is silently never offering
    // push to a parent whose browser blocks storage.
    //
    // `== null` above and not `!== null`: `globalThis.localStorage?.…` is `undefined` when
    // there is no storage object at all, and `undefined !== null` is `true` — which read as
    // "this parent declined" on every browser without storage.
    return null
  }
}

function remember(answer: PushAnswer): void {
  try {
    globalThis.localStorage?.setItem(PUSH_ANSWER_KEY, answer)
  } catch {
    // Storage refused. The answer still holds for this session — worse than remembering it,
    // better than ignoring the answer the parent just gave.
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
 * Make the server's idea of this device match the browser's. Silent, and safe to call on
 * every launch.
 *
 * **The bug it closes.** A push endpoint is not permanent: browsers rotate one when their
 * push service moves, and the old endpoint then 410s for good. Nothing noticed. `initial`
 * below reads `Notification.permission`, finds `granted`, and reports `'registered'` — true
 * of the PERMISSION and false of the SUBSCRIPTION — so the app says `הודעות פעילות` for a
 * device the server can no longer reach, while the delivery report says `failed`. Those two
 * screens are read by different people and neither one is wrong on its own.
 *
 * `tools/push-sw-source.js` handles `pushsubscriptionchange` and re-subscribes, but a service
 * worker holds no access token (`packages/core/src/identity/session.ts` keeps that in the
 * page's memory) so it cannot tell our server. This is the half that can.
 *
 * **It never asks for anything.** It runs only when the permission is ALREADY `granted`, so
 * `subscribe()` opens no dialog. §6.5 gives iOS exactly one chance at that dialog and a
 * reconcile that spent it would be far worse than the endpoint it was fixing.
 *
 * **It never changes what the parent is shown.** A failure here is a network blip as often
 * as a real problem, and flipping a working install to an error state on a bad connection
 * would teach parents to ignore the banner that matters. `POST /push-tokens` answers 201 to
 * a re-registration deliberately, which is what makes calling this unconditionally cheap.
 */
export async function reconcilePushRegistration(
  client: Pick<ParentCommsClient, 'vapidPublicKey' | 'registerPush'>,
  platform: 'ios' | 'android' | 'web',
): Promise<void> {
  if (typeof globalThis.Notification === 'undefined') return
  if (globalThis.Notification.permission !== 'granted') return
  try {
    const navigatorWithSW = globalThis.navigator as PushCapableNavigator
    const registration = await navigatorWithSW.serviceWorker?.ready
    if (!registration) return
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      // Granted, and yet no subscription: the browser dropped one without handing the worker
      // anything to re-subscribe with. This device will never buzz again unless the page
      // does it, and the page is here.
      const { public_key: publicKey } = await client.vapidPublicKey()
      if (!publicKey) return
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }
    if (!subscription) return
    await client.registerPush(JSON.stringify(subscription), platform)
  } catch {
    // See the docstring: silent on purpose.
  }
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
    // **#27.** This returned `'unasked'` — and `'unasked'` is the state `PushSetting` draws
    // the invitation for, so the one parent who had already said yes was asked again on
    // every single launch. A granted permission IS an answer, and the most recent one:
    // whatever this device has written down, the OS outranks it.
    if (globalThis.Notification.permission === 'granted') return 'registered'
    // Checked AFTER the permission states, never before: the OS is the authority on whether
    // push is on, and a remembered answer must not hide a `denied` banner §5.11 requires.
    //
    // A remembered `'granted'` reaching here means the parent granted and later revoked the
    // permission in OS settings. `'declined'` is the right state for both: it says nothing
    // is on, it nags nobody, and it keeps the one door — Settings' `push-enable` button —
    // open for a parent who walks in to change their mind.
    if (rememberedAnswer() !== null) return 'declined'
    return 'unasked'
  }, [platform, displayMode])

  const [state, setState] = useState<PushState>(initial)
  // `initial` is recomputed when the display mode changes — an iOS parent who installs
  // mid-session moves from `unsupported-ios-tab` to askable without a reload. `useState`'s
  // initialiser only runs once, so the derived value wins until something is asked.
  const effective = state === 'unasked' ? initial : state

  // Settings is one of the two places this runs; `App.tsx` runs it at launch, which is the
  // one that actually catches a rotation — a parent who never opens Settings would otherwise
  // never reconcile. One function, two callers, rather than two implementations.
  useEffect(() => {
    if (platform === 'ios' && displayMode === 'browser') return
    void reconcilePushRegistration(client, platform)
  }, [client, platform, displayMode])

  /** Show §5.11's value pre-prompt. Never the OS dialog directly. */
  const offer = useCallback(() => setState('pre-prompt'), [])
  const decline = useCallback(() => {
    remember('declined')
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
    // #27 — written the moment the OS answers, and BEFORE the subscribe that can fail.
    // The parent has answered either way; whether the token then reached our server is a
    // different question, and the `error` state below is what says so. Recording it only
    // on the happy path would have a parent whose `subscribe()` failed asked again next
    // launch, which is the bug this key exists to close.
    remember('granted')
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
      // `'declined'`, not `'unasked'` — #27 made that distinction load-bearing. `'unasked'`
      // now falls through to `initial`, and `initial` reads the OS permission, which
      // `unsubscribe()` does not revoke: a parent who switched notifications OFF would have
      // been told, one render later, that they were on. Turning them off IS an answer, so
      // it is recorded like one.
      remember('declined')
      setState('declined')
    } catch {
      setState('error')
    }
  }, [client])

  return { state: effective, platform, offer, decline, ask, turnOff }
}
