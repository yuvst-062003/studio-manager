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
