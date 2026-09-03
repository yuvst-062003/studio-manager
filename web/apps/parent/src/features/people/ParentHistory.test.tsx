// The two histories the parent app could not show, and the trial lesson it could not name.
//
// Everything here is a **read that already existed on the manager's side**. The rows have
// been in the database since M3; what was missing was the family's way to them. So the
// assertions that carry weight are the negatives — which route is called, and what the
// screen refuses to render — rather than "the section appears".
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { Session } from '@studio/core'
import { Resolve } from '../identity/Resolve'
import { TrialHome } from './TrialHome'
import { StatusHistorySection } from './sections/StatusHistorySection'
import { nextTrialLesson } from './peopleClient'
import type { MyTrialBooking, StudentSummary } from './peopleClient'

const student = (over: Partial<StudentSummary> = {}): StudentSummary =>
  ({
    id: 'st1',
    person_id: 'p1',
    first_name: 'נועה',
    last_name: 'לוי',
    birthdate: '2019-04-01',
    status: 'active',
    health_status: 'signed',
    joined_on: '2026-08-02',
    left_on: null,
    group_names: ['מתחילים'],
    guardian_display_names: ['יעל לוי'],
    frozen_until: null,
    ...over,
  }) as StudentSummary

const booking = (over: Partial<MyTrialBooking> = {}): MyTrialBooking => ({
  student_id: 'st1',
  group_id: 'g1',
  group_name: 'מתחילים',
  session_starts_at: '2026-09-06T14:00:00Z',
  attended: null,
  ...over,
})

/** A signed-in guardian whose every child is on a trial — §6.3's condition, so `Resolve`
 *  takes the reduced-home branch. */
const trialFamily = (): Session =>
  ({
    status: 'signed-in',
    access: { staff: false, parent: true },
    studios: [
      {
        studio_id: 'a',
        studio_name: 'מועדון א',
        studio_is_demo: false,
        person_id: 'p-a',
        roles: [] as string[],
        is_guardian: true,
      },
    ],
    activeStudioId: 'a',
    activeStudioName: 'מועדון א',
    devTools: false,
    isPlatformAdmin: false,
    actingAsPersonId: null,
    actingAsLabel: null,
    displayName: 'יעל לוי',
    email: 'yael@example.invalid',
    reload: vi.fn(),
    signOut: vi.fn(),
  }) as Session

const noPhysicalCss = (container: HTMLElement) => {
  for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
    expect(node.getAttribute('style') ?? '').not.toMatch(
      /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
    )
  }
}

/** The status history the task names verbatim: joined 2 August, frozen 1 October,
 *  returned 1 November — the record a parent telephones the club about. */
const HISTORY = {
  items: [
    { student_id: 'st1', from_status: 'lead', to_status: 'active', changed_at: '2026-08-02T09:00:00Z' },
    { student_id: 'st1', from_status: 'active', to_status: 'frozen', changed_at: '2026-10-01T09:00:00Z' },
    { student_id: 'st1', from_status: 'frozen', to_status: 'active', changed_at: '2026-11-01T09:00:00Z' },
  ],
}

function stubFetch(body: unknown, ok = true) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      calls.push(String(input))
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: ok ? 200 : 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

// -- 1. the status history, in the parent app ----------------------------------

