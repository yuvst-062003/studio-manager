// The manager home — docs/design/proposals/manager-home.md.
//
// Two things are asserted harder than the rest, because both are failures that look like
// features: a region whose data did not arrive must render NOTHING rather than a zero,
// and an uncovered class must not render like a covered one.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ManagerHome } from './ManagerHome'
import { summariseSessions, todayFrom, weekBounds } from './homeClient'
import type { HomeClient, HomeData } from './homeClient'
import type { SessionRow } from '../schedule/client'

const TODAY = '2026-08-29T09:00:00.000Z'

const data = (over: Partial<HomeData> = {}): HomeData => ({
  money: { debtAgorot: 480000, collectedAgorot: 1250000, debtHouseholds: 12 },
  attention: { missingHealth: 3, noCoach: 2, unmarked: 0 },
  attendance: [
    { group_id: 'g1', group_name: 'ג׳וניורים', rate_percent: 82 },
    { group_id: 'g2', group_name: 'נבחרת', rate_percent: null },
  ],
  today: [
    {
      id: 's1',
      groupName: 'מתחילים',
      startsAt: '2026-08-29T13:00:00.000Z',
      endsAt: '2026-08-29T14:00:00.000Z',
      hall: 'אולם א׳',
      coach: 'דנה לוי',
      cancelled: false,
    },
  ],
  ...over,
})

const clientFor = (value: HomeData): HomeClient => ({ load: vi.fn().mockResolvedValue(value) })

function renderHome(value: HomeData, locale: 'he' | 'en' = 'he') {
  return render(
    <ManagerHome
      client={clientFor(value)}
      locale={locale}
      studioId="studio-1"
      studioName="מועדון גלדיאטור"
      today={TODAY}
    />,
  )
}

describe('ManagerHome', () => {
  it('names the screen once, with the studio as a subtitle rather than a second heading', async () => {
    renderHome(data())
    await screen.findByRole('heading', { level: 1, name: t('he', 'common.dash.home.title') })
    expect(screen.getAllByText('מועדון גלדיאטור')).toHaveLength(1)
  })

  it('shows the money band as three tiles that each link to collections', async () => {
    renderHome(data())
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /₪|12/ }).length).toBeGreaterThanOrEqual(3)
    })
    // Households, not students: one guardian with three children in arrears is one call.
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('lists only the alert kinds with something in them, and never a zero row', async () => {
    renderHome(data())
    await screen.findByText(t('he', 'common.dash.home.attention.health'))
    expect(screen.getByText(t('he', 'common.dash.home.attention.noCoach'))).toBeInTheDocument()
    // unmarked is 0 in the fixture — a zero row is noise on a screen built to be scanned.
    expect(screen.queryByText(t('he', 'common.dash.home.attention.unmarked'))).toBeNull()
  })

  it('says so explicitly when nothing needs attention, rather than hiding the region', async () => {
    // Behavioural: the absence of alerts is the answer a manager came for. A hidden
    // region is indistinguishable from a region that failed to load.
    renderHome(data({ attention: { missingHealth: 0, noCoach: 0, unmarked: 0 } }))
    await screen.findByText(t('he', 'common.dash.home.attention.none'))
  })

  it('renders no money band at all when that one region failed', async () => {
    // Behavioural: `0 ₪` off a failed request is a lie a manager would act on. The other
    // two regions must still render — one endpoint down costs one region, not the page.
    renderHome(data({ money: null }))
    await screen.findByText(t('he', 'common.dash.home.attention.health'))
    expect(screen.queryByText(t('he', 'common.dash.home.money.debt'))).toBeNull()
  })

  it('marks an uncovered class instead of drawing it like a covered one', async () => {
    // `3a` requires this and the shipped week board does not do it, which is how two
    // coachless classes sat on the board unnoticed.
    renderHome(
      data({
        today: [{ ...data().today![0]!, coach: null }],
      }),
    )
    await screen.findByText(t('he', 'common.dash.home.today.noCoach'))
  })

  it('renders a time range as ONE ltr island, so RTL cannot flip its ends', async () => {
    // The bug this pins is invisible to `textContent`: the DOM order is start-then-end
    // either way, and only the bidi layout reverses. Two sibling `<bdi>` ends rendered
    // 16:00–17:00 as `17:00–16:00` on screen — the same defect the Stitch draft shipped.
    // So the assertion is the mechanism: one wrapper, explicitly ltr, holding both ends.
    const { container } = renderHome(data())
    await screen.findByText('מתחילים')
    const range = container.querySelector('.studio-range')
    expect(range).toHaveAttribute('dir', 'ltr')
    expect(range?.textContent).toBe('16:00–17:00')
    expect(range?.querySelectorAll('bdi')).toHaveLength(0)
  })

  it('shows an empty state on a day with no classes — Saturdays are real', async () => {
    renderHome(data({ today: [] }))
    await screen.findByText(t('he', 'common.dash.home.today.none'))
  })

  it('renders in English too, so the screen is not RTL-only', async () => {
    renderHome(data(), 'en')
    await screen.findByRole('heading', { level: 1, name: t('en', 'common.dash.home.title') })
  })
})

