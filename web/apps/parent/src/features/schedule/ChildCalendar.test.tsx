// Parent artboard 12b — לוח הילד: חודש שלם, כולל נוכחות שהייתה.
//
// §5.6's change is only real when the family sees it. A schedule change that updates the
// dashboard and not the parent app is how a child arrives an hour early — which is E2E-5's
// second scenario, and the fifth test below at component level.
//
// The past-attendance half is M5's and ships as a stated gap, not a blank column.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import type { ResolvedTheme } from '@studio/ui'
import { ChildCalendar } from './ChildCalendar'
import type { ParentScheduleClient, SessionRow } from './client'

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
  staff: [],
}

/**
 * The class as it WAS: 17:00 local on 6 October.
 *
 * 14:00Z, not 15:00Z — Israel is still on summer time until 25 October, so October is
 * UTC+3 and November is UTC+2. The same wall-clock hour is a different instant either
 * side of that Sunday, which is the whole reason the rule stores a naive time.
 */
const PAST: SessionRow = {
  ...base,
  id: 'past',
  starts_at: '2026-10-06T14:00:00Z',
  ends_at: '2026-10-06T16:00:00Z',
  status: 'completed',
}

/** 16:00Z on 17 November is 18:00 in Jerusalem — the class after the change. */
const FUTURE: SessionRow = {
  ...base,
  id: 'future',
  starts_at: '2026-11-17T16:00:00Z',
  ends_at: '2026-11-17T18:00:00Z',
  status: 'scheduled',
}

/** The first two lessons of a training year that starts on 1 September. */
const SEPTEMBER: SessionRow[] = [
  { ...base, id: 'sep1', starts_at: '2026-09-01T15:00:00Z', ends_at: '2026-09-01T16:00:00Z', status: 'scheduled' },
  { ...base, id: 'sep2', starts_at: '2026-09-03T15:00:00Z', ends_at: '2026-09-03T16:00:00Z', status: 'scheduled' },
]

const LATE: SessionRow = {
  ...base,
  id: 'late',
  // 22:30Z on 3 November is already 4 November in Jerusalem.
  starts_at: '2026-11-03T22:30:00Z',
  ends_at: '2026-11-03T23:30:00Z',
  status: 'scheduled',
}

