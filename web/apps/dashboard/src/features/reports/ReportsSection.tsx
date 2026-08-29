// Dashboard artboard `4g` — דוחות · retention, revenue and attendance, without colourful
// charts.
//
// **The constraint was read as absence, and it means restraint.** The screen that shipped
// was a monthly money summary wearing the reports name: four billing cards, one month at
// a time, no chart of any kind. `4g` asks for restraint *and then asks for three charts* —
// a twelve-month stacked bar, four retention rows and a seven-bar belt distribution — with
// no y-axis, no tooltips and no legend beyond a swatch and a word. All three are here, and
// none of them brought a dependency: they are CSS grid and percentage heights, which is
// what a bar chart with no axes actually is. See `reports.css`.
//
// **The four money cards did not go in the bin, and did not stay in the strip.** `4g`'s
// KPI strip is four different metrics (active students, churn, average revenue, average
// attendance). The billing four answer "what happened to this month's bill" — the subject
// of the `send-monthly` email that sits beside them — so they moved into the revenue panel
// as its footer and kept that button and its confirm. Deleting them would have removed the
// only place a manager can see settled-versus-overdue; leaving them in the strip would
// have kept the screen a billing summary with charts bolted on.
//
// **§5.14 is stated, not only encoded** — `4g` finding 5. The rate divides by decided
// marks only, on the server, and the sentence sits under the figure with both counts
// beside it.
//
// **Read-only.** No KPI card, chart or retention row is a pointer. The only controls on
// the screen are the period switcher, the CSV button and the monthly email.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch, downloadFile, formatMonthLabel } from '@studio/core'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  LoadFailed,
  MoneyDisplay,
  ProgressBar,
  RangeText,
  SegmentedControl,
  useModalDialog,
} from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { BeltPromotionsChart } from './BeltPromotionsChart'
import { KpiStrip } from './KpiStrip'
import { RetentionPanel } from './RetentionPanel'
import { RevenueChart } from './RevenueChart'
import { PERIODS, fetchOverview, overviewCsvPath } from './client'
import type { PeriodKind, ReportsOverview } from './client'
import './reports.css'

const statRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
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
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <Button variant="secondary" onClick={onCancel} data-testid="send-monthly-cancel">
          {t(locale, 'reports.send.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={busy}
          data-testid="send-monthly-confirm"
        >
          {t(locale, 'reports.send.confirm')}
        </Button>
      </div>
    </div>
  )
}

/** A swatch and a word. `4g`'s primitives table calls this a gap and says both charts
 *  share it; the belt chart does not use it, because its legend would be the seven names
 *  already printed under its seven bars. */
