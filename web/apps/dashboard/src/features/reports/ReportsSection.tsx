// 4g, built (design pass 2026-08-27). M9 shipped the reports backend and no screen ever
// existed for it — the one artboard whose gap was a missing feature rather than missing
// styling. Deliberately modest, and monochrome by the artboard's own rule ("דוחות …
// ללא גרפים צבעוניים"): one month at a time, the four numbers that run a club's money
// conversation, and a completion bar. The send-monthly action landed in the feature pass
// (2026-08-27) BEHIND a modal confirm — it emails a real inbox, and the confirm is what
// makes "by accident" impossible rather than merely unlikely.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import { Alert, Button, Card, EmptyState, LoadFailed, MoneyDisplay, ProgressBar, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type MonthlySummary = {
  period_year: number
  period_month: number
  total_students: number
  total_agorot: number
  settled_agorot: number
  overdue_agorot: number
  pending_agorot: number
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const statRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
  gap: 'var(--space-3)',
}

const statLabelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  marginBlockEnd: 'var(--space-1)',
}

const statValueStyle: CSSProperties = {
  fontSize: 'var(--text-title)',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
}

function shift(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

const confirmStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '34rem',
  inlineSize: '100%',
  padding: 'var(--space-5)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
}

/** ImpactDialog's local shape, not a primitive — heading, body, cancel-then-confirm. */
function SendConfirm({
  locale,
  monthLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  locale: Locale
  monthLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useModalDialog(true, onCancel)
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-monthly-title"
      data-testid="send-monthly-dialog"
      ref={dialogRef}
      style={confirmStyle}
      tabIndex={-1}
    >
      <h3 id="send-monthly-title" style={{ margin: 0 }}>
        {t(locale, 'reports.send.title')}
      </h3>
      <p style={{ margin: 0 }}>{t(locale, 'reports.send.body').replace('{{month}}', monthLabel)}</p>
      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={onCancel} data-testid="send-monthly-cancel">
          {t(locale, 'reports.send.cancel')}
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy} data-testid="send-monthly-confirm">
          {t(locale, 'reports.send.confirm')}
        </Button>
      </div>
    </div>
  )
}

export function ReportsSection({
  locale,
  studioId,
  selfPersonId,
}: {
  locale: Locale
  studioId: string
  /** The signed-in manager's own person — where the emailed report goes. */
  selfPersonId: string | null
}) {
  const now = useMemo(() => new Date(), [])
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const response = await apiFetch(
          `/api/v1/reports/${studioId}/monthly?year=${period.year}&month=${period.month}`,
        )
        if (!alive) return
        if (!response.ok) {
          setFailed(true)
          setSummary(null)
          return
        }
        setFailed(false)
        setSummary((await response.json()) as MonthlySummary)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [studioId, period, attempt])

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(period.year, period.month - 1, 15)),
  )

  async function send() {
    if (selfPersonId === null) return
    setSendState('sending')
    try {
      const response = await apiFetch(`/api/v1/reports/${studioId}/send-monthly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: period.year,
          month: period.month,
          to_person_id: selfPersonId,
        }),
      })
      setSendState(response.ok ? 'sent' : 'failed')
    } catch {
      setSendState('failed')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <section aria-labelledby="reports-title" style={pageStyle} data-testid="reports-screen">
      <div className="studio-page-header">
        <h2 id="reports-title">{t(locale, 'reports.title')}</h2>
        <Button variant="secondary" onClick={() => setPeriod((p) => shift(p.year, p.month, -1))}>
          {t(locale, 'reports.period.lastMonth')}
        </Button>
        <span style={{ fontWeight: 500 }} data-testid="reports-period">
          {monthLabel}
        </span>
        <Button variant="secondary" onClick={() => setPeriod((p) => shift(p.year, p.month, 1))}>
          {t(locale, 'reports.period.nextMonth')}
        </Button>
        {selfPersonId !== null ? (
          <Button
            variant="primary"
            data-testid="send-monthly"
            disabled={sendState === 'sending'}
            onClick={() => setConfirming(true)}
          >
            {t(locale, 'reports.send.button')}
          </Button>
        ) : null}
      </div>

      {confirming ? (
        <SendConfirm
          locale={locale}
          monthLabel={monthLabel}
          busy={sendState === 'sending'}
          onConfirm={() => void send()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
      {sendState === 'sent' ? (
        <Alert tone="paid" live iconLabel={t(locale, 'reports.send.button')}>
          {t(locale, 'reports.send.done')}
        </Alert>
      ) : null}
      {sendState === 'failed' ? (
        <Alert tone="danger" live iconLabel={t(locale, 'reports.send.button')}>
          {t(locale, 'common.error.generic')}
        </Alert>
      ) : null}

      {/* F1a and P8's money rule in one: a FAILED read must never wear the empty
          state — 'no revenue this month' and 'we could not load this' are different
          facts, and the first is a statement about money. */}
      {failed ? (
        <LoadFailed
          locale={locale}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      ) : summary && summary.total_agorot === 0 && summary.total_students === 0 ? (
        <EmptyState title={t(locale, 'reports.empty')} />
      ) : summary ? (
        <>
          <div style={statRowStyle} data-testid="reports-stats">
            <Card>
              <div style={statLabelStyle}>{t(locale, 'reports.financial.expected')}</div>
              <div style={statValueStyle}>
                <MoneyDisplay agorot={summary.total_agorot} />
              </div>
            </Card>
            <Card>
              <div style={statLabelStyle}>{t(locale, 'reports.financial.collected')}</div>
              <div style={statValueStyle}>
                <MoneyDisplay agorot={summary.settled_agorot} />
              </div>
            </Card>
            <Card>
              <div style={statLabelStyle}>{t(locale, 'reports.overview.outstandingDebt')}</div>
              <div style={statValueStyle}>
                <MoneyDisplay agorot={summary.overdue_agorot} />
              </div>
            </Card>
            <Card>
              <div style={statLabelStyle}>{t(locale, 'reports.financial.notYetDue')}</div>
              <div style={statValueStyle}>
                <MoneyDisplay agorot={summary.pending_agorot} />
              </div>
            </Card>
          </div>
          <Card>
            <div style={statLabelStyle}>{t(locale, 'reports.financial.collectedVsExpected')}</div>
            <ProgressBar
              value={summary.settled_agorot}
              max={summary.total_agorot}
              label={t(locale, 'reports.financial.collectionRate')}
            />
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-muted)' }}>
              {t(locale, 'reports.financial.studentsBilled')}: {summary.total_students}
            </p>
          </Card>
        </>
      ) : null}
    </section>
  )
}
