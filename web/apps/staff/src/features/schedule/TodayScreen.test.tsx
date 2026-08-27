// Staff artboards 9a (היום — מסנן מאמן במקום פיצול מסכים · רצועת ימים · בהיר + כהה) and 1d.
//
// **One screen, two artboards.** 1d is 9a at a lower fidelity, the way 1a and 2a are the
// same parent home — building two components would give one screen two owners. The last
// test in this file is what keeps them from drifting apart.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import type { ResolvedTheme } from '@studio/ui'
import { TodayScreen } from './TodayScreen'
import type { SessionRow, StaffScheduleClient } from './client'

const base = {
  group_id: 'g1',
  group_name: 'מתחילים',
  training_year_id: 'y1',
  location_id: null,
  location_name: 'אולם א׳',
  cancel_reason: null,
  is_manually_edited: false,
  is_ad_hoc: false,
  attendance_taken: false,
  headcount: 14,
  staff: [],
}

const TODAY_SESSION: SessionRow = {
  ...base,
  id: 's1',
  starts_at: '2026-11-03T15:00:00Z',
  ends_at: '2026-11-03T17:00:00Z',
  status: 'scheduled',
}

const LATE: SessionRow = {
  ...base,
  id: 's2',
  // 22:30Z on 3 November is already 4 November in Jerusalem.
  starts_at: '2026-11-03T22:30:00Z',
  ends_at: '2026-11-03T23:30:00Z',
  status: 'scheduled',
}

const COACHES = [
  { person_id: 'p1', display_name: 'רון מאמן' },
  { person_id: 'p2', display_name: 'נועה' },
]

function stub(sessions: SessionRow[] = [TODAY_SESSION]): StaffScheduleClient {
  return { listSessions: vi.fn(async () => sessions) }
}