describe('StatusHistorySection — the history a parent phones about', () => {
  it('renders the child’s own status timeline, oldest first', async () => {
    stubFetch(HISTORY)
    render(<StatusHistorySection student={student()} locale="he" />)

    const rows = await screen.findAllByTestId('parent-status-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent(t('he', 'people.status.active'))
    expect(rows[1]).toHaveTextContent(t('he', 'people.status.frozen'))
    expect(rows[2]).toHaveTextContent(t('he', 'people.status.active'))
  })

  it('reads the /me route and NEVER the staff one', async () => {
    // §3.3 — every parent read stands on `EXISTS(guardian WHERE person_id = :me)`. The
    // staff route `GET /students/{id}/status-history` is `AnyStaff`-scoped and answers a
    // guardian 403, and it returns the manager's `reason`. Ship-audit B4 is exactly this
    // mistake made once already, in `ProfileAndLeave`, and it went unnoticed for as long
    // as nothing mounted the screen.
    const calls = stubFetch(HISTORY)
    render(<StatusHistorySection student={student()} locale="he" />)
    await screen.findAllByTestId('parent-status-row')

    expect(calls.some((url) => url.includes('/api/v1/me/students/st1/status-history'))).toBe(true)
    expect(calls.some((url) => /\/api\/v1\/students\/st1\/status-history/.test(url))).toBe(false)
  })

  it('shows no money anywhere', async () => {
    // §5.5 / invariant 3, at the surface. The backing shape cannot carry a financial field;
    // this is the other half — the section must not put one there from somewhere else.
    stubFetch(HISTORY)
    render(<StatusHistorySection student={student()} locale="he" />)
    await screen.findAllByTestId('parent-status-row')
    expect(document.body.textContent ?? '').not.toContain('₪')
  })

  it('renders NOTHING when the child has no history yet', async () => {
    // A brand-new child has no moves to show. An empty card headed "היסטוריית החברות"
    // reads as a feature that is broken rather than one that has nothing to say.
    stubFetch({ items: [] })
    const { container } = render(<StatusHistorySection student={student()} locale="he" />)
    await waitFor(() => expect(container.querySelector('h2')).toBeNull())
    expect(screen.queryByTestId('parent-status-history')).toBeNull()
  })

  it('renders nothing rather than an error when the read fails', async () => {
    stubFetch({ detail: 'no' }, false)
    render(<StatusHistorySection student={student()} locale="he" />)
    await waitFor(() => expect(screen.queryByTestId('parent-status-history')).toBeNull())
  })

  it('renders no physical CSS', async () => {
    stubFetch(HISTORY)
    const { container } = render(<StatusHistorySection student={student()} locale="en" />)
    await screen.findAllByTestId('parent-status-row')
    noPhysicalCss(container)
  })
})

// -- 3a. which lesson the trial home counts down to ----------------------------

describe('nextTrialLesson — the booking TrialHome is drawn around', () => {
  const NOW = new Date('2026-09-03T09:00:00Z')

  it('is null when the family has no trial booking at all', () => {
    expect(nextTrialLesson([], NOW)).toBeNull()
  })

  it('picks the SOONEST lesson still to come', () => {
    // A family with two children on trials has two bookings. §6.3 draws one countdown, and
    // the lesson a parent is getting ready for is the next one, not the later one.
    const chosen = nextTrialLesson(
      [
        booking({ session_starts_at: '2026-09-13T14:00:00Z' }),
        booking({ student_id: 'st2', session_starts_at: '2026-09-06T14:00:00Z' }),
      ],
      NOW,
    )
    expect(chosen?.sessionStartsAt).toBe('2026-09-06T14:00:00Z')
  })

  it('falls back to the most recent lesson once every one of them has happened', () => {
    // §5.4a ④ — after the lesson the home asks "איך היה?", and that branch needs the
    // lesson that happened. Dropping to null here would send a family that HAS attended
    // back to the "nothing booked" copy.
    const chosen = nextTrialLesson(
      [
        booking({ session_starts_at: '2026-08-23T14:00:00Z', attended: false }),
        booking({ session_starts_at: '2026-08-30T14:00:00Z', attended: true }),
      ],
      NOW,
    )
    expect(chosen?.sessionStartsAt).toBe('2026-08-30T14:00:00Z')
    expect(chosen?.attended).toBe(true)
  })

  it('reports a booking with no session as a booking with no time', () => {
    // §5.4a lets a manager log a phone enquiry before a slot is chosen. That family HAS a
    // booking and has no lesson, which is exactly the fallback branch's case.
    const chosen = nextTrialLesson([booking({ session_starts_at: null })], NOW)
    expect(chosen).not.toBeNull()
    expect(chosen?.sessionStartsAt).toBeNull()
  })

  it('treats attended as three-state and never coerces null to false', () => {
    // NULL is "the lesson has not happened yet", which is not "they did not turn up".
    expect(nextTrialLesson([booking()], NOW)?.attended).toBeNull()
  })
})

// -- 3b. what the fallback says ------------------------------------------------

describe('TrialHome — the copy for a family with no lesson booked', () => {
  it('does NOT promise to call after a lesson that was never booked', () => {
    // The defect: `people.trialHome.waitingForClub` reads "המועדון יחזור אליכם אחרי
    // השיעור" — *after the lesson* — and it was the only thing this branch could say. To a
    // family whose lesson is not booked, the app is describing an event that does not exist.
    render(<TrialHome students={[student({ status: 'trial' })]} locale="he" sessionStartsAt={null} />)

    const waiting = screen.getByTestId('trial-home-waiting')
    expect(waiting).toHaveTextContent(t('he', 'people.trialHome.noLessonBooked'))
    expect(waiting.textContent).not.toBe(t('he', 'people.trialHome.waitingForClub'))
  })

  it('keeps "after the lesson" for the case it is true of — a lesson already past', () => {
    // The copy is not wrong, it was in the wrong branch. A lesson that has happened is
    // precisely when the club owes the family a call.
    render(
      <TrialHome
        students={[student({ status: 'trial' })]}
        locale="he"
        sessionStartsAt="2026-08-30T14:00:00Z"
        now={new Date('2026-09-03T09:00:00Z')}
      />,
    )
    expect(screen.getByTestId('trial-home-countdown')).toHaveTextContent(
      t('he', 'people.trialHome.waitingForClub'),
    )
  })

  it('is HANDED a lesson by Resolve, which is the half that was missing', async () => {
    // The defect was never in `TrialHome` — it has taken `sessionStartsAt` since W3.
    // `Resolve.tsx` rendered `<TrialHome students={mine.students} locale={locale} />` and
    // passed neither the time nor `attended`, so §6.3's countdown, its date line and its
    // "איך היה?" were all unreachable code in a running app. This asserts the wiring, at
    // the mount point, because that is the thing that can silently be dropped again.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        const body = url.includes('/api/v1/me/students')
          ? { items: [student({ status: 'trial' })] }
          : url.includes('/api/v1/me/trial-bookings')
            ? { items: [booking({ session_starts_at: '2126-09-06T14:00:00Z' })] }
            : { items: [] }
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }),
    )

    render(<Resolve session={trialFamily()} locale="he" />)

    // A date far enough out that this assertion cannot rot into "today" — the countdown
    // has to be reading a real instant, not falling back.
    await waitFor(() => expect(screen.getByTestId('trial-home-when')).not.toBeEmptyDOMElement())
    expect(screen.queryByTestId('trial-home-waiting')).toBeNull()
  })

  it('still says "היום" on the day of the lesson', () => {
    // The past branch must not swallow the day itself: a parent opening the app on the
    // morning of the lesson is the single most likely reader of this screen.
    render(
      <TrialHome
        students={[student({ status: 'trial' })]}
        locale="he"
        sessionStartsAt="2026-09-06T14:00:00Z"
        now={new Date('2026-09-06T05:00:00Z')}
      />,
    )
    expect(screen.getByTestId('trial-home-countdown')).toHaveTextContent(
      t('he', 'people.trialHome.today'),
    )
  })
})
