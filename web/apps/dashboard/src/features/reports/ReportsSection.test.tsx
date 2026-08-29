// Artboard `4g`, asserted. The tests that matter most are the ones that pin a *rule*
// rather than a rendering: the belt chart's unconditional ring, the chronological order
// both charts must not reverse, and §5.14 being said out loud beside the attendance
// figure. Each of those is a thing the artboard gets wrong or leaves out, so each is a
// thing the next person to touch this screen could quietly restore.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadFile } from '@studio/core'
import { BeltPromotionsChart } from './BeltPromotionsChart'
import { KpiStrip } from './KpiStrip'
import { ReportsSection } from './ReportsSection'
import { RetentionPanel, weakestBucket } from './RetentionPanel'
import { RevenueChart } from './RevenueChart'
import { formatPermille, signed } from './client'
import type { BeltPromotion, Kpi, ReportsOverview, RetentionBucket, RevenueMonth } from './client'

// The download goes through a blob and an anchor, neither of which jsdom can be asked
// about afterwards. The URL is the assertion that matters: the CSV must carry the period
// the screen is showing, and the two are read off the same state two lines apart.
vi.mock('@studio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@studio/core')>()),
  downloadFile: vi.fn(() => Promise.resolve()),
}))

const kpi = (overrides: Partial<Kpi> = {}): Kpi => ({
  active_students: 214,
  active_students_delta: 18,
  churn_permille: 32,
  churn_permille_delta: 7,
  avg_monthly_revenue_agorot: 6_480_000,
  revenue_per_student_agorot: 30_300,
  attendance_percent: 84,
  attendance_percent_delta: 0,
  attendance_unmarked_marks: 12,
  attendance_decided_marks: 480,
  undated_departures: 0,
  ...overrides,
})

const month = (year: number, m: number, collected: number, outstanding: number): RevenueMonth => ({
  year,
  month: m,
  billed_agorot: collected + outstanding,
  collected_agorot: collected,
  outstanding_agorot: outstanding,
})

const twelveMonths = (): RevenueMonth[] =>
  Array.from({ length: 12 }, (_, index) => {
    const absolute = 2025 * 12 + 11 + index
    return month(Math.floor(absolute / 12), (absolute % 12) + 1, 100_000 * (index + 1), 20_000)
  })

const bucket = (overrides: Partial<RetentionBucket> = {}): RetentionBucket => ({
  key: 'm0_3',
  lower_months: 0,
  upper_months: 3,
  cohort: 40,
  retained: 30,
  percent: 75,
  ...overrides,
})

const belt = (overrides: Partial<BeltPromotion> = {}): BeltPromotion => ({
  belt_rank_id: 'rank-white',
  name: 'לבנה',
  color_hex: '#fffefb',
  secondary_color_hex: null,
  order_index: 0,
  promotions: 4,
  ...overrides,
})

const overview = (overrides: Partial<ReportsOverview> = {}): ReportsOverview => ({
  period: { kind: 'month', from_date: '2026-11-01', to_date: '2026-11-12', season_name: null },
  kpi: kpi(),
  billing_month: {
    period_year: 2026,
    period_month: 11,
    total_students: 12,
    total_agorot: 300_000,
    settled_agorot: 200_000,
    overdue_agorot: 60_000,
    pending_agorot: 40_000,
  },
  revenue: twelveMonths(),
  retention: [
    bucket({ key: 'm0_3', percent: 62 }),
    bucket({ key: 'm3_6', lower_months: 3, upper_months: 6, percent: 88 }),
    bucket({ key: 'm6_12', lower_months: 6, upper_months: 12, percent: 91 }),
    bucket({ key: 'm12_plus', lower_months: 12, upper_months: null, percent: 95 }),
  ],
  belts: [
    belt(),
    belt({
      belt_rank_id: 'rank-yellow',
      name: 'צהובה',
      color_hex: '#d9a800',
      order_index: 1,
      promotions: 9,
    }),
    belt({
      belt_rank_id: 'rank-black',
      name: 'שחורה',
      color_hex: '#17150f',
      order_index: 2,
      promotions: 0,
    }),
  ],
  has_data: true,
  ...overrides,
})

function mockOverview(body: ReportsOverview) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  document.documentElement.dir = 'rtl'
  document.documentElement.lang = 'he'
})

// ── the two charts, and the rules the artboard breaks ───────────────────────────────

