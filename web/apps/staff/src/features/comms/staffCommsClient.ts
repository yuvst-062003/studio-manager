// The staff app's §5.11 and §5.12 endpoints.
//
// **Deliberately not shared with the parent app's client.** They are different surfaces of
// the same API: a coach registers `app: 'staff'`, reads their own at-risk alerts and their own
// coach feed, and never touches the announcement composer (that is the dashboard's). Sharing
// would mean a module in `web/packages/core`, which this lane does not own — and the shape
// that would be shared is three lines of `fetch` around endpoints that differ per surface.
import type { components } from '@studio/api-client'

export type NotificationOut = components['schemas']['NotificationOut']
export type CalendarFeedOut = components['schemas']['CalendarFeedOut']
export type NotificationPreferencesOut = components['schemas']['NotificationPreferencesOut']
export type VapidPublicKeyOut = components['schemas']['VapidPublicKeyOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

/**
 * §5.14's at-risk payload, as this lane fixes it in `app/services/comms/kinds.py::AT_RISK`.
 *
 * Lane REPORTS (M9) fills it; the card below reads it. `contact_phone` is nullable because a
 * family record may genuinely carry no number, and the card says so rather than rendering a
 * dead `tel:` link.
 */
export type AtRiskPayload = {
  student_id?: string
  group_id?: string
  contact_person_id?: string
  contact_phone?: string | null
  missed_count?: number
}

export const AT_RISK_KIND = 'attendance.at_risk'

export function makeStaffCommsClient(fetcher: Fetcher) {
  return {
    /** §5.14's alerts, from this coach's own inbox rather than from a report. */
    atRisk: async (): Promise<{ items: NotificationOut[] }> =>
      json(await fetcher(`/api/v1/notifications?unread=true&kind=${AT_RISK_KIND}`)),

    markRead: async (notificationId: string): Promise<NotificationOut> =>
      json(await fetcher(`/api/v1/notifications/${notificationId}/read`, { method: 'POST' })),

    /** HB-push-transport's public half. `null` when this environment has no VAPID key pair
     * configured -- see `app/core/config.py`. */
    vapidPublicKey: async (): Promise<VapidPublicKeyOut> =>
      json(await fetcher('/api/v1/push/vapid-public-key')),

    registerPush: async (token: string, platform: 'ios' | 'android' | 'web') =>
      json(
        await fetcher('/api/v1/push-tokens', {
          method: 'POST',
          headers: JSON_HEADERS,
          // `app: 'staff'`, and that is the whole difference from the parent client. §6.5's
          // install report counts the two apart, because a coach who is also a parent has
          // two installs and a cancellation lands in only one of them.
          body: JSON.stringify({ token, app: 'staff', platform }),
        }),
      ),

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

    calendarFeeds: async (): Promise<{ feeds: CalendarFeedOut[] }> =>
      json(await fetcher('/api/v1/calendar-feeds')),

    rotateFeed: async (feedId: string): Promise<CalendarFeedOut> =>
      json(await fetcher(`/api/v1/calendar-feeds/${feedId}/rotate`, { method: 'POST' })),
  }
}

export type StaffCommsClient = ReturnType<typeof makeStaffCommsClient>

/** §5.12's `webcal://` scheme — the one that opens a SUBSCRIBE sheet rather than a download. */
export function webcalUrl(url: string): string {
  return url.replace(/^https?:\/\//, 'webcal://')
}

export function googleSubscribeUrl(url: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`
}
