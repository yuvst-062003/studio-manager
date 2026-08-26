// §5.11's post-send screen, drawn as the spec draws it.
//
//     ביטול שיעור — ג'ודו/מתחילים, היום 17:00
//
//     נשלח ל-24 משפחות
//     ✓ 19 קיבלו
//     ⚠ 5 לא קיבלו — התראות כבויות
//
//       יעל כהן        054-123-4567
//       דנה לוי        052-987-6543
//
//     [ העתק מספרים ]        [ שלח שוב ]
//
// **The numbers are the feature, not the counts.** §5.11 permits no email, no SMS and no
// WhatsApp channel, so a family whose push did not land and who is not reading the inbox is
// reachable only by telephone. "5 didn't receive it" tells a manager that five children may
// turn up to a cancelled class without telling them which five.
//
// **There is no resend button, and that is a decision rather than an omission.** Only a
// `failed` push is retryable at all — `no_token` means there is no device and `denied` means
// the person said no — so the button would frequently do nothing. More to the point, §5.11's
// own remedy for a missed push is "the WhatsApp group the club already has", and a group post
// reaches all twenty-four families rather than the five this report names. A per-family retry
// solves a problem the group solves better. `POST /announcements/{id}/resend` still exists on
// the API for a `failed` state; nothing on this screen calls it.
//
// **This screen is behind a link, not on the page.** The report matters for one case — a
// cancellation a couple of hours out, where a family who does not know will put their child in
// the car. For a new event or a belt exam the mailbox is enough on its own, and a delivery
// report on every send is a screen nobody reads.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type {
  AnnouncementOut,
  DashboardCommsClient,
  DeliveryReportOut,
} from './dashboardCommsClient'
import { phoneList, whatsappShareUrl } from './dashboardCommsClient'

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const lineStyle: CSSProperties = { color: 'var(--fg)', margin: 0 }

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'space-between',
  paddingBlock: 'var(--space-1)',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const linkStyle: CSSProperties = {
  alignItems: 'center',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-2)',
  color: 'var(--fg)',
  display: 'inline-flex',
  minBlockSize: '44px',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  textDecoration: 'none',
}

/**
 * `delivery.inFlight` is the DIFFERENCE, and there is no fourth count on the wire.
 *
 * `DeliveryReportOut` deliberately carries three: a `queued` push is neither received nor
 * missed, because reporting one as a miss would send a manager chasing a family whose phone is
 * about to buzz. A fourth field would be derivable from the other three and free to disagree
 * with them.
 */
export function inFlightCount(report: DeliveryReportOut): number {
  return report.sent_count - report.received_count - report.missed_count
}

export function DeliveryReport({
  announcement,
  client,
  locale,
  onCopy,
}: {
  announcement: AnnouncementOut
  client: DashboardCommsClient
  locale: Locale
  onCopy?: (text: string) => void
}) {
  const [report, setReport] = useState<DeliveryReportOut | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    client
      .deliveryReport(announcement.id)
      .then((next) => live && setReport(next))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, announcement.id])

  const copy = useCallback(() => {
    if (!report) return
    const text = phoneList(report.missed)
    if (onCopy) onCopy(text)
    else void globalThis.navigator?.clipboard?.writeText(text)
    setCopied(true)
  }, [report, onCopy])

  if (!report) return null

  const inFlight = inFlightCount(report)

  return (
    <section style={sectionStyle} aria-labelledby="delivery-title" data-testid="delivery-report">
      <h2 id="delivery-title" style={titleStyle}>
        {t(locale, 'comms.delivery.title')}
      </h2>

      <p style={lineStyle}>
        {t(locale, 'comms.delivery.sent').replace('{{count}}', String(report.sent_count))}
      </p>
      <p style={lineStyle}>
        {t(locale, 'comms.delivery.received').replace('{{count}}', String(report.received_count))}
      </p>

      {inFlight > 0 ? (
        <p style={hintStyle} data-testid="delivery-in-flight">
          {t(locale, 'comms.delivery.inFlight')}
        </p>
      ) : null}

      {report.missed_count === 0 ? (
        <p style={lineStyle}>{t(locale, 'comms.delivery.allReceived')}</p>
      ) : (
        <>
          <Alert tone="pending" iconLabel={t(locale, 'comms.delivery.missed')}>
            {t(locale, 'comms.delivery.missed').replace('{{count}}', String(report.missed_count))}
          </Alert>

          {(report.missed ?? []).map((row) => (
            <Card key={row.person_id}>
              <div style={rowStyle} data-testid={`missed-${row.person_id}`}>
                <span style={lineStyle}>{row.name}</span>
                {/* The number, as text a manager can read AND as a link they can tap. */}
                <span style={lineStyle}>{row.phone ?? ''}</span>
                {/* Never merged. `no_token`, `denied` and `failed` are three conversations:
                    help them install, ask them to turn the permission on, retry. */}
                <span style={hintStyle}>{t(locale, `comms.delivery.reason.${row.reason}`)}</span>
              </div>
            </Card>
          ))}

          <div style={actionsStyle}>
            <Button variant="secondary" onClick={copy}>
              {t(locale, 'comms.delivery.copyNumbers')}
            </Button>
            {/* §12 — the Groups API caps a group at 8 participants and exposes no endpoint to
                add one; the unofficial libraries get the number banned. A share-sheet URL is
                the only viable handoff, and it is deliberately not an integration. */}
            <a
              href={whatsappShareUrl(announcement.title, announcement.body)}
              rel="noreferrer"
              style={linkStyle}
              target="_blank"
            >
              {t(locale, 'comms.delivery.shareToWhatsapp')}
            </a>
          </div>

          {copied ? (
            <p style={hintStyle} data-testid="numbers-copied">
              {t(locale, 'comms.delivery.numbersCopied')}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
