// §5.14's at-risk card, on the manager's alert centre (`6c`).
//
// > "**This fires a notification to the group's coaches AND to managers with a one-tap
// > 'צור קשר עם ההורה'** — it is not left sitting in a report nobody opens."
//
// **Both audiences, and this is the manager's half.** The coach's copy lives in the staff app
// and is a different surface with a different alert centre; the fan-out already sent to both,
// so neither card queries a report and neither can show a student the reader was not told
// about.
//
// **A dashboard is a desktop browser, so `tel:` behaves differently — and it is still right.**
// On a laptop it hands off to the phone app or to a calling client; where the office has a
// desk phone it is at least a number they can read and dial. §5.14's requirement is one tap
// where one tap is possible and a visible number everywhere else, which is what this renders.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardCommsClient, NotificationOut } from './dashboardCommsClient'

export type AtRiskPayload = {
  student_id?: string
  group_id?: string
  contact_person_id?: string
  contact_phone?: string | null
  missed_count?: number
}

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
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'space-between',
}

const lineStyle: CSSProperties = { color: 'var(--fg)', margin: 0 }

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const callStyle: CSSProperties = {
  alignItems: 'center',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--fg)',
  display: 'inline-flex',
  minBlockSize: '44px',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  textDecoration: 'none',
}

/** Worst first: the child who has missed most is the call to make today. */
export function byMostMissed(rows: NotificationOut[]): NotificationOut[] {
  return [...rows].sort(
    (a, b) =>
      ((b.payload as AtRiskPayload)?.missed_count ?? 0) -
      ((a.payload as AtRiskPayload)?.missed_count ?? 0),
  )
}

export function AtRiskAlert({ client, locale }: { client: DashboardCommsClient; locale: Locale }) {
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

  // Nothing rather than an empty card. `6c` is "כל מה שדורש החלטה של המנהל", and a row that
  // never requires a decision is how that list stops being scanned.
  //
  // This is also the state until lane REPORTS merges — M9's job raises the kind.
  if (rows.length === 0) return null

  return (
    <section style={sectionStyle} aria-labelledby="at-risk-title" data-testid="at-risk-alert">
      <h2 id="at-risk-title" style={titleStyle}>
        {t(locale, 'comms.atRisk.title')}
      </h2>
      {rows.map((row) => {
        const phone = ((row.payload ?? {}) as AtRiskPayload).contact_phone ?? null
        return (
          <Card key={row.id}>
            <div style={rowStyle} data-testid={`at-risk-${row.id}`}>
              <p style={lineStyle}>{row.body}</p>
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
                <span style={hintStyle}>{t(locale, 'comms.atRisk.noPhone')}</span>
              )}
            </div>
          </Card>
        )
      })}
    </section>
  )
}