describe('the belt distribution', () => {
  it('rings every bar, including the black one the artboard leaves bare', () => {
    // ▲ D7: black on the dark ground is 1.02:1. The artboard rings only the near-white
    // bar, so in dark mode that chart LOSES a column and nobody is told. A fill-only bar
    // here would be that bug, shipped.
    render(<BeltPromotionsChart belts={overview().belts} locale="he" />)
    for (const id of ['rank-white', 'rank-yellow', 'rank-black']) {
      // Inline, so it is observable here — `BeltBar.test.tsx`'s own argument: jsdom
      // applies no CSS rules, so a stylesheet ring would be asserted nowhere.
      const bar = screen.getByTestId(`belt-bar-${id}`)
      expect(bar.style.boxShadow).toContain('inset')
      expect(bar.style.boxShadow).toContain('var(--belt-ring-width)')
      expect(bar.style.boxShadow).toContain('var(--belt-ring)')
    }
  })

  it('rings a bar even when the rank promoted nobody, and a bi-colour bar too', () => {
    render(
      <BeltPromotionsChart
        belts={[
          belt({ belt_rank_id: 'r0', promotions: 0 }),
          belt({ belt_rank_id: 'r1', secondary_color_hex: '#d9a800' }),
        ]}
        locale="he"
      />,
    )
    expect(screen.getByTestId('belt-bar-r0').style.boxShadow).toContain('var(--belt-ring)')
    expect(screen.getByTestId('belt-bar-r1').style.boxShadow).toContain('var(--belt-ring)')
    expect(screen.getByTestId('belt-bar-r1').style.background).toContain('linear-gradient')
  })

  it('prints a count under every bar, which the artboard carries for none of them', () => {
    render(<BeltPromotionsChart belts={overview().belts} locale="he" />)
    expect(screen.getByTestId('belt-count-rank-yellow')).toHaveTextContent('9')
    // A rank that promoted nobody is a ZERO, not a missing column: a quiet season is
    // exactly when a manager wants to see which ranks stood still.
    expect(screen.getByTestId('belt-count-rank-black')).toHaveTextContent('0')
  })

  it('runs lowest rank first, so RTL puts the lowest at the reading start', () => {
    render(<BeltPromotionsChart belts={overview().belts} locale="he" />)
    const names = screen.getByTestId('belt-chart').querySelectorAll('.dash-belts__name')
    expect([...names].map((node) => node.textContent)).toEqual(['לבנה', 'צהובה', 'שחורה'])
  })

  it('carries the belt colour as data rather than as a token', () => {
    render(<BeltPromotionsChart belts={[belt({ color_hex: '#d9a800' })]} locale="he" />)
    expect(screen.getByTestId('belt-bar-rank-white').style.background).toContain('rgb(217, 168, 0)')
  })
})

describe('the twelve-month revenue chart', () => {
  it('renders the months oldest first and never reverses them', () => {
    // `4g`: "The trend reads oldest-to-newest in reading order. Do not reverse it." RTL
    // does the mirroring; a reverse() in code would undo it and show a year running
    // backwards.
    render(<RevenueChart locale="he" months={twelveMonths()} />)
    const columns = [...screen.getByTestId('revenue-chart').querySelectorAll('.dash-chart__column')]
    expect(columns).toHaveLength(12)
    const stacks = columns.map((column) =>
      column.querySelector('[data-testid^="revenue-column-"]')?.getAttribute('data-testid'),
    )
    expect(stacks[0]).toBe('revenue-column-2025-12')
    expect(stacks.at(-1)).toBe('revenue-column-2026-11')
  })

  it('scales every column against the tallest one, not against itself', () => {
    render(
      <RevenueChart
        locale="he"
        months={[month(2026, 10, 100_000, 0), month(2026, 11, 50_000, 0)]}
      />,
    )
    expect(screen.getByTestId('revenue-collected-2026-10').style.blockSize).toContain('100%')
    expect(screen.getByTestId('revenue-collected-2026-11').style.blockSize).toContain('50%')
  })

  it('draws no segment at all for a month that billed nothing', () => {
    render(<RevenueChart locale="he" months={[month(2026, 11, 0, 0)]} />)
    expect(screen.getByTestId('revenue-collected-2026-11').style.blockSize).toBe('')
  })

  it('gives every column a readable alternative to its pixel height', () => {
    // SC 1.4.1 — height alone is not a carrier, and the artboard forbids a visible label.
    render(<RevenueChart locale="he" months={[month(2026, 11, 25_000, 5_000)]} />)
    const hidden = document.querySelector('.studio-visually-hidden')
    expect(hidden?.textContent).toContain('נגבה')
    expect(hidden?.textContent).toContain('נותר בחוב')
  })
})

// ── retention ────────────────────────────────────────────────────────────────────────

