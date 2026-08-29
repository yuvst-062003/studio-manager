// Parent artboard 12b — לוח הילד: חודש שלם, כולל נוכחות שהייתה.
//
// §5.6's change is only real when the family sees it. A schedule change that updates the
// dashboard and not the parent app is how a child arrives an hour early — which is E2E-5's
// second scenario, and the fifth test below at component level.
//
// The past-attendance half is M5's and ships as a stated gap, not a blank column.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
})
