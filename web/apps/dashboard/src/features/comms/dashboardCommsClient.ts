// The dashboard's §5.11 endpoints — the publisher's side, plus the two screens that make a
// silent delivery failure visible.
//
// **This is the only surface with a composer.** §5.11's publishers are a manager anywhere in
// the studio and a lead coach in their own groups, and both work here. The parent app has no
// send method at all — §2.3 puts two-way chat out of scope.
import type { components } from '@studio/api-client'

export type AnnouncementOut = components['schemas']['AnnouncementOut']
export type DeliveryReportOut = components['schemas']['DeliveryReportOut']
export type MissedRecipientOut = components['schemas']['MissedRecipientOut']
export type InstallStateOut = components['schemas']['InstallStateOut']
export type NotificationOut = components['schemas']['NotificationOut']
export type AnnouncementScope = AnnouncementOut['scope_type']

export type Page<T> = { items: T[]; next_cursor: string | null; has_more: boolean }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export const AT_RISK_KIND = 'attendance.at_risk'

export function makeDashboardCommsClient(fetcher: Fetcher) {
  return {
    list: async (): Promise<Page<AnnouncementOut>> => json(await fetcher('/api/v1/announcements')),

    create: async (body: {
      title: string
      body: string
      scope_type: AnnouncementScope
      scope_id: string | null
      scheduled_for?: string | null
    }): Promise<AnnouncementOut> =>
      json(
        await fetcher('/api/v1/announcements', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        }),
      ),

    publish: async (id: string): Promise<AnnouncementOut> =>
      json(await fetcher(`/api/v1/announcements/${id}/publish`, { method: 'POST' })),

    /** `audience.recipients` — יגיע ל-{{count}} משפחות, before there is a row to hang it off. */
    audienceSize: async (
      scopeType: AnnouncementScope,
      scopeId: string | null,
    ): Promise<{ recipient_count: number }> =>
      json(
        await fetcher('/api/v1/announcements/audience-preview', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ scope_type: scopeType, scope_id: scopeId }),
        }),
      ),

    deliveryReport: async (id: string): Promise<DeliveryReportOut> =>
      json(await fetcher(`/api/v1/announcements/${id}/delivery`)),

    /** Only `failed` sends are retryable — see the button's own comment. */
    resend: async (id: string): Promise<{ retried_count: number }> =>
      json(await fetcher(`/api/v1/announcements/${id}/resend`, { method: 'POST' })),

    installState: async (): Promise<InstallStateOut> =>
      json(await fetcher('/api/v1/comms/install-state')),

    atRisk: async (): Promise<{ items: NotificationOut[] }> =>
      json(await fetcher(`/api/v1/notifications?unread=true&kind=${AT_RISK_KIND}`)),

    markRead: async (notificationId: string): Promise<NotificationOut> =>
      json(await fetcher(`/api/v1/notifications/${notificationId}/read`, { method: 'POST' })),
  }
}

export type DashboardCommsClient = ReturnType<typeof makeDashboardCommsClient>

/**
 * §5.11's `שלח גם בוואטסאפ`, and §12 is why it is a URL rather than an integration.
 *
 * "The WhatsApp Groups API caps a group at 8 participants (the business number takes one) and
 * exposes NO endpoint to add a participant... Only a share-sheet handoff is viable." And the
 * unofficial libraries "violate WhatsApp ToS; the phone number gets banned" — unusable in a
 * product that would be risking *customers'* numbers.
 *
 * So: `https://wa.me/?text=`, which opens WhatsApp with the message pre-composed and lets the
 * manager pick the group themselves. No API, no cost, no dependency.
 */
export function whatsappShareUrl(title: string, body: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${title}\n\n${body}`)}`
}

/**
 * §5.11's `[ העתק מספרים ]` — "The manager pastes those numbers into the WhatsApp group the
 * club already has. Same outcome as automation, half a day of work, zero risk."
 *
 * Newline-separated, because that is what pastes usefully into a message. Families with no
 * number on file are dropped rather than pasted as a blank line.
 */
export function phoneList(missed: readonly MissedRecipientOut[] | undefined): string {
  return (missed ?? [])
    .map((row) => row.phone)
    .filter((phone): phone is string => Boolean(phone))
    .join('\n')
}
