// The parent app's §5.11 and §5.12 endpoints.
//
// **Narrow on purpose, and one direction only.** A guardian reads their own inbox, marks it
// read, switches their own notifications on and off, and manages their own calendar
// subscription. There is no send method and there will not be one: §2.3 puts in-app two-way
// chat out of scope, §5.11 permits exactly two levels — a push notification and a ONE-WAY
// inbox — and D9.1 cut `שיחה עם המשרד` from artboard `2b` for that reason. A `send()` here is
// how that decision gets reversed by somebody who thought they were adding a small thing.
import type { components } from '@studio/api-client'

export type NotificationOut = components['schemas']['NotificationOut']
export type CalendarFeedOut = components['schemas']['CalendarFeedOut']
export type NotificationPreferencesOut = components['schemas']['NotificationPreferencesOut']
export type PushTokenOut = components['schemas']['PushTokenOut']
export type VapidPublicKeyOut = components['schemas']['VapidPublicKeyOut']

export type Page<T> = { items: T[]; next_cursor: string | null; has_more: boolean }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeParentCommsClient(fetcher: Fetcher) {
  return {
    /** `2b`'s list. Newest first, cursor-paginated (G16). */
    inbox: async (after?: string | null): Promise<Page<NotificationOut>> =>
      json(await fetcher(`/api/v1/notifications${after ? `?after=${after}` : ''}`)),

    /** Idempotent server-side: a second call keeps the first `read_at`. */
    markRead: async (notificationId: string): Promise<NotificationOut> =>
      json(await fetcher(`/api/v1/notifications/${notificationId}/read`, { method: 'POST' })),

    markAllRead: async (): Promise<{ marked: number }> =>
      json(await fetcher('/api/v1/notifications/read-all', { method: 'POST' })),

    /**
     * HB-push-transport's public half, so `usePushRegistration.ts` can pass it as
     * `applicationServerKey`. `null` when this environment has no VAPID key pair configured
     * -- see `app/core/config.py`.
     */
    vapidPublicKey: async (): Promise<VapidPublicKeyOut> =>
      json(await fetcher('/api/v1/push/vapid-public-key')),

    /** §7's `POST /push-tokens`. Called after the OS grants permission, never before. */
    registerPush: async (
      token: string,
      platform: 'ios' | 'android' | 'web',
    ): Promise<PushTokenOut> =>
      json(
        await fetcher('/api/v1/push-tokens', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ token, app: 'parent', platform }),
        }),
      ),

    /**
     * Screen 8's notifications switch, turning them off.
     *
     * The token rides in the BODY, never the path — it is a credential, and a credential
     * in a URL ends up in access logs. Resolves on 204 and on an unknown token alike: the
     * switch reports the state the parent asked for, and a browser that lost its
     * subscription must land on "off" rather than on an error it cannot act on.
     */
    deregisterPush: async (token: string): Promise<void> => {
      await fetcher('/api/v1/push-tokens', {
        method: 'DELETE',
        headers: JSON_HEADERS,
        body: JSON.stringify({ token }),
      })
    },

    preferences: async (): Promise<NotificationPreferencesOut> =>
      json(await fetcher('/api/v1/notification-preferences')),

    setPreference: async (
      kindGroup: string,
      enabled: boolean,
    ): Promise<NotificationPreferencesOut> =>
      json(
        await fetcher('/api/v1/notification-preferences', {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ kind_group: kindGroup, enabled }),
        }),
      ),

    /** §5.12. Issues a feed the first time it is asked for; the same URL every time after. */
    calendarFeeds: async (): Promise<{ feeds: CalendarFeedOut[] }> =>
      json(await fetcher('/api/v1/calendar-feeds')),

    rotateFeed: async (feedId: string): Promise<CalendarFeedOut> =>
      json(await fetcher(`/api/v1/calendar-feeds/${feedId}/rotate`, { method: 'POST' })),
  }
}

export type ParentCommsClient = ReturnType<typeof makeParentCommsClient>

/**
 * §5.12's `webcal://` URL, from the `https://` one the API returns.
 *
 * The scheme is the whole point. `webcal://` opens the native SUBSCRIBE sheet on iOS and
 * macOS; the `https://` form downloads a one-off `.ics` snapshot that never updates again —
 * which looks like it worked and silently stops reflecting the timetable.
 */
export function webcalUrl(url: string): string {
  return url.replace(/^https?:\/\//, 'webcal://')
}

/**
 * §5.12's "הוסף ליומן Google" deep link.
 *
 * `render?cid=` is Google's subscribe-by-URL dialog. It takes the `https://` form, not the
 * `webcal://` one, and the URL has to be encoded because it carries the feed token.
 */
export function googleSubscribeUrl(url: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`
}
