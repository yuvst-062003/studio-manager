// §5.14's at-risk alert — the `alert-centre` fill, and the one-tap contact that makes it one.
//
// > "Students at risk — three or more consecutive **expected** sessions missed. **This fires a
// > notification to the group's coaches and to managers with a one-tap 'צור קשר עם ההורה'** —
// > it is not left sitting in a report nobody opens."
//
// **So it reads an inbox, not a report.** The rows come from `GET /notifications?kind=
// attendance.at_risk`, which is this person's own alerts — the ones §5.11's fan-out actually
// delivered to them. A card that queried a report would show a coach every at-risk student in
// the club, including the ones in groups they do not teach.
//
// **`tel:` and not a phone number rendered as text.** One tap has to dial, on a phone, held in
// one hand, beside a mat. `payload.contact_phone` is what it dials — and where a family record
// carries no number the card says `atRisk.noPhone` rather than rendering a dead link, because
// a link that does nothing is worse than a sentence explaining why.
//
// **Nothing is produced by this lane.** Plan W5 makes lane REPORTS the caller: its at-risk job
// raises the notification through `NotificationService.enqueue`. Until M9 merges this renders
// nothing, which is the correct state for the callee half of a pair — and the empty case is
// tested directly rather than assumed.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { AtRiskPayload, NotificationOut, StaffCommsClient } from './staffCommsClient'

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

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  textAlign: 'start',
}

const bodyStyle: CSSProperties = { color: 'var(--fg)', margin: 0 }

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const callStyle: CSSProperties = {
  alignItems: 'center',
  alignSelf: 'flex-start',
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--fg)',
  display: 'inline-flex',
  // §6.2 — "large tap targets ... no interaction requiring precision". 44px is the smallest
  // target iOS treats as reliably hittable, and a coach is using this on a mat.
  minBlockSize: '44px',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  textDecoration: 'none',
}

/** Sorted worst-first: the child who has missed most is the call to make today. */
export function byMostMissed(rows: NotificationOut[]): NotificationOut[] {
  return [...rows].sort(
    (a, b) =>
      ((b.payload as AtRiskPayload)?.missed_count ?? 0) -
      ((a.payload as AtRiskPayload)?.missed_count ?? 0),
  )
}

export function AtRiskAlert({ client, locale }: { client: StaffCommsClient; locale: Locale }) {
  const [rows, setRows] = useState<NotificationOut[]>([])

  useEffect(() => {
    let live = true
    client
      .atRisk()
      .then((page) => live && setRows(byMostMissed(page.items)))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client])

  const acknowledge = useCallback(
    (id: string) => {
      setRows((current) => current.filter((row) => row.id !== id))
      void client.markRead(id).catch(() => undefined)
    },
    [client],
  )

  // Renders NOTHING rather than an empty panel. §5.14's alert centre is "everything that
  // requires a decision", and a permanent "no students at risk" card is a row that never
  // requires one — which is how an alert centre becomes a list nobody scans.
  if (rows.length === 0) return null

  return (
    <section style={sectionStyle} aria-labelledby="at-risk-title" data-testid="at-risk-alert">
      <h2 id="at-risk-title" style={titleStyle}>
        {t(locale, 'comms.atRisk.title')}
      </h2>
      {rows.map((row) => {
        const payload = (row.payload ?? {}) as AtRiskPayload
        const phone = payload.contact_phone ?? null
        return (
          <Card key={row.id}>
            <div style={rowStyle} data-testid={`at-risk-${row.id}`}>
              <p style={bodyStyle}>{row.body}</p>
              {phone ? (
                <a
                  href={`tel:${phone}`}
                  onClick={() => acknowledge(row.id)}
                  style={callStyle}
                  data-testid={`at-risk-call-${row.id}`}
                >
                  {t(locale, 'comms.atRisk.contactParent')}
                </a>
              ) : (
                <p style={hintStyle}>{t(locale, 'comms.atRisk.noPhone')}</p>
              )}
            </div>
          </Card>
        )
      })}
    </section>
  )
}
