// `4g`'s KPI strip — four cards, each a bare number plus a delta line.
//
// **What was here before, and why it moved.** The shipped screen's four cards were
// total / settled / overdue / pending — a monthly *billing* summary. `4g`'s strip is four
// different metrics: active students, monthly churn, average revenue, average attendance.
// The money four are not deleted: they are the answer to "what happened to this month's
// bill", which is the subject of the `send-monthly` email beside them, so they moved down
// into the revenue panel and kept that button. Nobody loses a number they were using, and
// the strip stops being a billing summary wearing the reports name.
//
// **The tile is feature-specific, as `4g`'s primitives table says.** `StatTile` is the
// near miss: it tones the VALUE, and this artboard leaves every figure in ink and tones
// only the delta. Adding a second tone axis to a shared primitive for one screen is how a
// design system starts meaning nothing. B5.2 gives `.dash-kpi` the same
// `.studio-tile-shell` surface/hairline/radius/padding `StatTile` wears — the shell and
// the tone are separate decisions, and taking the shell does not reopen the tone argument
// above.
//
// **Colour per the artboard's own table**: `--paid` on the active-students delta,
// `--danger` on churn's, and **none** on revenue's or attendance's. There is no tone
// prop that means "emphasis" — a delta is coloured by what it says about the club or not
// at all (D3).
import type { ReactNode } from 'react'
import { fill } from '@studio/core'
import { MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { Kpi } from './client'
import { formatPermille, signed } from './client'

type DeltaTone = 'neutral' | 'paid' | 'danger'

function KpiTile({
  label,
  labelInfo,
  value,
  delta,
  deltaTone = 'neutral',
  testId,
}: {
  label: string
  /** B5.3 — the ⓘ affordance, rendered beside the label rather than as a footnote under
   *  the whole tile. Only the attendance tile passes one. */
  labelInfo?: ReactNode
  value: ReactNode
  delta: ReactNode
  deltaTone?: DeltaTone
  testId: string
}) {
  return (
    // A div, not a link. `4g`: "Everything else is read-only. No KPI card, no chart, no
    // retention row carries a pointer."
    // B5.2 — `.studio-tile-shell` is the surface/hairline/radius/padding shared with
    // `StatTile` (`packages/ui/src/primitives/primitives.css`), so the two cannot drift.
    <div className="dash-kpi studio-tile-shell" data-testid={testId}>
      <span className="dash-kpi__label">
        {label}
        {labelInfo}
      </span>
      <span className="dash-kpi__value">{value}</span>
      <span className="dash-kpi__delta" data-testid={`${testId}-delta`} data-tone={deltaTone}>
        {delta}
      </span>
    </div>
  )
}

/** A bare digit run is a left-to-right island inside a right-to-left row, and without
 *  isolation an RTL paragraph is free to reorder it against its neighbours — the same bug
 *  `RangeText` exists to stop for ranges. */
function Digits({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>
}

/** B5.3 — §5.14's rule, moved off the tile and onto a `ⓘ` beside its label.
 *
 * A native `<details>`/`<summary>` disclosure rather than a tooltip: keyboard-operable
 * with no ARIA state to get wrong, the same reasoning `AccessibilityMenu`'s own
 * accessibility statement gives for using the same element. `aria-label` on the summary
 * carries `reports.attendance.basisLabel` as its accessible name regardless of the ⓘ
 * glyph's own text, and the rule plus both counts — `reports.attendance.unmarkedExcluded`,
 * `decidedCount`, `unmarkedCount` — are exactly what the three-sentence footnote used to
 * say; only their location moved. */
function AttendanceInfo({ locale, kpi }: { locale: Locale; kpi: Kpi }) {
  return (
    <details className="dash-kpi__info">
      <summary
        aria-label={t(locale, 'reports.attendance.basisLabel')}
        className="dash-kpi__info-toggle"
        data-testid="kpi-attendance-info-toggle"
      >
        <span aria-hidden="true">ⓘ</span>
      </summary>
      <span className="dash-kpi__note dash-kpi__info-content" data-testid="kpi-attendance-basis">
        <span data-testid="unmarked-excluded">
          {t(locale, 'reports.attendance.unmarkedExcluded')}
        </span>{' '}
        <span>
          {fill(t(locale, 'reports.attendance.decidedCount'), {
            count: kpi.attendance_decided_marks,
          })}
        </span>{' '}
        <span>
          {fill(t(locale, 'reports.attendance.unmarkedCount'), {
            count: kpi.attendance_unmarked_marks,
          })}
        </span>
      </span>
    </details>
  )
}

export function KpiStrip({ locale, kpi }: { locale: Locale; kpi: Kpi }) {
  const noValue = t(locale, 'reports.overview.noValue')

  return (
    <div className="dash-reports__kpis" data-testid="reports-kpis">
      <KpiTile
        label={t(locale, 'reports.overview.activeStudents')}
        testId="kpi-active-students"
        value={<Digits>{kpi.active_students}</Digits>}
        deltaTone={
          kpi.active_students_delta > 0
            ? 'paid'
            : kpi.active_students_delta < 0
              ? 'danger'
              : 'neutral'
        }
        delta={
          kpi.active_students_delta === 0 ? (
            t(locale, 'reports.delta.noChange')
          ) : (
            <>
              <Digits>{signed(kpi.active_students_delta)}</Digits>
              <span>{t(locale, 'reports.delta.sincePeriodStart')}</span>
            </>
          )
        }
      />

      <KpiTile
        label={t(locale, 'reports.overview.churn')}
        testId="kpi-churn"
        value={
          kpi.churn_permille === null ? (
            noValue
          ) : (
            <Digits>{formatPermille(kpi.churn_permille)}%</Digits>
          )
        }
        // Rising churn is bad and falling churn is good, which is the opposite of the
        // student count above. The sign alone does not carry that, so the tone does.
        deltaTone={
          kpi.churn_permille_delta === null || kpi.churn_permille_delta === 0
            ? 'neutral'
            : kpi.churn_permille_delta > 0
              ? 'danger'
              : 'paid'
        }
        delta={
          kpi.churn_permille_delta === null ? (
            t(locale, 'reports.delta.noComparison')
          ) : kpi.churn_permille_delta === 0 ? (
            t(locale, 'reports.delta.noChange')
          ) : (
            <>
              <Digits>
                {kpi.churn_permille_delta > 0 ? '+' : '−'}
                {formatPermille(Math.abs(kpi.churn_permille_delta))}%
              </Digits>
              <span>{t(locale, 'reports.delta.vsPrevious')}</span>
            </>
          )
        }
      />

      <KpiTile
        label={t(locale, 'reports.overview.avgMonthlyRevenue')}
        testId="kpi-revenue"
        // G2 — agorot in, MoneyDisplay out. Never a number interpolated into a sentence:
        // `-320₪` inside a Hebrew row renders `320₪-` and a credit reads as a debt.
        value={<MoneyDisplay agorot={kpi.avg_monthly_revenue_agorot} />}
        delta={
          kpi.revenue_per_student_agorot === null ? (
            noValue
          ) : (
            <>
              <MoneyDisplay agorot={kpi.revenue_per_student_agorot} />
              <span>{t(locale, 'reports.delta.perStudent')}</span>
            </>
          )
        }
      />

      <KpiTile
        label={t(locale, 'reports.overview.avgAttendance')}
        labelInfo={<AttendanceInfo kpi={kpi} locale={locale} />}
        testId="kpi-attendance"
        value={
          kpi.attendance_percent === null ? noValue : <Digits>{kpi.attendance_percent}%</Digits>
        }
        // ▲ §5.14, stated where the number is published. `4g` finding 5: the rule is
        // "neither stated nor visible" on the one screen that publishes this figure, and
        // `reports.attendance.unmarkedExcluded` existed with nothing using it. B5.3 moves
        // the rule itself into the ⓘ above and keeps the two counts here, on the delta
        // line every other tile already has — three sentences under the tile shrink to
        // the same one line the other three tiles get.
        delta={
          kpi.attendance_percent === null ? (
            t(locale, 'reports.attendance.noData')
          ) : (
            <>
              <span>
                {fill(t(locale, 'reports.attendance.decidedShort'), {
                  count: kpi.attendance_decided_marks,
                })}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {fill(t(locale, 'reports.attendance.unmarkedShort'), {
                  count: kpi.attendance_unmarked_marks,
                })}
              </span>
            </>
          )
        }
      />
    </div>
  )
}