function renderIn(
  ui: ReactElement,
  { locale = 'he', theme = 'light' }: { locale?: Locale; theme?: ResolvedTheme } = {},
) {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  document.documentElement.lang = locale
  document.documentElement.dir = DIRECTION[locale]
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

function screenFor(props: Record<string, unknown> = {}) {
  return (
    <TodayScreen
      locale="he"
      client={stub()}
      today="2026-11-03T12:00:00Z"
      coaches={COACHES}
      {...props}
    />
  )
}

describe('TodayScreen (9a / 1d)', () => {
  it("renders today's sessions in the studio timezone", async () => {
    render(screenFor())
    // 15:00Z on 3 November is 17:00 in Jerusalem — winter, UTC+2.
    expect(await screen.findByText(/17:00/)).toBeInTheDocument()
  })

  it('files a 22:30Z session under tomorrow, not today', async () => {
    // The evening-class bug, on the surface where a coach would actually be bitten by it.
    render(screenFor({ client: stub([LATE]) }))
    expect(await screen.findByText(t('he', 'schedule.today.empty'))).toBeInTheDocument()
  })

  it('renders a seven-day strip and marks the selected day', async () => {
    render(screenFor())
    const strip = screen.getByRole('group', { name: t('he', 'schedule.datePicker.title') })
    await waitFor(() => expect(within(strip).getAllByRole('button')).toHaveLength(7))
    expect(screen.getByTestId('day-chip-2026-11-03')).toHaveAttribute('aria-current', 'date')
  })

  it('refetches when another day in the strip is chosen', async () => {
    const client = stub()
    render(screenFor({ client }))
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled())
    await userEvent.click(screen.getByTestId('day-chip-2026-11-05'))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-11-05', to: '2026-11-05' }),
      ),
    )
  })

  it('filters by coach instead of splitting the screen', async () => {
    // 9a's headline: מסנן מאמן במקום פיצול מסכים.
    const client = stub()
    render(screenFor({ client }))
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled())

    await userEvent.selectOptions(screen.getByTestId('coach-filter'), 'p2')
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ coachPersonId: 'p2' }),
      ),
    )
  })

  it('clearing the filter asks for every coach again', async () => {
    const client = stub()
    render(screenFor({ client }))
    await userEvent.selectOptions(screen.getByTestId('coach-filter'), 'p2')
    await waitFor(() => expect(client.listSessions).toHaveBeenCalledTimes(2))
    await userEvent.selectOptions(screen.getByTestId('coach-filter'), '')
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ coachPersonId: undefined }),
      ),
    )
  })

  it("defaults a coach to their own sessions rather than the whole club's", async () => {
    const client = stub()
    render(screenFor({ client, viewerPersonId: 'p1', viewerIsCoach: true }))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ coachPersonId: 'p1' }),
      ),
    )
  })

  it('shows a manager every session by default — the same screen, both roles', async () => {
    const client = stub()
    render(screenFor({ client, viewerPersonId: 'p9', viewerIsCoach: false }))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ coachPersonId: undefined }),
      ),
    )
  })

  it("renders 1d's card: duration, headcount, and the register-state marker (S7)", async () => {
    renderIn(
      screenFor({ client: stub([{ ...TODAY_SESSION, attendance_taken: true }]) }),
    )
    expect(await screen.findByTestId('session-duration')).toHaveTextContent('120 דק׳')
    expect(screen.getByTestId('session-headcount')).toHaveTextContent('אולם א׳ · 14 חניכים')
    expect(screen.getByText(t('he', 'schedule.session.attendanceTaken'))).toBeInTheDocument()
  })

  it('shows no register marker while the register is still owed (S7)', async () => {
    renderIn(screenFor())
    await screen.findByTestId('session-row')
    expect(screen.queryByText(t('he', 'schedule.session.attendanceTaken'))).toBeNull()
  })

  it('sums the day in the header and names the filtered coach (S7)', async () => {
    renderIn(screenFor({ viewerIsCoach: true, viewerPersonId: 'p1' }))
    await screen.findByTestId('session-row')
    const summary = screen.getByTestId('today-summary')
    expect(summary).toHaveTextContent('1 שיעורים')
    expect(summary).toHaveTextContent('רון מאמן')
  })

  it('walks back to today from a picked day, and titles the day it shows (S7)', async () => {
    renderIn(screenFor({ initialDay: '2026-11-10' }))
    // 10 November 2026 is a Tuesday; the title names the day being looked at, not היום.
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('יום שלישי')
    expect(screen.queryByRole('heading', { level: 1, name: 'היום' })).toBeNull()
    await userEvent.click(screen.getByTestId('back-to-today'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('היום')
    expect(screen.queryByTestId('back-to-today')).toBeNull()
  })

  it('says there are no sessions today, and why', async () => {
    render(screenFor({ client: stub([]) }))
    expect(await screen.findByText(t('he', 'schedule.today.empty'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.today.emptyHint'))).toBeInTheDocument()
  })

  it('shows a cancelled session with its translated reason, never the token', async () => {
    render(
      screenFor({
        client: stub([{ ...TODAY_SESSION, status: 'cancelled', cancel_reason: 'system:closure' }]),
      }),
    )
    expect(
      await screen.findByText(t('he', 'schedule.session.cancelReason.closure')),
    ).toBeInTheDocument()
    expect(screen.queryByText('system:closure')).toBeNull()
  })

  it('tells a coach a session will survive the next schedule change', async () => {
    render(screenFor({ client: stub([{ ...TODAY_SESSION, is_manually_edited: true }]) }))
    expect(
      await screen.findByText(t('he', 'schedule.session.manuallyEditedHint')),
    ).toBeInTheDocument()
  })

  it('gives every row a 44px touch target', async () => {
    // §6.2's thumb rule: one-handed, on a moving bus.
    render(screenFor())
    const row = await screen.findByTestId('session-row')
    expect(row.getAttribute('style') ?? '').toContain('min-block-size: 44px')
  })

  it.each(['light', 'dark'] as const)('renders in %s, per 9a being drawn בהיר + כהה', (theme) => {
    renderIn(screenFor(), { theme })
    expect(document.documentElement).toHaveAttribute('data-theme', theme)
  })

  it('gives every control an accessible name', async () => {
    render(screenFor())
    await screen.findByTestId('session-row')
    for (const control of [
      ...screen.getAllByRole('button'),
      ...screen.getAllByRole('combobox'),
    ]) {
      expect(control).toHaveAccessibleName()
    }
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    const { container } = renderIn(screenFor({ locale }), { locale })
    await screen.findByTestId('session-row')
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })

  it('does not take attendance — that is M5, and 9f is its screen', async () => {
    // §5.7's roster is W3's. A tap target here that looked like a mark would be a coach
    // marking into a table that does not exist.
    render(screenFor())
    await screen.findByTestId('session-row')
    expect(screen.queryByTestId('attendance-mark')).toBeNull()
  })
})
