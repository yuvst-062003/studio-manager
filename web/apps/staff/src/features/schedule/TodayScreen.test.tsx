// Staff artboards 9a (היום — מסנן מאמן במקום פיצול מסכים · רצועת ימים · בהיר + כהה) and 1d.
//
// **One screen, two artboards.** 1d is 9a at a lower fidelity, the way 1a and 2a are the
// same parent home — building two components would give one screen two owners. The last
// test in this file is what keeps them from drifting apart.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import type { ResolvedTheme } from '@studio/ui'
import { memoryStore, setOfflineStore, writeWindow } from '@studio/core'
import type { OfflineStore, RosterRow as RosterRowData } from '@studio/core'
import { TodayScreen } from './TodayScreen'
import type { SessionRow, StaffScheduleClient } from './client'
import type { EventOut, StaffEventsClient } from '../events/client'
import type { StaffPeopleClient } from '../people'

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

function stub(
  sessions: SessionRow[] = [TODAY_SESSION],
  trainingYears: { starts_on: string; ends_on: string; status: string }[] = [
    { starts_on: '2026-09-01', ends_on: '2027-08-20', status: 'active' },
  ],
): StaffScheduleClient {
  return {
    listSessions: vi.fn(async () => sessions),
    listTrainingYears: vi.fn(async () => trainingYears),
  }
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
    // 15:00Z on 3 November is 17:00 in Jerusalem — winter, UTC+2. The time range's own
    // span, not the timeline dot's beneath it — C2 restyled the card with a second,
    // separate "17:00" (the dot's own start-time label), so the match is on the full
    // range rather than the bare hour.
    expect(await screen.findByText(/17:00–19:00/)).toBeInTheDocument()
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
    // Register §9's plural-rule fix: one session reads "שיעור אחד", not "1 שיעורים".
    expect(summary).toHaveTextContent('שיעור אחד')
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

  it('names the real cause when NO training year covers today (register §4.2)', async () => {
    // `_year_covering` (app/services/schedule/service.py) silently skips a date outside
    // every declared training year — the calendar, the register and the trial picker all
    // go quiet with no error anywhere. This is the attendance side saying what happened:
    // an empty day and a year-less date must not read as the same thing.
    render(screenFor({ client: stub([], []) }))
    expect(await screen.findByText(t('he', 'schedule.today.noTrainingYear'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.today.noTrainingYearHint'))).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'schedule.today.empty'))).not.toBeInTheDocument()
  })

  it('does not claim a training-year gap when a year genuinely covers today', async () => {
    // The 2026-27 default fixture (starts_on 2026-09-01, ends_on 2027-08-20) covers
    // 2026-11-03 — an ordinary day off must still read as an ordinary day off.
    render(screenFor({ client: stub([]) }))
    expect(await screen.findByText(t('he', 'schedule.today.empty'))).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'schedule.today.noTrainingYear'))).not.toBeInTheDocument()
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

// §4.1's merge: `GET /api/v1/events` alongside `GET /api/v1/sessions`, client-side, no new
// endpoint. The seam under test is fetch (both clients) → merge → render order, not just
// `mergeTimeline` in isolation (that lives in `timeline.test.ts`).
describe('TodayScreen — events merged into the timeline (§4.1)', () => {
  function eventsClientStub(events: EventOut[]): StaffEventsClient {
    return {
      list: vi.fn(async () => ({ items: events, next_cursor: null, has_more: false })),
    } as unknown as StaffEventsClient
  }

  const EVENT: EventOut = {
    id: 'ev1',
    title: 'תחרות אזורית',
    description: null,
    type: 'competition',
    status: 'published',
    // 13:00Z is 15:00 in Jerusalem — before TODAY_SESSION's 17:00, so it must render first.
    starts_at: '2026-11-03T13:00:00Z',
    ends_at: null,
    location_id: null,
    location_text: 'היכל הספורט',
    requires_consent: false,
    consent_text: null,
    consent_signed_count: 0,
    rsvp_deadline: null,
    rsvp_yes_count: 3,
    rsvp_no_count: 1,
    rsvp_pending_count: 2,
    fee_agorot: null,
  }

  it('merges a session and an event into one list, ordered by start time', async () => {
    render(screenFor({ client: stub([TODAY_SESSION]), eventsClient: eventsClientStub([EVENT]) }))
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('תחרות אזורית')).toBeInTheDocument()
    expect(within(rows[1]!).getByTestId('session-duration')).toBeInTheDocument()
  })

  it("marks the event visually and opens its own roster screen, not a session's", async () => {
    render(screenFor({ client: stub([]), eventsClient: eventsClientStub([EVENT]) }))
    expect(await screen.findByText(t('he', 'events.type.competition'))).toBeInTheDocument()
    expect(screen.getByTestId('open-event-roster')).toHaveAttribute('href', '#/events/ev1/roster')
  })

  it('renders no events at all when no eventsClient is supplied — unchanged from before C2', async () => {
    render(screenFor({ client: stub([TODAY_SESSION]) }))
    await screen.findByTestId('session-row')
    expect(screen.queryByTestId('event-row')).toBeNull()
  })
})

// §4.1's "the card also carries who has answered" — every roster row already carries
// `has_confirmation`/`has_absence_report` in the offline cache primed at launch (§6.1).
// The seam under test is fetch (the cache) → state → card, not just `confirmationCounts`
// in isolation (that lives in `timeline.test.ts`).
describe('TodayScreen — who has confirmed, from the offline cache (§4.1)', () => {
  let store: OfflineStore
  const NOW = '2026-11-03T12:00:00Z'

  const rosterRow = (overrides: Partial<RosterRowData> = {}): RosterRowData => ({
    student_id: 'stu-1',
    display_name: 'ילד',
    belt_color_hex: null,
    belt_name: null,
    health_status: 'missing',
    derived_flags: {},
    status: 'unmarked',
    source: null,
    has_absence_report: false,
    absence_reason: null,
    ...overrides,
  })

  const cachedSession = () => ({
    id: TODAY_SESSION.id,
    group_id: 'g1',
    group_name: TODAY_SESSION.group_name,
    starts_at: TODAY_SESSION.starts_at,
    ends_at: TODAY_SESSION.ends_at,
    location_name: null,
    status: 'scheduled' as const,
    attendance_taken: false,
  })

  beforeEach(() => {
    store = memoryStore()
    setOfflineStore(store)
  })

  afterEach(() => {
    setOfflineStore(null)
  })

  it('reads has_confirmation off the cached roster and shows the counts on the card', async () => {
    await writeWindow(store, {
      server_time: NOW,
      from_time: NOW,
      to_time: NOW,
      sessions: [cachedSession()],
      rosters: {
        [TODAY_SESSION.id]: [
          rosterRow({ student_id: '1', has_confirmation: true }),
          rosterRow({ student_id: '2', has_confirmation: true }),
          rosterRow({ student_id: '3' }),
        ],
      },
    })

    render(screenFor({ client: stub([TODAY_SESSION]) }))

    const confirmed = await screen.findByTestId('session-confirmed')
    expect(confirmed).toHaveTextContent('2')
    expect(confirmed).toHaveTextContent('3')
    // One family unanswered — the `.one` plural form names it in words, the same rule
    // `schedule.today.sessionCount.one` already sets for a single session.
    expect(screen.getByTestId('session-not-answered')).toHaveTextContent(
      t('he', 'schedule.session.notAnsweredCount.one'),
    )
  })

  it('offers to chase the families who have not answered, resolving guardians only on tap', async () => {
    await writeWindow(store, {
      server_time: NOW,
      from_time: NOW,
      to_time: NOW,
      sessions: [cachedSession()],
      rosters: { [TODAY_SESSION.id]: [rosterRow({ student_id: 'stu-9' })] },
    })

    const student = vi.fn(async () => ({
      guardians: [
        {
          person_id: 'p9',
          display_name: 'הורה של דנה',
          phone: '050-0000000',
          is_primary: true,
          student_id: 'stu-9',
          relation: 'parent',
        },
      ],
    }))
    const peopleClient = { student } as unknown as StaffPeopleClient

    render(screenFor({ client: stub([TODAY_SESSION]), peopleClient }))

    const trigger = await screen.findByTestId('contact-open')
    expect(student).not.toHaveBeenCalled()
    await userEvent.click(trigger)
    await waitFor(() => expect(student).toHaveBeenCalledWith('stu-9'))
    expect(await screen.findByTestId('contact-message')).toHaveTextContent(TODAY_SESSION.group_name)
  })

  it('does not offer to chase anyone once every family has answered', async () => {
    await writeWindow(store, {
      server_time: NOW,
      from_time: NOW,
      to_time: NOW,
      sessions: [cachedSession()],
      rosters: { [TODAY_SESSION.id]: [rosterRow({ student_id: '1', has_confirmation: true })] },
    })
    render(screenFor({ client: stub([TODAY_SESSION]) }))
    await screen.findByTestId('session-confirmed')
    expect(screen.queryByTestId('contact-open')).toBeNull()
  })
})
