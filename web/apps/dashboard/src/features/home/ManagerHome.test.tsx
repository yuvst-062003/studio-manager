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
    const range = container.querySelector('.dash-home__time')
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
