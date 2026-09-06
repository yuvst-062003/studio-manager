// §6.1's parent first-launch branch.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { studioDayKey } from '@studio/core'
import { t } from '@studio/i18n'
import { Resolve } from './Resolve'
import type { Session } from '@studio/core'

function studio(id: string, name: string) {
  return {
    studio_id: id,
    studio_name: name,
    studio_is_demo: false,
    person_id: `p-${id}`,
    roles: [] as string[],
    is_guardian: true,
  }
}

function session(over: Partial<Session> = {}): Session {
  return {
    status: 'signed-in',
    access: { staff: false, parent: true },
    studios: [studio('a', 'מועדון א')],
    activeStudioId: 'a',
    devTools: false,
    isPlatformAdmin: false,
    actingAsPersonId: null,
    actingAsLabel: null,
    activeStudioName: 'מועדון א',
    reload: vi.fn(),
    signOut: vi.fn(),
    ...over,
  } as Session
}

// §6.1 step 3's refusal (and the invitation-link race in front of it) moved to
// `AccessGate` (2026-09-02) — `AccessGate.test.tsx` carries the tests that used to live
// here. `Resolve` is only ever mounted once `AccessGate` has already confirmed
// `session.access.parent`, so every session built by the `session()` helper below
// defaults to that.
describe('Resolve', () => {
  it('shows the studio picker to a guardian at more than one studio', async () => {
    // §6.1 step 4 — 'only shown if she belongs to more than one studio'.
    render(
      <Resolve
        session={session({
          studios: [studio('a', 'מועדון א'), studio('b', 'מועדון ב')],
          activeStudioId: null,
        })}
        locale="he"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('studio-picker')).toBeInTheDocument())
  })

  it('skips the picker for a guardian at one studio', () => {
    render(<Resolve session={session()} locale="he" />)
    expect(screen.queryByTestId('studio-picker')).toBeNull()
    expect(screen.getByTestId('parent-home')).toBeInTheDocument()
  })

  it('activates the one studio rather than rendering a home that reads nothing', async () => {
    // A session with memberships but no active studio has no tenant scope, so EVERY
    // tenant-scoped route answers 401 -- and the picker below is skipped at one studio,
    // so this fell straight through to a home whose every read failed, in silence. The
    // server no longer mints such a session (identity.py's `_build_session` activates a
    // sole membership), and this is the screen's own answer if one ever reaches it: with
    // exactly one club there is no choice to offer, so it is chosen.
    // Shaped bodies: the home's own reads run alongside the switch, and a bare `{}` for
    // `/me/students` crashes the trial check on an undefined list — a fixture fault, not
    // a product one.
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{"items":[]}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const s = session({ activeStudioId: null })
    render(<Resolve session={s} locale="he" />)

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/switch-studio')),
      ).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/auth/switch-studio'),
    )!
    expect(String(call[1]?.body)).toContain('"a"')
    await waitFor(() => expect(s.reload).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })
})

// -- §4: "events appear beside every other session" ---------------------------
/**
 * THE SEAM, not the component. `expandEvents` is tested against hand-built rows in
 * `derive.test.ts`; this asserts the mapping that CARRIES them — `GET /me/events` → state
 * → the card — because a field renamed on either side of that map is invisible to a test
 * that constructs the props by hand, and the project's own register records a hard gate
 * shipped never firing for exactly that reason.
 */