const session = (over: Partial<SessionRow> = {}): SessionRow =>
  ({
    id: 'x',
    group_id: 'g',
    group_name: 'g',
    training_year_id: 'y',
    starts_at: '2026-08-29T13:00:00.000Z',
    ends_at: '2026-08-29T14:00:00.000Z',
    location_id: null,
    location_name: null,
    status: 'scheduled',
    is_manually_edited: false,
    is_ad_hoc: false,
    cancel_reason: null,
    staff: [],
    attendance_taken: false,
    ...over,
  }) as SessionRow

describe('coverage, derived rather than fetched', () => {
  // There is no coverage endpoint. `SessionRow` already carries `staff` and
  // `attendance_taken`, so the two counts `3a` asks for come out of the week's sessions.
  const now = new Date('2026-08-29T20:00:00.000Z')

  it('counts a session with nobody assigned as uncovered', () => {
    expect(summariseSessions([session()], now).noCoach).toBe(1)
  })

  it('does not count a cancelled session — a cancelled class needs no coach', () => {
    expect(summariseSessions([session({ status: 'cancelled' })], now).noCoach).toBe(0)
  })

  it('counts an ended session with no register as unmarked', () => {
    expect(summariseSessions([session()], now).unmarked).toBe(1)
  })

  it('does not count a session that has not happened yet — a future class is not late', () => {
    const future = session({ ends_at: '2026-08-30T14:00:00.000Z' })
    expect(summariseSessions([future], now).unmarked).toBe(0)
  })
})

describe('weekBounds', () => {
  it('runs Sunday to Saturday, the week an Israeli club runs on', () => {
    // 2026-08-29 is a Saturday, so its week started on the 23rd.
    expect(weekBounds(new Date('2026-08-29T09:00:00.000Z'))).toEqual({
      from: '2026-08-23',
      to: '2026-08-29',
    })
  })
})

describe('todayFrom', () => {
  it('keeps only the current local day and orders it by start time', () => {
    const rows = todayFrom(
      [
        session({ id: 'late', starts_at: '2026-08-29T17:00:00.000Z' }),
        session({ id: 'early', starts_at: '2026-08-29T13:00:00.000Z' }),
        session({ id: 'tomorrow', starts_at: '2026-08-30T13:00:00.000Z' }),
      ],
      new Date('2026-08-29T09:00:00.000Z'),
    )
    expect(rows.map((r) => r.id)).toEqual(['early', 'late'])
  })

  it('reads the lead coach and not an assistant — an assistant does not cover a session', () => {
    const rows = todayFrom(
      [
        session({
          staff: [
            { person_id: 'a', display_name: 'Assistant', role: 'assistant_coach', is_substitute: false },
            { person_id: 'l', display_name: 'Lead', role: 'lead_coach', is_substitute: false },
          ],
        }),
      ],
      new Date('2026-08-29T09:00:00.000Z'),
    )
    expect(rows[0]?.coach).toBe('Lead')
  })
})

