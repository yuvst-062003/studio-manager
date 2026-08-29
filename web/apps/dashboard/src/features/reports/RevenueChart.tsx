// `הכנסות מול חוב` — twelve two-tone columns, ink and one accent.
//
// **No charting dependency.** A grid of twelve columns, each a flex column whose two
// segments carry a percentage `block-size`, is the whole implementation. `4g` asks for no
// y-axis, no per-bar labels and no tooltip, so everything a chart library exists to
// provide is something this chart must not have. See `reports.css` for the rest of that
// argument.
//
// **The scale is the tallest column, and it is shared.** Each column is scaled against
// the largest billed month in the window rather than against itself — twelve bars each
// normalised to their own maximum would all be full height and would encode nothing.
//
// **Direction is inherited and must stay that way.** The array is rendered in the order
// the server sent it, oldest first, and `grid-auto-flow: column` puts the first column at
// the inline start — the right, in Hebrew. `4g`: "The trend reads oldest-to-newest in
// reading order. Do not reverse it."
import { MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { formatMonthLabel } from '@studio/core'
import type { RevenueMonth } from './client'

/** A hairline of colour for a month that billed something too small to see. Without it a
 *  month with one ₪20 charge draws as an empty column, which reads as a month with no
 *  billing at all. */
const MIN_VISIBLE = '2px'

function segmentSize(value: number, scale: number): string | undefined {
  if (value <= 0) return undefined
  const percent = Math.min(100, (value / scale) * 100)
  return `max(${MIN_VISIBLE}, ${percent}%)`
}

export function RevenueChart({ locale, months }: { locale: Locale; months: RevenueMonth[] }) {
  // The tallest stack, never zero: a scale of zero would divide by nothing, and a window
  // in which nothing was billed has twelve empty columns rather than twelve full ones.
  const scale = Math.max(
    1,
    ...months.map((month) => Math.max(month.billed_agorot, month.collected_agorot)),
  )

  return (
    <ol
      className="dash-chart"
      data-testid="revenue-chart"
      aria-label={t(locale, 'reports.financial.chartLabel')}
    >
      {months.map((month) => (
        <li className="dash-chart__column" key={`${month.year}-${month.month}`}>
          <span
            className="dash-chart__stack"
            data-testid={`revenue-column-${month.year}-${month.month}`}
          >
            {/* Debt on top of collected: the eye reads the stack from the baseline up, and
                the question the chart answers is "how much of what we billed arrived". */}
            <span
              className="dash-chart__segment"
              data-part="outstanding"
              data-testid={`revenue-outstanding-${month.year}-${month.month}`}
              style={{ blockSize: segmentSize(month.outstanding_agorot, scale) }}
            />
            <span
              className="dash-chart__segment"
              data-part="collected"
              data-testid={`revenue-collected-${month.year}-${month.month}`}
              style={{ blockSize: segmentSize(month.collected_agorot, scale) }}
            />
          </span>
          {/* Visible: the month, at D8's muted floor. The artboard's month-axis labels. */}
          <span className="dash-chart__month">
            {formatMonthLabel(month.year, month.month, locale)}
          </span>
          {/* Not visible, and not optional. "No per-bar labels, no tooltip" is a rule
              about the drawing; a chart whose only encoding is a pixel height is unusable
              with a screen reader, and SC 1.4.1 does not accept height as a sole carrier.
              The amounts go through MoneyDisplay rather than into a template string —
              `-320₪` interpolated into a Hebrew sentence renders as `320₪-` and a credit
              reads as a debt. */}
          <span className="studio-visually-hidden">
            {formatMonthLabel(month.year, month.month, locale)} ·{' '}
            {t(locale, 'reports.financial.collected')}{' '}
            <MoneyDisplay agorot={month.collected_agorot} /> ·{' '}
            {t(locale, 'reports.financial.outstanding')}{' '}
            <MoneyDisplay agorot={month.outstanding_agorot} />
          </span>
        </li>
      ))}
    </ol>
  )
}