describe('events on the home screen', () => {
  // Midday TODAY in the studio's zone. The home opens on today, and an event dated in the
  // fixture's past would be filtered out by the day picker rather than by anything this
  // test is about — a green test that proves nothing.
  const TODAY_MIDDAY = `${studioDayKey(new Date())}T09:00:00Z`

  const EVENT_BODY = {
    items: [
      {
        event: {
          id: 'e1',
          title: 'אליפות המחוז',
          starts_at: TODAY_MIDDAY,
          ends_at: null,
          location_text: 'היכל הספורט, נתניה',
          status: 'published',
        },
        registration: {
          student_id: 'st1',
          student_display_name: 'נועה כהן',
          rsvp: 'pending',
        },
      },
    ],
  }

  function stubReads() {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async (input) => {
        const url = String(input)
        if (url.includes('/me/events')) {
          return new Response(JSON.stringify(EVENT_BODY), { status: 200 })
        }
        if (url.includes('/me/students')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'st1',
                  person_id: 'p1',
                  first_name: 'נועה',
                  last_name: 'כהן',
                  status: 'active',
                  group_names: ['מתחילים'],
                  current_belt_color_hex: '#f59e0b',
                  current_belt_name: 'צהובה',
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response('{"items":[]}', { status: 200 })
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('reads /me/events and puts the event in the day it falls on', async () => {
    stubReads()
    render(<Resolve session={session()} locale="he" />)

    // The card is keyed by the EVENT's id and the child's, the same shape a lesson card
    // uses — one row per child per event, which is what the endpoint already returns.
    const card = await screen.findByTestId('home-session-e1-st1')
    expect(card).toHaveTextContent('אליפות המחוז')
    expect(card).toHaveTextContent('נועה כהן')
    expect(card).toHaveTextContent('היכל הספורט, נתניה')
    vi.unstubAllGlobals()
  })

  it('offers an RSVP and NOT the absence button', async () => {
    // A lesson asks "נעדר/ת?" and writes an absence report; an event is declined by RSVP,
    // in a different table. An absence button here would POST an event id to
    // `/absence-reports` — a 404 the parent could do nothing about.
    stubReads()
    render(<Resolve session={session()} locale="he" />)

    await screen.findByTestId('home-session-e1-st1')
    expect(screen.getByTestId('home-event-rsvp-e1-st1')).toHaveAttribute('href', '#/events')
    expect(screen.queryByTestId('home-absence-e1')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('says the family has not answered rather than showing "pending" as a choice', async () => {
    stubReads()
    render(<Resolve session={session()} locale="he" />)
    await screen.findByTestId('home-session-e1-st1')
    expect(screen.getByTestId('home-event-rsvp-e1-st1')).toHaveTextContent(
      t('he', 'schedule.home.eventPending'),
    )
    vi.unstubAllGlobals()
  })

  it('leaves events out of the whole-day absence batch', async () => {
    // The batch POSTs one `/absence-reports` per target. An event swept in would send an
    // EVENT id to that endpoint and come back failed, and the sheet would report a failure
    // the parent could do nothing about.
    stubReads()
    render(<Resolve session={session()} locale="he" />)
    await screen.findByTestId('home-session-e1-st1')

    // The whole-day report lives on the month calendar's day card, which is where FLOW A2
    // put it — the home's own floating button goes to `#/absence` instead.
    await userEvent.click(screen.getByTestId('home-open-month'))
    await screen.findByTestId('home-month-modal')
    await userEvent.click(screen.getByTestId('month-report-day'))
    const sheet = await screen.findByTestId('home-day-absence-sheet')
    // The day has exactly one row on it and it is the event, so the batch has nothing to
    // send — which the sheet says rather than offering a button that would write nothing.
    expect(sheet).toHaveTextContent(t('he', 'attendance.dayAbsence.nothingToReport'))
    expect(sheet).not.toHaveTextContent('אליפות המחוז')
    vi.unstubAllGlobals()
  })

  it('draws a home without events when the events read fails, and keeps the lessons', async () => {
    // An unreachable events read must not take the schedule down with it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/me/events')
          ? new Response('nope', { status: 500 })
          : new Response('{"items":[]}', { status: 200 }),
      ),
    )
    render(<Resolve session={session()} locale="he" />)
    await waitFor(() => expect(screen.getByTestId('parent-home')).toBeInTheDocument())
    expect(screen.queryByTestId('home-session-e1-st1')).toBeNull()
    vi.unstubAllGlobals()
  })
})

// -- FLOW B's seam: a range → `GET /sessions` → N writes ----------------------
/**
 * `RangeAbsenceSheet.test.tsx` covers what the sheet refuses. This covers the half that
 * only exists once it is wired: that the range the parent picked is the range ASKED FOR,
 * and that every lesson it names becomes its own `POST /absence-reports`.
 *
 * The home holds two weeks. Before this, the floating button went to `#/absence` — one
 * report, one child, one session — so a fortnight away was thirty trips through a form.
 */
describe('reporting an absence over a date range', () => {
  const TODAY = studioDayKey(new Date())

  function stub(overrides: { sessionsStatus?: number } = {}) {
    const posted: string[] = []
    const asked: string[] = []
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async (input, init) => {
        const url = String(input)
        if (url.includes('/absence-reports')) {
          posted.push(String(init?.body))
          return new Response('{}', { status: 201 })
        }
        if (url.includes('/sessions')) {
          asked.push(url)
          if (overrides.sessionsStatus) return new Response('nope', { status: overrides.sessionsStatus })
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 's1',
                  group_name: 'מתחילים',
                  starts_at: `${TODAY}T15:00:00Z`,
                  ends_at: `${TODAY}T16:00:00Z`,
                  location_name: null,
                  staff: [],
                  status: 'scheduled',
                  cancel_reason: null,
                },
              ],
              next_cursor: null,
              has_more: false,
            }),
            { status: 200 },
          )
        }
        if (url.includes('/me/students')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'st1',
                  person_id: 'p1',
                  first_name: 'נועה',
                  last_name: 'כהן',
                  status: 'active',
                  group_names: ['מתחילים'],
                  current_belt_color_hex: '#f59e0b',
                  current_belt_name: 'צהובה',
                },
                // A sibling in a group the stub NEVER returns a lesson for. She is how the
                // "range named nothing" case is reached without an empty child list, which
                // the sheet refuses for its own reason.
                {
                  id: 'st2',
                  person_id: 'p2',
                  first_name: 'דנה',
                  last_name: 'כהן',
                  status: 'active',
                  group_names: ['מתקדמים'],
                  current_belt_color_hex: '#10b981',
                  current_belt_name: 'ירוקה',
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response('{"items":[]}', { status: 200 })
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    return { posted, asked }
  }

  async function openTheSheet() {
    render(<Resolve session={session()} locale="he" />)
    await waitFor(() => expect(screen.getByTestId('home-fab')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('home-fab'))
    return screen.findByTestId('home-range-absence-sheet')
  }

  it('asks the server for the range the parent picked, then writes one report per lesson', async () => {
    const { posted, asked } = stub()
    await openTheSheet()
    await userEvent.click(screen.getByTestId('range-absence-preset-week'))
    await userEvent.click(screen.getByTestId('range-absence-submit'))

    // The RANGE, and not the two weeks the home already had — that window is what made a
    // month-long holiday report nothing at all.
    await waitFor(() => expect(asked.some((url) => url.includes(`from=${TODAY}`))).toBe(true))
    await waitFor(() => expect(posted).toHaveLength(1))
    // Hebrew on the wire whatever the parent is reading: a coach reads this on the mat.
    expect(posted[0]).toContain(t('he', 'attendance.reason.vacation.label'))
    await screen.findByTestId('home-range-absence-results')
    vi.unstubAllGlobals()
  })

  it('says the range named nothing rather than reporting a success over zero writes', async () => {
    const { posted } = stub()
    await openTheSheet()
    // Only דנה, who trains 'מתקדמים' — a group the stub never returns a lesson for. The
    // range therefore resolves to nothing, and the batch is per (session, CHILD).
    await userEvent.click(screen.getByTestId('range-absence-toggle-all'))
    await userEvent.click(screen.getByTestId('range-absence-child-st2'))
    await userEvent.click(screen.getByTestId('range-absence-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('range-absence-notice')).toHaveTextContent(
        t('he', 'attendance.rangeAbsence.nothingInRange'),
      ),
    )
    // Nothing written. A parent told "הדיווח נשלח" over zero writes believes the club knows.
    expect(posted).toHaveLength(0)
    vi.unstubAllGlobals()
  })

  it('says the read failed rather than writing into a range it could not see', async () => {
    const { posted } = stub({ sessionsStatus: 500 })
    await openTheSheet()
    await userEvent.click(screen.getByTestId('range-absence-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('range-absence-notice')).toHaveTextContent(
        t('he', 'attendance.rangeAbsence.rangeReadFailed'),
      ),
    )
    expect(posted).toHaveLength(0)
    vi.unstubAllGlobals()
  })
})