function Legend({
  items,
}: {
  items: readonly { part: 'collected' | 'outstanding'; label: string }[]
}) {
  return (
    <ul className="dash-legend" data-testid="revenue-legend">
      {items.map((item) => (
        <li className="dash-legend__item" key={item.part}>
          <span
            aria-hidden="true"
            className="dash-legend__swatch"
            style={{
              background: item.part === 'collected' ? 'var(--fg)' : 'var(--danger)',
            }}
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
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
  const [period, setPeriod] = useState<PeriodKind>('month')
  const [overview, setOverview] = useState<ReportsOverview | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [exportState, setExportState] = useState<'idle' | 'failed' | 'nothing'>('idle')
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  useEffect(() => {
    let live = true
    void fetchOverview(studioId, period)
      .then((data) => {
        if (!live) return
        setFailed(false)
        setOverview(data)
      })
      .catch(() => {
        // F1a and P8's money rule in one: a FAILED read must never wear the empty state.
        // "No revenue this period" and "we could not load this" are different facts, and
        // the first is a statement about money.
        if (live) {
          setFailed(true)
          setOverview(null)
        }
      })
    return () => {
      live = false
    }
  }, [studioId, period, attempt])

  const periodOptions = useMemo(
    () => PERIODS.map((value) => ({ value, label: t(locale, `reports.period.${value}`) })),
    [locale],
  )

  const billing = overview?.billing_month ?? null
  const monthLabel = billing
    ? formatMonthLabel(billing.period_year, billing.period_month, locale)
    : ''

  async function send() {
    if (selfPersonId === null || billing === null) return
    setSendState('sending')
    try {
      const response = await apiFetch(`/api/v1/reports/${studioId}/send-monthly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: billing.period_year,
          month: billing.period_month,
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

  function exportCsv() {
    setExportState('idle')
    // A 204 means the switcher is on a season the studio does not have, so there is
    // nothing to download. `downloadFile` would happily hand the browser an empty blob
    // named like a report, which is worse than a message.
    if (overview?.period == null) {
      setExportState('nothing')
      return
    }
    void downloadFile(
      overviewCsvPath(studioId, period),
      `reports-${overview.period.from_date}-${overview.period.to_date}.csv`,
    ).catch(() => setExportState('failed'))
  }

  return (
    <section aria-labelledby="reports-title" className="dash-reports" data-testid="reports-screen">
      <header className="dash-reports__header">
        <h2 id="reports-title">{t(locale, 'reports.title')}</h2>
        {/* `4g`: three options, exact fit. The legend is visible because the three words
            are periods, not the name of the control — a bare `חודש | עונה | שנה` beside a
            date range does not say what it switches. */}
        <SegmentedControl
          legend={t(locale, 'reports.period')}
          legendVisible
          onValueChange={(next) => setPeriod(next as PeriodKind)}
          options={periodOptions}
          value={period}
        />
        {overview?.period ? (
          <span data-testid="reports-range">
            {overview.period.season_name ? (
              <bdi>{overview.period.season_name}</bdi>
            ) : (
              // One element, explicitly ltr, holding both ends and the dash. Two sibling
              // <bdi> ends are each internally correct and still laid out end-then-start
              // by the row around them.
              <RangeText from={overview.period.from_date} to={overview.period.to_date} />
            )}
          </span>
        ) : null}
        <span className="dash-reports__spacer" />
        <Button variant="secondary" data-testid="reports-export" onClick={exportCsv}>
          {t(locale, 'reports.export.csv')}
        </Button>
      </header>

      {exportState === 'failed' ? (
        <Alert tone="danger" live iconLabel={t(locale, 'reports.export.csv')}>
          {t(locale, 'reports.export.failed')}
        </Alert>
      ) : null}
      {/* `pending`, not `danger`: nothing failed. The switcher is on a season the studio
          does not have, so there is no file to build. */}
      {exportState === 'nothing' ? (
        <Alert tone="pending" live iconLabel={t(locale, 'reports.export.csv')}>
          {t(locale, 'reports.export.nothing')}
        </Alert>
      ) : null}

      {confirming && billing ? (
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

      {failed ? (
        <LoadFailed
          locale={locale}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      ) : overview === null ? null : overview.period === null || !overview.has_data ? (
        // `4g`: "Selecting a season a studio did not operate in lands here." The
        // description distinguishes the two ways to arrive: a season that does not exist
        // is a different fact from a season in which nothing happened.
        <EmptyState
          title={t(locale, 'reports.empty')}
          description={
            overview.period === null ? t(locale, 'reports.period.seasonMissing') : undefined
          }
        />
      ) : (
        <>
          {overview.kpi ? <KpiStrip kpi={overview.kpi} locale={locale} /> : null}

          <div className="dash-reports__body">
            <Card caption={t(locale, 'reports.financial.collectedVsDebt')}>
              <p style={statLabelStyle}>{t(locale, 'reports.financial.trend12m')}</p>
              <Legend
                items={[
                  { part: 'collected', label: t(locale, 'reports.financial.collected') },
                  { part: 'outstanding', label: t(locale, 'reports.financial.outstanding') },
                ]}
              />
              <RevenueChart locale={locale} months={overview.revenue} />
              <p className="dash-kpi__note" data-testid="revenue-basis">
                {t(locale, 'reports.financial.chartBasis')}
              </p>

              {/* The four money cards this screen shipped with, kept and demoted. Same
                  figures, same source, now under the chart they belong to. */}
              {billing ? (
                <>
                  <p style={statLabelStyle} data-testid="billing-month-caption">
                    {t(locale, 'reports.financial.monthSummary').replace('{{month}}', monthLabel)}
                  </p>
                  <div style={statRowStyle} data-testid="reports-stats">
                    <div>
                      <div style={statLabelStyle}>{t(locale, 'reports.financial.expected')}</div>
                      <div style={statValueStyle}>
                        <MoneyDisplay agorot={billing.total_agorot} />
                      </div>
                    </div>
                    <div>
                      <div style={statLabelStyle}>{t(locale, 'reports.financial.collected')}</div>
                      <div style={statValueStyle}>
                        <MoneyDisplay agorot={billing.settled_agorot} tone="paid" />
                      </div>
                    </div>
                    <div>
                      <div style={statLabelStyle}>
                        {t(locale, 'reports.overview.outstandingDebt')}
                      </div>
                      <div style={statValueStyle}>
                        <MoneyDisplay agorot={billing.overdue_agorot} tone="debt" />
                      </div>
                    </div>
                    <div>
                      <div style={statLabelStyle}>{t(locale, 'reports.financial.notYetDue')}</div>
                      <div style={statValueStyle}>
                        <MoneyDisplay agorot={billing.pending_agorot} tone="pending" />
                      </div>
                    </div>
                  </div>
                  <ProgressBar
                    label={t(locale, 'reports.financial.collectionRate')}
                    max={billing.total_agorot}
                    value={billing.settled_agorot}
                  />
                  <p className="dash-kpi__note">
                    {t(locale, 'reports.financial.studentsBilled')}:{' '}
                    <bdi dir="ltr">{billing.total_students}</bdi>
                  </p>
                  {selfPersonId !== null ? (
                    <Button
                      variant="secondary"
                      data-testid="send-monthly"
                      disabled={sendState === 'sending'}
                      onClick={() => setConfirming(true)}
                    >
                      {t(locale, 'reports.send.button')}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </Card>

            <div className="dash-reports__side">
              <Card caption={t(locale, 'reports.retention.title')}>
                <RetentionPanel
                  buckets={overview.retention}
                  locale={locale}
                  undatedDepartures={overview.kpi?.undated_departures ?? 0}
                />
              </Card>
              <Card caption={t(locale, 'reports.belts.title')}>
                {overview.belts.length === 0 ? (
                  <EmptyState title={t(locale, 'reports.belts.empty')} />
                ) : (
                  <BeltPromotionsChart belts={overview.belts} locale={locale} />
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