function stub(sessions: SessionRow[] = [PAST, FUTURE]): ParentScheduleClient {
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

function calendar(props: Record<string, unknown> = {}) {
  return (
    <ChildCalendar locale="he" client={stub()} today="2026-11-03T12:00:00Z" {...props} />
  )
}

describe('ChildCalendar (12b)', () => {
  it('renders a whole month, Sunday first', async () => {
    render(calendar())
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(30))
    expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent(t('he', 'schedule.weekday.0'))
  })

  it('splits upcoming from past', async () => {
    // A parent checking the night before and a parent checking what happened want
    // different halves of the same month.
    render(calendar())
    expect(await screen.findByText(t('he', 'schedule.calendar.upcoming'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.calendar.past'))).toBeInTheDocument()
  })

  it.each(['he', 'en', 'ru'] as const)(
    'renders every time in Asia/Jerusalem regardless of locale (%s)',
    async (locale) => {
      // G3 — a guardian reading in English abroad must not see a different hour from the
      // coach reading in Hebrew on the mat.
      render(calendar({ locale }))
      const upcoming = await screen.findByTestId('upcoming-session')
      expect(upcoming).toHaveTextContent('18:00')
    },
  )

  it('files a 22:30Z session under the next day', async () => {
    render(calendar({ client: stub([LATE]) }))
    await waitFor(() =>
      expect(screen.getByTestId('calendar-day-2026-11-04')).toHaveAttribute(
        'data-has-sessions',
        'true',
      ),
    )
  })

  it('shows the new time on a future lesson and the old one on a past lesson', async () => {
    // E2E-5's second scenario. §5.6 rewrites only the future, so the past keeps 17:00 while
    // the future reads 18:00 — and the family seeing that is what makes the change real.
    render(calendar())
    expect(await screen.findByTestId('upcoming-session')).toHaveTextContent('18:00')
    // The past list is folded away by default — a month of it is thirty-odd rows.
    await userEvent.click(screen.getByTestId('past-toggle'))
    expect(screen.getByTestId('past-session')).toHaveTextContent('17:00')
    expect(screen.getByTestId('past-session')).not.toHaveTextContent('18:00')
  })

  it('shows a cancelled lesson with its translated reason, not the system token', async () => {
    render(
      calendar({
        client: stub([{ ...FUTURE, status: 'cancelled', cancel_reason: 'system:closure' }]),
      }),
    )
    expect(
      await screen.findByText(t('he', 'schedule.session.cancelReason.closure')),
    ).toBeInTheDocument()
    expect(screen.queryByText('system:closure')).toBeNull()
  })

  it('does not ring a cancelled future session as planned (register §3.8)', async () => {
    // The planned-marker loop used to mark every future session id 'planned' with no
    // status check at all — so a cancelled class still drew the same accent ring as a
    // real one, which is why the calendar and Home's "בהמשך השבוע" (status === 'scheduled'
    // only) could name different days for the same week.
    render(calendar({ client: stub([{ ...FUTURE, status: 'cancelled', cancel_reason: 'system:closure' }]) }))
    const cell = await screen.findByTestId('calendar-day-2026-11-17')
    expect(cell).not.toHaveAttribute('data-state', 'planned')
  })

  it('still rings a genuinely scheduled future session as planned', async () => {
    render(calendar({ client: stub([FUTURE]) }))
    const cell = await screen.findByTestId('calendar-day-2026-11-17')
    expect(cell).toHaveAttribute('data-state', 'planned')
  })

  it('names the month in words rather than as an ISO key', async () => {
    // The heading was `${year}-${pad(month)}`, so a Hebrew-speaking parent read "2026-11"
    // sitting above a grid whose every other date is spelled out. It is also the one string
    // on the screen that never changed with the language picker.
    render(calendar({ client: stub() }))
    await waitFor(() => expect(screen.getByTestId('calendar-month')).toHaveTextContent('נובמבר'))
    expect(screen.getByTestId('calendar-month')).not.toHaveTextContent('2026-11')
  })

  it('moves month by month and refetches the month it lands on', async () => {
    const client = stub()
    render(calendar({ client }))
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled())
    await userEvent.click(screen.getByTestId('calendar-next'))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith({ from: '2026-12-01', to: '2026-12-31' }),
    )
    await userEvent.click(screen.getByTestId('calendar-previous'))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith({ from: '2026-11-01', to: '2026-11-30' }),
    )
  })

  it('never names a group or a student — the server decides what this parent may see', async () => {
    // The temptation to "help" the server filter is exactly how a parent app leaks a
    // roster. The client's own type forbids it; this asserts the call site too.
    const client = stub()
    render(calendar({ client }))
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled())
    for (const call of vi.mocked(client.listSessions).mock.calls) {
      expect(Object.keys(call[0] ?? {}).sort()).toEqual(['from', 'to'])
    }
  })

  it('folds the month of past lessons away, and says how many there are', async () => {
    // A busy month is thirty-odd rows, and they were all rendered open, below the two
    // sections a parent actually came for. The month grid already carries every one of
    // these days as a dot; the list is the detail you go looking for, not the page.
    render(calendar({ client: stub() }))
    await waitFor(() => expect(screen.getByTestId('past-toggle')).toBeInTheDocument())
    // Not `queryAllByTestId(...).toHaveLength(0)`: jsdom keeps the children of a CLOSED
    // `<details>` in the DOM, so that assertion would pass whether or not it was folded.
    // `toBeVisible` knows about `details` and is the assertion that can actually fail.
    expect(screen.getByTestId('past-session')).not.toBeVisible()
    // The count is on the summary, so it is answerable without opening it.
    expect(screen.getByTestId('past-toggle')).toHaveTextContent('1')
    await userEvent.click(screen.getByTestId('past-toggle'))
    expect(screen.getAllByTestId('past-session').length).toBeGreaterThan(0)
  })

  it('says the month is empty and why', async () => {
    render(calendar({ client: stub([]) }))
    expect(await screen.findByText(t('he', 'schedule.calendar.empty'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.calendar.emptyHint'))).toBeInTheDocument()
  })

  it('carries real attendance per day, with the legend — P3', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/me/attendance')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  session_id: 'past',
                  student_id: 'st1',
                  status: 'present',
                  starts_at: '2026-11-02T14:00:00Z',
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
    render(calendar())
    const day = await screen.findByTestId('calendar-day-2026-11-02')
    await waitFor(() => expect(day).toHaveAttribute('data-state', 'present'))
    expect(screen.getByTestId('calendar-legend')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-summary')).toBeInTheDocument()
    // The stale promise is gone with the feature it promised.
    expect(
      document.body.textContent ?? '',
    ).not.toContain('הנוכחות שהייתה תוצג בהמשך')
    vi.unstubAllGlobals()
  })

  it.each(['light', 'dark'] as const)('renders in %s', (theme) => {
    renderIn(calendar(), { theme })
    expect(document.documentElement).toHaveAttribute('data-theme', theme)
  })

  it('gives every control an accessible name', async () => {
    render(calendar())
    await screen.findByTestId('upcoming-session')
    for (const control of screen.getAllByRole('button')) {
      expect(control).toHaveAccessibleName()
    }
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    const { container } = renderIn(calendar({ locale }), { locale })
    await screen.findByTestId('upcoming-session')
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })

  it('shows the next lessons even when the open month has none', async () => {
    // The bug a real club hit on day one: the training year starts in September, a parent
    // signs up on 30 August, and the calendar opens on August — which has no lessons at
    // all. Every list on the screen was bounded to the visible month, so the family was
    // shown "אין שיעורים בחודש הזה" and nothing else, three days before the first class.
    //
    // The month grid is a month and stays one. השיעורים הקרובים is not: "when does my
    // child next train" is the question this screen exists to answer, and the answer does
    // not stop at the 31st.
    const ranges: { from: string; to: string }[] = []
    const client: ParentScheduleClient = {
      listSessions: vi.fn(async (query: { from: string; to: string }) => {
        ranges.push(query)
        return SEPTEMBER.filter(
          (row) => row.starts_at.slice(0, 10) >= query.from && row.starts_at.slice(0, 10) <= query.to,
        )
      }),
    }
    render(calendar({ client, today: '2026-08-30T09:00:00Z' }))

    const rows = await screen.findAllByTestId('upcoming-session')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('מתחילים')
    // August itself is genuinely empty, and the grid still says so — the fix is not to
    // hide the truth about the open month.
    expect(screen.getByTestId('calendar-day-2026-08-31')).toHaveAttribute(
      'data-has-sessions',
      'false',
    )
    // Somebody asked past the end of August. Without that read there is nothing to show.
    expect(ranges.some((range) => range.to > '2026-08-31')).toBe(true)
  })

  // -- the popup a lesson opens (owner request, 2026-08-30) --------------------
  //
  // "when a user presses the session on the calendar a popup should open and ask for
  // attendance if comes or not."

  /** `/me/students` is what names the child the answer is about, so the popup has nothing
   *  to render without it. `/me/attendance` carries whatever this family already
   *  pre-reported. */
  function stubFetch(attendance: unknown[] = []) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/me/students')) {
          return new Response(
            JSON.stringify({ items: [{ id: 'child-1', first_name: 'דנה', last_name: 'לוי' }] }),
            { status: 200 },
          )
        }
        if (url.includes('/me/attendance')) {
          return new Response(JSON.stringify({ items: attendance }), { status: 200 })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
  }

  function withAbsence(overrides: Record<string, unknown> = {}, attendance: unknown[] = []) {
    stubFetch(attendance)
    const report = vi.fn(async () => ({}))
    const cancel = vi.fn(async () => undefined)
    const ui = calendar({ client: stub([FUTURE]), absence: { report, cancel }, ...overrides })
    return { ui, report, cancel }
  }

  afterEach(() => vi.unstubAllGlobals())

  it('opens the attendance popup from a day that has a lesson', async () => {
    const { ui } = withAbsence()
    render(ui)
    await userEvent.click(await screen.findByTestId('calendar-open-2026-11-17'))
    expect(screen.getByTestId('attend-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('attend-coming')).toBeInTheDocument()
    expect(screen.getByTestId('attend-not-coming')).toBeInTheDocument()
  })

  it('leaves a day with no lesson unpressable', async () => {
    const { ui } = withAbsence()
    render(ui)
    await screen.findByTestId('calendar-open-2026-11-17')
    // A button on every square would teach a parent that pressing a day does something,
    // and then do nothing on twenty-nine of them.
    expect(screen.queryByTestId('calendar-open-2026-11-18')).toBeNull()
  })

  it('files a pre-report when the parent answers לא מגיעים', async () => {
    const { ui, report } = withAbsence()
    render(ui)
    await userEvent.click(await screen.findByTestId('calendar-open-2026-11-17'))
    await userEvent.click(screen.getByTestId('attend-not-coming'))
    await userEvent.type(screen.getByLabelText(t('he', 'schedule.calendar.attend.reason')), 'חולה')
    await userEvent.click(screen.getByTestId('attend-send'))
    await waitFor(() =>
      expect(report).toHaveBeenCalledWith({
        sessionId: 'future',
        studentId: 'child-1',
        reason: 'חולה',
      }),
    )
    expect(screen.getByTestId('attend-saved')).toHaveTextContent(
      t('he', 'schedule.calendar.attend.notComingSaved'),
    )
  })

  it('writes nothing when מגיעים is pressed and nothing was reported', async () => {
    // A parent cannot mark their own child present — attendance is taken on the mat. The
    // button's only job is to undo a report, so with none to undo it closes and stays
    // quiet rather than claiming a save that never happened.
    const { ui, report, cancel } = withAbsence()
    render(ui)
    await userEvent.click(await screen.findByTestId('calendar-open-2026-11-17'))
    await userEvent.click(screen.getByTestId('attend-coming'))
    expect(report).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
    expect(screen.queryByTestId('attend-dialog')).toBeNull()
  })

  it('refuses to answer for a lesson that already happened', async () => {
    const { ui } = withAbsence({ client: stub([PAST]), today: '2026-11-03T12:00:00Z' })
    render(ui)
    // November's grid does not hold an October lesson, so the past list is the way in.
    await userEvent.click(await screen.findByTestId('calendar-previous'))
    await userEvent.click(await screen.findByTestId('calendar-open-2026-10-06'))
    expect(screen.getByTestId('attend-blocked')).toHaveTextContent(
      t('he', 'schedule.calendar.attend.past'),
    )
    expect(screen.queryByTestId('attend-not-coming')).toBeNull()
  })

  it('offers day, week and month, and the arrows move by the open one', async () => {
    // "in the calendar screen the parent can choose between the month and the week and
    // the day like in the admin."
    render(calendar())
    await screen.findAllByTestId('upcoming-session')
    await userEvent.click(screen.getByRole('radio', { name: t('he', 'schedule.view.day') }))
    // One day, one cell — and the arrow steps a day rather than a month.
    expect(screen.getAllByRole('cell')).toHaveLength(1)
    expect(screen.getByTestId('calendar-day-2026-11-03')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'schedule.calendar.nextDay') }),
    )
    expect(screen.getByTestId('calendar-day-2026-11-04')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: t('he', 'schedule.view.week') }))
    expect(screen.getAllByRole('cell')).toHaveLength(7)
  })

  it('keeps the week view populated after navigating away from today', async () => {
    // The old filter was `week.includes(todayKey)`, so any month but this one rendered a
    // header row and nothing under it.
    render(calendar())
    await screen.findAllByTestId('upcoming-session')
    await userEvent.click(screen.getByRole('radio', { name: t('he', 'schedule.view.week') }))
    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'schedule.calendar.nextWeek') }),
    )
    expect(screen.getAllByRole('cell')).toHaveLength(7)
    expect(screen.getByTestId('calendar-day-2026-11-10')).toBeInTheDocument()
  })

  // -- screen 6 of the Stitch redesign, direction A (user pick, 2026-09-01) ------

  it('draws one mark per child, rather than the worst of them', async () => {
    // `DAY_PRIORITY` picked a single status per day, worst first, so an evening where
    // דנה trained and יוסי did not rendered as one red dot — and the fact that one child
    // DID turn up was destroyed at render, in the view that is the default.
    stubFetch([
      {
        session_id: 'past',
        student_id: 'child-1',
        status: 'present',
        starts_at: '2026-11-02T14:00:00Z',
      },
      {
        session_id: 'other',
        student_id: 'child-2',
        status: 'absent_unexcused',
        starts_at: '2026-11-02T16:00:00Z',
      },
    ])
    render(calendar())
    const day = await screen.findByTestId('calendar-day-2026-11-02')
    // The marks are the only `role="img"` in a cell — the cell is `role="cell"`.
    await waitFor(() => expect(day.querySelectorAll('[role="img"]')).toHaveLength(2))
    const states = [...day.querySelectorAll('[role="img"]')].map((mark) =>
      mark.getAttribute('data-state'),
    )
    expect(states).toContain('present')
    expect(states).toContain('absent')
  })

  it('names all five states in the legend, the unmarked one included', async () => {
    // `DayState` is five and `DAY_TONE` colours five, but the legend mapped four — so a
    // grey dot shipped with nothing naming it while `calendar.legend.unmarked` sat unused
    // in all three locales. A state the legend does not name is a state told by colour.
    render(calendar())
    const legend = await screen.findByTestId('calendar-legend')
    expect(legend.querySelectorAll('li')).toHaveLength(5)
    expect(legend).toHaveTextContent(t('he', 'schedule.calendar.legend.unmarked'))
  })

  it('gives a training day a tap target a thumb can hit', async () => {
    // §6.2's floor is 44px and the cell was 40. jsdom computes no layout, so the declared
    // minimum is what there is to assert — which is also the thing that regressed.
    const { ui } = withAbsence()
    render(ui)
    const target = await screen.findByTestId('calendar-open-2026-11-17')
    const cell = target.closest('[role="cell"]')
    expect(cell?.getAttribute('style') ?? '').toMatch(/min-block-size:\s*(4[4-9]|[5-9]\d)px/)
  })

  it('folds the coming lessons away, and says how many there are', async () => {
    // The upcoming list ran to eighteen rows over a sixty-day horizon and was the longest
    // thing on the page, under a grid that already carries every one of those days. The
    // past list was folded in P3; this half never was.
    render(calendar())
    await waitFor(() => expect(screen.getByTestId('upcoming-toggle')).toBeInTheDocument())
    expect(screen.getByTestId('upcoming-session')).not.toBeVisible()
    expect(screen.getByTestId('upcoming-toggle')).toHaveTextContent('1')
    await userEvent.click(screen.getByTestId('upcoming-toggle'))
    expect(screen.getByTestId('upcoming-session')).toBeVisible()
  })

  it('offers the absence report as a control, not a caption-sized link', async () => {
    // It shipped as a bare `<a>` with no styling at all, wedged into the end of the band
    // that also held both month arrows and the day/week/month switch. It is the only
    // WRITE on the screen and it looked like the least important thing on it.
    render(calendar())
    const entry = await screen.findByTestId('calendar-absence')
    expect(entry.getAttribute('style') ?? '').toMatch(/min-block-size:\s*(4[4-9]|[5-9]\d)px/)
    expect(entry).toHaveAccessibleName()
  })
})
