// The three slots this lane FILLS, as opposed to the one it builds.
//
// Plan §1.3 seam 4: "A lane adds one file that calls registerSlot() at module load, plus one
// line in its own feature barrel; the container file is never reopened." These tests are
// what prove that claim rather than restating it — each asserts that the registration lands
// in a container this lane does not own, and that nothing here reopened it.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearSlot, useSlot } from '@studio/ui'
import { enqueue, memoryStore, queueChanged, setForcedMode, setOfflineStore } from '@studio/core'
import type { OfflineStore } from '@studio/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerAttendanceSections } from './index'

let store: OfflineStore

beforeEach(() => {
  store = memoryStore()
  setOfflineStore(store)
})

afterEach(() => {
  clearSlot('student-card')
  clearSlot('alert-centre')
  clearSlot('dev-bar')
  setOfflineStore(null)
  setForcedMode(null)
})

describe('the slots this lane fills', () => {
  it('registers into student-card, alert-centre and dev-bar and into nothing else', () => {
    registerAttendanceSections()
    expect(useSlot('student-card').map((e) => e.key)).toEqual(['attendance-strip'])
    expect(useSlot('alert-centre').map((e) => e.key)).toEqual(['attendance-conflicts'])
    expect(useSlot('dev-bar').map((e) => e.key)).toEqual(['offline', 'slow'])
    // The one container this lane BUILDS. Registering into it here would mean the roster
    // renders a section of its own through the same door M4 uses, which is a claim on a
    // slot M4 is about to fill.
    expect(useSlot('roster-row')).toEqual([])
  })

  it('registers the dev tools at the orders the dev bar already assigned them', () => {
    // §19.4's layout order is `[📴 offline] [🐌 slow] [⏩ +1 month] [↺ reset]`, and
    // `dev-bar/tools.ts` fixed offline=10 and slow=20 back in M0.4. Registering under those
    // exact KEYS is also what makes `PENDING_TOOLS` erase its own `pending in M5`
    // placeholders — the container consults it "only for keys nothing has registered".
    registerAttendanceSections()
    const entries = useSlot('dev-bar')
    expect(entries.map((e) => [e.key, e.order])).toEqual([
      ['offline', 10],
      ['slow', 20],
    ])
  })

  it('is idempotent, so a second call does not double a section', () => {
    registerAttendanceSections()
    registerAttendanceSections()
    expect(useSlot('student-card')).toHaveLength(1)
    expect(useSlot('dev-bar')).toHaveLength(2)
  })

  it('puts the conflict cards ahead of M3 s alerts', () => {
    // §10.5's cards are unsynced work a human has to decide about. A trial booking can wait
    // an hour; a coach's lost register cannot.
    registerAttendanceSections()
    expect(useSlot('alert-centre')[0]?.order).toBeLessThan(10)
  })
})

describe('the dev-bar toggles', () => {
  it('forces the client into the offline path and back', async () => {
    // §19.5 wants the dev bar to exercise the REAL code path. Forcing the mode leaves every
    // transition, every queue write and every flush where they are — monkey-patching fetch
    // would make the app genuinely offline instead, so a bug in the state machine would be
    // invisible because no probe ever ran.
    registerAttendanceSections()
    const Offline = useSlot<{ locale: 'he' }>('dev-bar')[0]?.render
    if (Offline === undefined) throw new Error('the offline tool did not register')
    render(<Offline locale="he" />)

    const button = screen.getByTestId('dev-tool-offline')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')

    // A toggle, not a switch: pressing the pressed one hands control back to the probes.
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('the alert-centre conflict cards', () => {
  it('renders nothing when there is no conflict', () => {
    registerAttendanceSections()
    const Section = useSlot<{ locale: 'he' }>('alert-centre')[0]?.render
    if (Section === undefined) throw new Error('the conflict section did not register')
    const { container } = render(<Section locale="he" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a card per §10.5 conflict, and dismissing keeps the work', async () => {
    // §10.5 — "Rejected operations become dismissible conflict cards; nothing is silently
    // dropped." Dismissal hides the card; the ops it concerns are untouched, which is why
    // the queue is asserted after the click.
    await enqueue(store, {
      client_mark_id: 'mark-1',
      kind: 'attendance.mark',
      session_id: 'session-1',
      student_id: 'student-1',
      payload: { status: 'present' },
      device_marked_at: '2026-11-03T17:00:00.000Z',
      queued_at: '2026-11-03T17:00:00.000Z',
      person_id: 'someone-else',
      attempts: 0,
    })
    await store.put('conflicts', 'different_person|-', {
      id: 'different_person|-',
      kind: 'different_person',
      session_id: null,
      count: 1,
      raised_at: '2026-11-03T19:00:00.000Z',
      dismissed: false,
    })
    queueChanged()

    registerAttendanceSections()
    const Section = useSlot<{ locale: 'he' }>('alert-centre')[0]?.render
    if (Section === undefined) throw new Error('the conflict section did not register')
    render(<Section locale="he" />)

    const card = await screen.findByTestId('conflict-different_person|-')
    expect(card).toHaveAttribute('data-conflict', 'different_person')
    // `1c`'s copy interpolates the count; the number is what tells a manager whether this is
    // one child or a whole lesson.
    expect(screen.getByTestId('conflict-count-different_person|-')).toHaveTextContent('1')

    await userEvent.click(screen.getByRole('button'))
    expect(await store.all('pending_ops')).toHaveLength(1)
  })
})
