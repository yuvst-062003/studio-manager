import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryStore, setForcedMode, setOfflineStore, listPending } from '@studio/core'
import type { OfflineStore } from '@studio/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AbsenceScreen } from './AbsenceScreen'
import { AbsenceRefused, countdown } from './client'
import type { AbsenceClient } from './client'

const NOW = '2026-11-03T08:00:00.000Z'
const CHILDREN = [{ id: 'student-1', display_name: 'נועה לוי' }]

function makeClient(overrides: Partial<AbsenceClient> = {}): AbsenceClient {
  return {
    upcoming: vi.fn().mockResolvedValue([
      {
        id: 'session-1',
        group_name: 'מתחילים',
        starts_at: '2026-11-03T17:00:00.000Z',
        location_name: 'אולם א׳',
      },
    ]),
    report: vi.fn().mockResolvedValue({
      id: 'report-1',
      student_id: 'student-1',
      session_id: 'session-1',
      reported_by_person_id: 'person-1',
      reason: null,
      created_at: NOW,
    }),
    cancel: vi.fn(),
    ...overrides,
  }
}

let store: OfflineStore

beforeEach(() => {
  store = memoryStore()
  setOfflineStore(store)
  document.documentElement.dir = 'rtl'
})

afterEach(() => {
  setOfflineStore(null)
  setForcedMode(null)
})

const renderScreen = (client: AbsenceClient = makeClient()) =>
  render(
    <AbsenceScreen
      children={CHILDREN}
      client={client}
      clock={() => NOW}
      locale="he"
    />,
  )

describe('§10.2 — a pre-report requires a connection on purpose', () => {
  it('says so, in the words the namespace already carries', async () => {
    // `12a` finding 1 — "The one screen that must show an offline state does not draw it."
    // `attendance.absence.requiresConnection` and `.requiresConnectionHint` exist precisely
    // for this, and until now nothing used them.
    setForcedMode('offline')
    renderScreen()
    expect(await screen.findByText('דיווח היעדרות דורש חיבור לאינטרנט')).toBeInTheDocument()
  })

  it('disables the submit rather than queuing into the void', async () => {
    setForcedMode('offline')
    renderScreen()
    expect(await screen.findByRole('button', { name: /שליחת הדיווח/ })).toBeDisabled()
  })

  it('writes NOTHING to pending_ops when the network is down', async () => {
    // The point of §10.2, asserted where it can actually be broken. Every other write in
    // this product queues; the temptation to make this one consistent with them is exactly
    // what the rule exists to resist — a pre-report that syncs after the lesson is not a
    // pre-report.
    setForcedMode('offline')
    const client = makeClient({
      report: vi.fn().mockRejectedValue(new AbsenceRefused('offline')),
    })
    renderScreen(client)
    await screen.findByTestId('absence-screen')
    expect(await listPending(store)).toHaveLength(0)
  })

  it('refuses on a slow connection too, not only on a dead one', async () => {
    // §10.1 — `slow` is the offline path. A six-second write on a time-critical form is a
    // write this screen must not pretend succeeded.
    setForcedMode('slow')
    renderScreen()
    expect(await screen.findByRole('button', { name: /שליחת הדיווח/ })).toBeDisabled()
  })

  it('refuses on an intermittent connection, which navigator.onLine calls online', async () => {
    setForcedMode('intermittent')
    renderScreen()
    expect(await screen.findByRole('button', { name: /שליחת הדיווח/ })).toBeDisabled()
  })

  it('still fills the picker from the cache while offline', async () => {
    // §10.2's table gives the parent app a READ-ONLY cache of upcoming sessions. The picker
    // works in a lift; only the submit does not, and that distinction is the whole screen.
    setForcedMode('offline')
    renderScreen()
    expect(await screen.findByLabelText(/מתחילים/)).toBeInTheDocument()
  })
})

describe('the deadline and the duplicate', () => {
  it('renders tooLate from the SERVER s code, not the device s clock', async () => {
    // §10.2's deadline is enforced server-side because a phone an hour behind would
    // otherwise let a parent file a pre-report for a lesson already in progress. The screen
    // renders whichever key the code names.
    setForcedMode('online')
    renderScreen(makeClient({ report: vi.fn().mockRejectedValue(new AbsenceRefused('too_late')) }))
    await userEvent.click(await screen.findByRole('button', { name: /שליחת הדיווח/ }))
    expect(await screen.findByText('השיעור כבר התחיל')).toBeInTheDocument()
  })

  it('renders alreadyReported for a second report on the same lesson', async () => {
    setForcedMode('online')
    renderScreen(
      makeClient({ report: vi.fn().mockRejectedValue(new AbsenceRefused('already_reported')) }),
    )
    await userEvent.click(await screen.findByRole('button', { name: /שליחת הדיווח/ }))
    expect(await screen.findByText('כבר דיווחתם על השיעור הזה')).toBeInTheDocument()
  })

  it('confirms a successful report', async () => {
    setForcedMode('online')
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: /שליחת הדיווח/ }))
    expect(await screen.findByTestId('absence-submitted')).toBeInTheDocument()
  })

  it('sends the chosen child and lesson', async () => {
    setForcedMode('online')
    const client = makeClient()
    renderScreen(client)
    await userEvent.click(await screen.findByRole('button', { name: /שליחת הדיווח/ }))
    expect(client.report).toHaveBeenCalledWith({
      studentId: 'student-1',
      sessionId: 'session-1',
      reason: '',
    })
  })
})

describe('what the screen does NOT say', () => {
  it('states no billing policy', async () => {
    // `12a` finding 3 — the artboard's disclaimer ends `אין החזר על שיעור שהוחמץ`, a billing
    // policy on an attendance screen with no key and no §5.10 line. §5.7 is explicit that
    // absences have no financial consequence at all: "the monthly fee buys the slot, not the
    // sessions". Rendering it would state a rule the product does not have.
    setForcedMode('online')
    renderScreen()
    await screen.findByTestId('absence-screen')
    expect(screen.queryByText(/החזר/)).not.toBeInTheDocument()
  })

  it('tells the parent what the coach will see', async () => {
    setForcedMode('online')
    renderScreen()
    expect(await screen.findByTestId('absence-disclaimer')).toHaveTextContent(
      'ההורה דיווח מראש. סימון קבוצתי לא ידרוס את הדיווח',
    )
  })
})

describe('the countdown', () => {
  it('reads in hours when the lesson is hours away', () => {
    // `12a` finding 5 — "the countdown needs a relative-time formatter, with plurals. Third
    // artboard needing one." `Intl.RelativeTimeFormat` pluralises in all three locales, so
    // no Hebrew is inlined in a component (G4).
    expect(countdown(NOW, '2026-11-03T17:00:00.000Z', 'he')).toContain('9')
  })

  it('reads in minutes when it is imminent', () => {
    expect(countdown(NOW, '2026-11-03T08:30:00.000Z', 'he')).toContain('30')
  })

  it('reads in days when it is next week', () => {
    expect(countdown(NOW, '2026-11-06T08:00:00.000Z', 'he')).toContain('3')
  })

  it('formats in the caller s locale', () => {
    expect(countdown(NOW, '2026-11-03T17:00:00.000Z', 'en')).toMatch(/hour/)
  })
})