describe('the attendance bars (2026-08-30)', () => {
  it('draws a bar per group with the number beside it, and no bar for an unmarked group', async () => {
    renderHome(data())
    const chart = await screen.findByTestId('home-attendance-chart')
    expect(chart).toHaveTextContent('82%')
    expect(chart).toHaveTextContent('ג׳וניורים')
    // A group nobody marked has no rate — the column says so instead of claiming 0%.
    expect(chart).toHaveTextContent(t('he', 'common.dash.home.attendanceChart.noRate'))
  })

  it('renders no chart card when the read failed', async () => {
    renderHome(data({ attendance: null }))
    await screen.findByTestId('home-attendance-chart').catch(() => undefined)
    expect(screen.queryByTestId('home-attendance-chart')).toBeNull()
  })

  // B6.4 — some groups null keeps the per-column treatment (already exercised above by
  // the mixed fixture); every group null collapses seven "אין נתונים" repetitions into
  // one EmptyState rather than seven identical grey tracks.
  it('renders one EmptyState instead of a track per group when every group is unmarked', async () => {
    renderHome(
      data({
        attendance: [
          { group_id: 'g1', group_name: 'א', rate_percent: null },
          { group_id: 'g2', group_name: 'ב', rate_percent: null },
          { group_id: 'g3', group_name: 'ג', rate_percent: null },
        ],
      }),
    )
    await screen.findByText(t('he', 'common.dash.home.attendanceEmptyAll'))
    // The seven-track chart is gone entirely — not rendered empty, not rendered hidden.
    expect(screen.queryByTestId('home-attendance-chart')).toBeNull()
    const link = screen.getByRole('link', { name: t('he', 'common.dash.home.attendanceChart.all') })
    expect(link).toHaveAttribute('href', '#/attendance')
  })

  it('keeps the per-column bars when only some groups are unmarked', async () => {
    // The mixed fixture from `data()` — one real rate, one null — must NOT collapse into
    // the blanket empty state; that would hide the one group that does have a bar.
    renderHome(data())
    const chart = await screen.findByTestId('home-attendance-chart')
    expect(chart).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'common.dash.home.attendanceEmptyAll'))).toBeNull()
  })
})

describe('B6.2 — the two-column body', () => {
  it('puts today\'s classes ahead of the attendance chart, both in the wide column', async () => {
    // B6.2: "today's classes moves to the top of the wide column" — it is currently the
    // last thing on the page and answers "what needs me today?"
    const { container } = renderHome(data())
    await screen.findByText('מתחילים')
    const main = container.querySelector('.dash-home__main')
    expect(main).not.toBeNull()
    const todayHeading = screen.getByRole('heading', { name: t('he', 'common.dash.home.today.title') })
    const chartHeading = screen.getByRole('heading', {
      name: t('he', 'common.dash.home.attendanceChart.title'),
    })
    expect(main?.contains(todayHeading)).toBe(true)
    expect(main?.contains(chartHeading)).toBe(true)
    const position = todayHeading.compareDocumentPosition(chartHeading)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps "requires attention" in the narrow side column', async () => {
    // `attention.title` and `money.overdueHint` are both "דורש טיפול" by design (the hint
    // under the overdue-families tile echoes the section it links to) — so this asserts
    // by heading role, not by text, to find the section rather than the tile's hint.
    const { container } = renderHome(data())
    const heading = await screen.findByRole('heading', {
      name: t('he', 'common.dash.home.attention.title'),
    })
    const side = container.querySelector('.dash-home__side')
    expect(side).not.toBeNull()
    expect(side?.contains(heading)).toBe(true)
  })
})
