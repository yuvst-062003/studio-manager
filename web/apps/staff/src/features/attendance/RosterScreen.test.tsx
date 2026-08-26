import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearSlot } from '@studio/ui'
import {
  enqueue,
  listPending,
  memoryStore,
  queueChanged,
  setForcedMode,
  setOfflineStore,
} from '@studio/core'
import type { OfflineStore, RosterRow as RosterRowData } from '@studio/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RosterScreen } from './RosterScreen'
import type { SessionRosterOut, StaffAttendanceClient } from './client'

const NOW = '2026-11-03T15:05:00.000Z'
const SESSION = 'session-1'

const row = (overrides: Partial<RosterRowData> = {}): RosterRowData => ({
  student_id: 'student-1',
  display_name: 'דנה כהן',
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

const rosterOut = (roster: RosterRowData[]): SessionRosterOut => ({
  session: {
    id: SESSION,
    group_id: 'group-1',
    group_name: 'מתחילים',
    starts_at: '2026-11-03T15:00:00.000Z',
    ends_at: '2026-11-03T16:00:00.000Z',
    location_name: 'אולם א׳',
    status: 'scheduled',
    attendance_taken: false,
  },
  roster,
})

function makeClient(roster: RosterRowData[]): StaffAttendanceClient {
  return {
    bootstrap: vi.fn(),
    sessionRoster: vi.fn().mockResolvedValue(rosterOut(roster)),
    bulkPresent: vi.fn(),
    studentAttendance: vi.fn(),
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
  clearSlot('roster-row')
})

const renderScreen = (props: Partial<Parameters<typeof RosterScreen>[0]> = {}) =>
  render(
    <RosterScreen
      client={props.client ?? makeClient([row()])}
      clock={() => NOW}
      locale="he"
      personId="person-1"
      sessionId={SESSION}
      {...props}
    />,
  )

describe('artboards 1c and 9f — the roster screen', () => {
  it('renders the roster it fetched', async () => {
    renderScreen()
    expect(await screen.findByText('דנה כהן')).toBeInTheDocument()
  })

  it('counts present, absent and unmarked over the EXPECTED section only', async () => {
    // §5.7 — the not-expected section's "rows never count toward `לא סומן`". A twice-weekly
    // student who is not due today has not missed anything, and counting them would make
    // every roster read as permanently incomplete.
    renderScreen({
      client: makeClient([
        row({ student_id: 'a', status: 'present' }),
        row({ student_id: 'b', status: 'absent_unexcused' }),
        row({ student_id: 'c', status: 'unmarked' }),
        row({ student_id: 'd', status: 'unmarked' }),
      ]),
      notExpectedIds: ['d'],
    })
    const counts = await screen.findByTestId('roster-counts')
    expect(counts.querySelector('[data-count="present"]')?.textContent).toContain('1')
    expect(counts.querySelector('[data-count="absent"]')?.textContent).toContain('1')
    expect(counts.querySelector('[data-count="unmarked"]')?.textContent).toContain('1')
  })

  it('puts a not-expected student in a collapsed section that is still markable', async () => {
    // §5.7 — "Students enrolled in the group but not expected today sit in a separate
    // collapsed section beneath it, `לא אמורים להגיע היום`, and can still be marked — a child
    // who turns up on an extra day is a real child."
    renderScreen({
      client: makeClient([row({ student_id: 'a' }), row({ student_id: 'd', display_name: 'רון' })]),
      notExpectedIds: ['d'],
    })
    const section = await screen.findByTestId('roster-not-expected')
    expect(section.tagName).toBe('DETAILS')
    expect(section.hasAttribute('open')).toBe(false)
    expect(screen.getByTestId('roster-row-d')).toBeEnabled()
  })

  it('queues a mark rather than calling the API', async () => {
    // §10.3 item 1 — "the local write is not an API call". The screen has ONE path, and
    // this is it: a branch on `mode === 'online'` would give the offline path an exerciser
    // of exactly zero until a coach reached a basement.
    const client = makeClient([row()])
    renderScreen({ client })
    await userEvent.click(await screen.findByTestId('roster-row-student-1'))

    await waitFor(async () => expect(await listPending(store)).toHaveLength(1))
    const [op] = await listPending(store)
    expect(op?.payload).toEqual({ status: 'present' })
    expect(op?.session_id).toBe(SESSION)
  })

  it('queues a mark while the network is offline, with no error', async () => {
    setForcedMode('offline')
    renderScreen()
    await userEvent.click(await screen.findByTestId('roster-row-student-1'))
    await waitFor(async () => expect(await listPending(store)).toHaveLength(1))
  })

  it('leaves ONE queued op when a coach cycles the same row three times', async () => {
    // §10.5's idempotency starts on the device. Three ops for one child is three answers
    // the server has to reconcile, and the last one to arrive is not necessarily the last
    // one tapped.
    renderScreen()
    const target = await screen.findByTestId('roster-row-student-1')
    await userEvent.click(target)
    await userEvent.click(target)
    await userEvent.click(target)
    await waitFor(async () => expect(await listPending(store)).toHaveLength(1))
  })

  it('updates the row optimistically on tap', async () => {
    // §5.7 — "Marks are written to the local store first and **the UI updates
    // immediately**." A roster that waited for a server would be unusable at 17:00 in a
    // basement, which is every session.
    renderScreen()
    const target = await screen.findByTestId('roster-row-student-1')
    await userEvent.click(target)
    expect(screen.getByTestId('roster-row-student-1')).toHaveAttribute('data-status', 'present')
  })

  it('renders the sync banner in EVERY degraded mode, not only offline', async () => {
    // `9f` finding 2 — the later artboard lost `1c`'s offline, sync and staleness
    // indicators, on the one screen a coach uses in a basement. §10.1 has four states, and
    // a coach on a captive portal told `מחובר` stops trusting the indicator entirely.
    setForcedMode('intermittent')
    renderScreen()
    expect(await screen.findByText(/חיבור לא יציב/)).toBeInTheDocument()
  })

  it('renders no sync banner when the network is fine', async () => {
    setForcedMode('online')
    renderScreen()
    await screen.findByText('דנה כהן')
    expect(screen.queryByText(/לא מקוון/)).not.toBeInTheDocument()
  })

  it('shows the pending badge counting MARKS, which is what the key interpolates', async () => {
    // `1c` finding 4 — three artboards drew this counting SESSIONS against a key that
    // counts marks. The copy that ships is what has to become true.
    renderScreen()
    await userEvent.click(await screen.findByTestId('roster-row-student-1'))
    expect(await screen.findByTestId('roster-pending')).toHaveTextContent('1')
  })
})

describe('§5.7 — the bulk rule, and the artboard that gets it wrong', () => {
  it('marks every unmarked expected student present', async () => {
    renderScreen({
      client: makeClient([row({ student_id: 'a' }), row({ student_id: 'b' })]),
    })
    await screen.findByTestId('roster-list')
    await userEvent.click(screen.getByRole('button', { name: /סימון כולם כנוכחים/ }))
    expect(screen.getByTestId('roster-row-a')).toHaveAttribute('data-status', 'present')
    expect(screen.getByTestId('roster-row-b')).toHaveAttribute('data-status', 'present')
  })

  it('does NOT overwrite a parent s advance notice', async () => {
    // `9f` finding 1, the correctness bug on that artboard: as drawn the button sets every
    // row present unconditionally, one row below a hint announcing those very notices.
    // §10.5 protects them regardless of timestamp, and the optimistic update has to agree
    // with the server or the screen lies for a second and then corrects itself.
    renderScreen({
      client: makeClient([
        row({ student_id: 'a' }),
        row({
          student_id: 'b',
          status: 'absent_excused',
          source: 'parent',
          has_absence_report: true,
        }),
      ]),
    })
    await screen.findByTestId('roster-list')
    await userEvent.click(screen.getByRole('button', { name: /סימון כולם כנוכחים/ }))
    expect(screen.getByTestId('roster-row-b')).toHaveAttribute('data-status', 'absent_excused')
  })

  it('does not touch a mark a coach already set', async () => {
    renderScreen({
      client: makeClient([row({ student_id: 'a', status: 'absent_unexcused', source: 'coach' })]),
    })
    await screen.findByTestId('roster-list')
    await userEvent.click(screen.getByRole('button', { name: /סימון כולם כנוכחים/ }))
    expect(screen.getByTestId('roster-row-a')).toHaveAttribute('data-status', 'absent_unexcused')
  })

  it('never touches the not-expected section', async () => {
    renderScreen({
      client: makeClient([row({ student_id: 'a' }), row({ student_id: 'd' })]),
      notExpectedIds: ['d'],
    })
    await screen.findByTestId('roster-list')
    await userEvent.click(screen.getByRole('button', { name: /סימון כולם כנוכחים/ }))
    expect(screen.getByTestId('roster-row-d')).toHaveAttribute('data-status', 'unmarked')
  })

  it('queues the bulk action rather than calling the API', async () => {
    renderScreen()
    await screen.findByTestId('roster-list')
    await userEvent.click(screen.getByRole('button', { name: /סימון כולם כנוכחים/ }))
    await waitFor(async () => {
      const ops = await listPending(store)
      expect(ops.map((op) => op.kind)).toContain('attendance.bulk')
    })
  })

  it('says on the button itself that it will not overwrite a parent report', async () => {
    // `9f` finding 1 — "the button's own copy should say so", unconditionally. A coach
    // decides whether to tap before knowing whether anybody reported, and a reassurance
    // that appears only sometimes is one nobody learns to rely on.
    renderScreen()
    expect(await screen.findByTestId('roster-bulk-hint')).toHaveTextContent(
      'לא ידרוס דיווחי הורים או סימונים קיימים',
    )
  })

  it('shows the advance-notice hint when a parent has reported', async () => {
    // `9f` adds this row and its claim — that pre-reported students are handled — is only
    // true because the button below skips them.
    renderScreen({
      client: makeClient([
        row({ student_id: 'b', status: 'absent_excused', has_absence_report: true }),
      ]),
    })
    expect(await screen.findByText(/סימון קבוצתי לא ידרוס/)).toBeInTheDocument()
  })
})

describe('§5.5 — the roster is never blocked', () => {
  it('renders and marks a student whose declaration is missing', async () => {
    renderScreen({ client: makeClient([row({ health_status: 'missing' })]) })
    const target = await screen.findByTestId('roster-row-student-1')
    expect(target).toBeEnabled()
    await userEvent.click(target)
    expect(target).toHaveAttribute('data-status', 'present')
  })
})

describe('offline behaviour', () => {
  it('renders rather than erroring when the roster fetch fails', async () => {
    // Offline is not an error state on this screen. The cached roster is what draws, and
    // `mode` already tells the coach why nothing refreshed.
    const client = makeClient([])
    client.sessionRoster = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    renderScreen({ client })
    expect(await screen.findByTestId('roster-screen')).toBeInTheDocument()
  })

  it('tells the coach attendance can be corrected at any time', async () => {
    // `9f`'s footer helper line. The reassuring half of the copy is what makes a coach
    // willing to mark quickly rather than carefully in front of thirty children.
    renderScreen()
    expect(await screen.findByTestId('roster-edit-anytime')).toBeInTheDocument()
  })
})

describe('§6.5 — the blocking stale-queue warning', () => {
  it('replaces the roster when unsynced work has outlived a session', async () => {
    // §6.5 — "shows a **blocking** warning when unsynced work has been queued for more than
    // one session." Blocking rather than advisory, because §6.5 traded the storage guarantee
    // away deliberately and a banner a coach scrolls past is noticing the trade rather than
    // managing it. The roster is gone until the device reaches signal.
    await enqueue(store, {
      client_mark_id: 'old',
      kind: 'attendance.mark',
      session_id: SESSION,
      student_id: 'student-1',
      payload: { status: 'present' },
      device_marked_at: '2026-11-01T17:00:00.000Z',
      queued_at: '2026-11-01T17:00:00.000Z',
      person_id: 'person-1',
      attempts: 0,
    })
    queueChanged()
    renderScreen()
    expect(await screen.findByTestId('roster-stale-block')).toBeInTheDocument()
    expect(screen.queryByTestId('roster-screen')).not.toBeInTheDocument()
  })

  it('does not block on work queued minutes ago', async () => {
    // A coach mid-lesson has unsynced work by design. A warning that fires on the normal
    // case is a warning nobody reads by the end of the first week.
    await enqueue(store, {
      client_mark_id: 'fresh',
      kind: 'attendance.mark',
      session_id: SESSION,
      student_id: 'student-1',
      payload: { status: 'present' },
      device_marked_at: '2026-11-03T15:00:00.000Z',
      queued_at: '2026-11-03T15:00:00.000Z',
      person_id: 'person-1',
      attempts: 0,
    })
    queueChanged()
    renderScreen()
    expect(await screen.findByTestId('roster-screen')).toBeInTheDocument()
  })

  it('names the number of marks at risk', async () => {
    await enqueue(store, {
      client_mark_id: 'old',
      kind: 'attendance.mark',
      session_id: SESSION,
      student_id: 'student-1',
      payload: { status: 'present' },
      device_marked_at: '2026-11-01T17:00:00.000Z',
      queued_at: '2026-11-01T17:00:00.000Z',
      person_id: 'person-1',
      attempts: 0,
    })
    queueChanged()
    renderScreen()
    expect(await screen.findByTestId('roster-stale-count')).toHaveTextContent('1')
  })
})
