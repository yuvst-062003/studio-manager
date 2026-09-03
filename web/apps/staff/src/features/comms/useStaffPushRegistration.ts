// §6.5's push registration for the staff app — and it is genuinely simpler than the parent's.
//
// **The iOS-in-a-tab state cannot occur here.** §6.5 and §10.6: "the staff app requires
// standalone mode" and `App.tsx` renders `InstallWalkthrough` INSTEAD of the app until
// `displayMode !== 'browser'`. So by the time anything in this feature is on screen, the app
// is already running from a home screen and the Push API exists. The parent app has no such
// gate — a guardian reaches `2b` in a Safari tab — which is why its hook carries a branch this
// one does not need.
//
// That asymmetry is the reason these are two files rather than one shared module. The other
// reason is mechanical: sharing would mean a module in `web/packages/core`, which this lane
// does not own.
import { useCallback, useMemo, useState } from 'react'
import { isIosSafari } from '@studio/ui'
import type { StaffCommsClient } from './staffCommsClient'

export type StaffPushState =
  'unsupported' | 'unasked' | 'pre-prompt' | 'denied' | 'registered' | 'error'

type PushCapableNavigator = Navigator & { serviceWorker?: ServiceWorkerContainer }

export function staffPlatformOf(userAgent: string): 'ios' | 'android' | 'web' {
  if (isIosSafari(userAgent)) return 'ios'
  return /Android/i.test(userAgent) ? 'android' : 'web'
}

/**
 * Duplicated from the parent app's `usePushRegistration.ts` rather than shared, for the same
 * reason this whole file is separate from that one: sharing would mean a module in
 * `web/packages/core`, which this lane does not own.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = globalThis.atob(base64)
  // `new Uint8Array(length)`, not `.from()` -- see the parent app's `usePushRegistration.ts`
  // for why `.from()`'s `Uint8Array<ArrayBufferLike>` fails `BufferSource`.
  const bytes = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) bytes[i] = rawData.charCodeAt(i)
  return bytes
}

export function useStaffPushRegistration(
  client: StaffCommsClient,
  { userAgent = globalThis.navigator?.userAgent ?? '' }: { userAgent?: string } = {},
) {
  const platform = useMemo(() => staffPlatformOf(userAgent), [userAgent])
  const initial = useMemo<StaffPushState>(() => {
    if (typeof globalThis.Notification === 'undefined') return 'unsupported'
    return globalThis.Notification.permission === 'denied' ? 'denied' : 'unasked'
  }, [])
  const [state, setState] = useState<StaffPushState>(initial)

  const offer = useCallback(() => setState('pre-prompt'), [])
  const decline = useCallback(() => setState('unasked'), [])

  /**
   * §5.11's pre-prompt applies here too, and for the same reason: on iOS a denial is permanent
   * and cannot be re-requested in-app. A coach who refuses on launch stops receiving §5.14's
   * at-risk alerts for the rest of the season.
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
      // HB-push-transport's second break, same as the parent app's: this used to call
      // `subscribe` with no `applicationServerKey` at all.
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
      setState('error')
    }
  }, [client, platform])

  return { state, platform, offer, decline, ask }
}