describe('retention by tenure', () => {
  it('draws no bar for a bucket with no cohort', () => {
    // A bar at 0% is a claim about students who never had the chance to leave.
    render(
      <RetentionPanel
        buckets={[bucket({ cohort: 0, retained: 0, percent: null })]}
        locale="he"
        undatedDepartures={0}
      />,
    )
    expect(screen.getByTestId('retention-empty-m0_3')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('marks the weakest measured bucket, and never an unmeasured one', () => {
    const buckets = [
      bucket({ key: 'm0_3', percent: 62 }),
      bucket({ key: 'm3_6', percent: 88 }),
      bucket({ key: 'm12_plus', cohort: 0, percent: null }),
    ]
    expect(weakestBucket(buckets)?.key).toBe('m0_3')
    render(<RetentionPanel buckets={buckets} locale="he" undatedDepartures={0} />)
    expect(screen.getByTestId('retention-m0_3')).toHaveAttribute('data-weakest', 'true')
    expect(screen.getByTestId('retention-m12_plus')).toHaveAttribute('data-weakest', 'false')
  })

  it('states the denominator beside the percentages', () => {
    render(<RetentionPanel buckets={[bucket()]} locale="he" undatedDepartures={0} />)
    expect(screen.getByTestId('retention-basis')).toBeInTheDocument()
    expect(screen.getByTestId('retention-m0_3')).toHaveTextContent('40')
  })

  it('shows the early-churn footnote only when the data says it', () => {
    // Finding 8, decided: authored copy gated on a computed fact. A generated sentence
    // would be an untranslatable Hebrew string the i18n layer cannot reach.
    const { unmount } = render(
      <RetentionPanel
        buckets={[bucket({ key: 'm0_3', percent: 62 }), bucket({ key: 'm3_6', percent: 88 })]}
        locale="he"
        undatedDepartures={0}
      />,
    )
    expect(screen.getByTestId('retention-insight')).toBeInTheDocument()
    unmount()

    render(
      <RetentionPanel
        buckets={[bucket({ key: 'm0_3', percent: 92 }), bucket({ key: 'm3_6', percent: 51 })]}
        locale="he"
        undatedDepartures={0}
      />,
    )
    expect(screen.queryByTestId('retention-insight')).not.toBeInTheDocument()
  })

  it('publishes departures it could not date rather than swallowing them', () => {
    render(<RetentionPanel buckets={[bucket()]} locale="he" undatedDepartures={3} />)
    expect(screen.getByTestId('retention-undated')).toHaveTextContent('3')
  })
})

// ── the KPI strip ────────────────────────────────────────────────────────────────────

describe('the KPI strip', () => {
  it('states §5.14 beside the attendance figure, with both counts', () => {
    // `4g` finding 5: the rule is neither stated nor shown on the screen that publishes
    // this number, and `reports.attendance.unmarkedExcluded` existed with nothing using
    // it. It is used now, and the counts make it evidence rather than a slogan.
    render(<KpiStrip kpi={kpi()} locale="he" />)
    expect(screen.getByTestId('unmarked-excluded')).toHaveTextContent(
      'שיעורים שלא סומנו אינם נספרים כהיעדרות',
    )
    expect(screen.getByTestId('kpi-attendance-basis')).toHaveTextContent('480')
    expect(screen.getByTestId('kpi-attendance-basis')).toHaveTextContent('12')
  })

  it('tones a rising churn as danger and a rising headcount as paid', () => {
    render(<KpiStrip kpi={kpi()} locale="he" />)
    expect(screen.getByTestId('kpi-active-students-delta')).toHaveAttribute('data-tone', 'paid')
    expect(screen.getByTestId('kpi-churn-delta')).toHaveAttribute('data-tone', 'danger')
    // The artboard's own table: no colour on either of these two.
    expect(screen.getByTestId('kpi-revenue-delta')).toHaveAttribute('data-tone', 'neutral')
    expect(screen.getByTestId('kpi-attendance-delta')).toHaveAttribute('data-tone', 'neutral')
  })

  it('tones a falling churn as paid, because down is good here', () => {
    render(<KpiStrip kpi={kpi({ churn_permille_delta: -5 })} locale="he" />)
    expect(screen.getByTestId('kpi-churn-delta')).toHaveAttribute('data-tone', 'paid')
  })

  it('prints a dash rather than a zero when a figure cannot be computed', () => {
    render(
      <KpiStrip
        kpi={kpi({
          churn_permille: null,
          attendance_percent: null,
          revenue_per_student_agorot: null,
        })}
        locale="he"
      />,
    )
    expect(screen.getByTestId('kpi-churn')).toHaveTextContent('אין נתון')
    expect(screen.getByTestId('kpi-attendance')).toHaveTextContent('אין נתון')
  })

  it('formats tenths of a percent without ever touching a float', () => {
    // `32 / 10` is `3.2000000000000002` in the one place a single decimal is the point.
    expect(formatPermille(32)).toBe('3.2')
    expect(formatPermille(0)).toBe('0.0')
    expect(formatPermille(-7)).toBe('-0.7')
    expect(signed(18)).toBe('+18')
    expect(signed(-4)).toBe('-4')
  })

  it('carries no pointer on any tile', () => {
    // `4g`: "Everything else is read-only. No KPI card ... carries a pointer."
    render(<KpiStrip kpi={kpi()} locale="he" />)
    expect(within(screen.getByTestId('reports-kpis')).queryByRole('link')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('reports-kpis')).queryByRole('button')).not.toBeInTheDocument()
  })
})

// ── the screen ───────────────────────────────────────────────────────────────────────

describe('the reports screen', () => {
  it('renders the strip and all three charts from one request', async () => {
    mockOverview(overview())
    render(<ReportsSection locale="he" selfPersonId="p1" studioId="s1" />)

    await waitFor(() => expect(screen.getByTestId('reports-kpis')).toBeInTheDocument())
    expect(screen.getByTestId('revenue-chart')).toBeInTheDocument()
    expect(screen.getByTestId('retention-panel')).toBeInTheDocument()
    expect(screen.getByTestId('belt-chart')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the four money cards, under the chart they belong to', async () => {
    // They are not the KPI strip any more and they are not gone: they answer "what
    // happened to this month's bill", which is what `send-monthly` emails.
    mockOverview(overview())
    render(<ReportsSection locale="he" selfPersonId="p1" studioId="s1" />)

    await waitFor(() => expect(screen.getByTestId('reports-stats')).toBeInTheDocument())
    expect(screen.getByTestId('billing-month-caption')).toBeInTheDocument()
    expect(screen.getByTestId('send-monthly')).toBeInTheDocument()
  })

  it('refetches when the period switcher moves', async () => {
    mockOverview(overview())
    render(<ReportsSection locale="he" selfPersonId="p1" studioId="s1" />)
    await waitFor(() => expect(screen.getByTestId('reports-kpis')).toBeInTheDocument())

    await userEvent.click(screen.getByLabelText('עונה'))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2))
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(String(calls.at(-1)?.[0])).toContain('period=season')
  })

  it('lands on the empty state for a season the studio never operated in', async () => {
    mockOverview({
      period: null,
      kpi: null,
      billing_month: null,
      revenue: [],
      retention: [],
      belts: [],
      has_data: false,
    })
    render(<ReportsSection locale="he" selfPersonId="p1" studioId="s1" />)

    await waitFor(() => expect(screen.getByText('אין נתונים לתקופה שנבחרה')).toBeInTheDocument())
    expect(screen.getByText('לא הוגדרה עונה פעילה')).toBeInTheDocument()
    expect(screen.queryByTestId('revenue-chart')).not.toBeInTheDocument()
  })

  it('shows the load failure rather than the empty state when the read fails', async () => {
    // F1a: "no revenue this period" and "we could not load this" are different facts, and
    // the first is a statement about money.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    )
    render(<ReportsSection locale="he" selfPersonId="p1" studioId="s1" />)

    await waitFor(() =>
      expect(screen.queryByText('אין נתונים לתקופה שנבחרה')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /נסו שוב|נסה שוב/ })).toBeInTheDocument()
  })

  it('exports the period the screen is showing, synchronously', async () => {
    mockOverview(overview())
    render(<ReportsSection locale="he" selfPersonId="p1" studioId="s1" />)
    await waitFor(() => expect(screen.getByTestId('reports-kpis')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('reports-export'))
    expect(downloadFile).toHaveBeenCalledWith(
      '/api/v1/reports/s1/overview.csv?period=month',
      'reports-2026-11-01-2026-11-12.csv',
    )
  })

  it('says there is nothing to export rather than downloading an empty file', async () => {
    mockOverview({
      period: null,
      kpi: null,
      billing_month: null,
      revenue: [],
      retention: [],
      belts: [],
      has_data: false,
    })
    render(<ReportsSection locale="he" selfPersonId="p1" studioId="s1" />)
    await waitFor(() => expect(screen.getByTestId('reports-export')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('reports-export'))
    expect(downloadFile).not.toHaveBeenCalled()
    expect(screen.getByText('אין נתונים לייצוא')).toBeInTheDocument()
  })

  it('renders in English too, and the period switcher still names three periods', async () => {
    // SPEC §13: every component rendered in both `he` (RTL) and `en` (LTR).
    document.documentElement.dir = 'ltr'
    mockOverview(overview())
    render(<ReportsSection locale="en" selfPersonId="p1" studioId="s1" />)

    await waitFor(() => expect(screen.getByTestId('reports-kpis')).toBeInTheDocument())
    expect(screen.getByLabelText('Month')).toBeInTheDocument()
    expect(screen.getByLabelText('Season')).toBeInTheDocument()
    expect(screen.getByLabelText('Year')).toBeInTheDocument()
  })
})
