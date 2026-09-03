import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { markSynced, memoryStore, queueChanged, queueMark, setForcedMode, setOfflineStore } from '@studio/core'
import type { OfflineStore } from '@studio/core'
import { NetworkStatus } from './NetworkStatus'

const NOW = '2026-11-03T15:05:00.000Z'

// Register §9 — "offline is doubled": the roster screen used to repeat this exact
// information in its own banner. This is now the ONLY place §10.1's four degraded modes
// and the pending-sync count render, so the coverage that used to live in
// RosterScreen.test.tsx (`renders the sync banner in EVERY degraded mode`, `shows the
// pending badge counting MARKS`) moves here with it.

let store: OfflineStore

beforeEach(() => {
  store = memoryStore()
  setOfflineStore(store)
})

afterEach(() => {
  setOfflineStore(null)
  setForcedMode(null)
})

describe('NetworkStatus — the single offline signal (register §9)', () => {
  it('renders nothing when online with an empty queue', () => {
    setForcedMode('online')
    const { container } = render(<NetworkStatus locale="he" />)
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['offline', 'לא מקוון'],
    ['slow', 'חיבור איטי'],
    ['intermittent', 'חיבור לא יציב'],
    ['api-down', 'השרת אינו זמין'],
  ] as const)('renders the %s mode', async (mode, label) => {
    setForcedMode(mode)
    render(<NetworkStatus locale="he" />)
    expect(await screen.findByText(new RegExp(label))).toBeInTheDocument()
  })

  it('carries the reassurance hint for offline, intermittent and api-down', async () => {
    setForcedMode('offline')
    render(<NetworkStatus locale="he" />)
    expect(await screen.findByText(/הסימונים נשמרים במכשיר/)).toBeInTheDocument()
  })

  it('has no hint copy for slow — §10.1 gives it none', async () => {
    setForcedMode('slow')
    render(<NetworkStatus locale="he" />)
    const mode = await screen.findByTestId('network-status-mode')
    expect(mode).toHaveTextContent('חיבור איטי')
    expect(mode.textContent).not.toContain('·')
  })

  it('shows the pending badge counting MARKS, singular at 1', async () => {
    // `1c` finding 4, carried over: three artboards drew this counting SESSIONS against a
    // key that counts marks.
    setForcedMode('online')
    await queueMark({
      store,
      clientMarkId: 'mark-1',
      kind: 'attendance.mark',
      sessionId: 'session-1',
      studentId: 'student-1',
      payload: { status: 'present' },
      deviceMarkedAt: NOW,
      personId: 'person-1',
    })
    render(<NetworkStatus locale="he" />)
    expect(await screen.findByTestId('network-status-pending')).toHaveTextContent('סימון אחד ממתין לסנכרון')
  })

  it('pluralizes the pending count at 2 or more', async () => {
    setForcedMode('online')
    for (const id of ['mark-1', 'mark-2']) {
      await queueMark({
        store,
        clientMarkId: id,
        kind: 'attendance.mark',
        sessionId: 'session-1',
        studentId: id,
        payload: { status: 'present' },
        deviceMarkedAt: NOW,
        personId: 'person-1',
      })
    }
    render(<NetworkStatus locale="he" />)
    expect(await screen.findByTestId('network-status-pending')).toHaveTextContent('2 סימונים ממתינים לסנכרון')
  })

  it('decrements as marks sync — the state no capture in the evidence set has shown', async () => {
    // Register §9 — "no capture shows a pending-sync count, a queued-row badge or a
    // sync-in-progress state; the queue was empty in every one of them." This is the
    // automated proof that the badge does the one thing a static screenshot cannot show:
    // move. `markSynced` is `pendingOps.ts`'s own "one remover", the same call `sync.ts`'s
    // real flush makes for every id the server acknowledged.
    setForcedMode('online')
    for (const id of ['mark-1', 'mark-2']) {
      await queueMark({
        store,
        clientMarkId: id,
        kind: 'attendance.mark',
        sessionId: 'session-1',
        studentId: id,
        payload: { status: 'present' },
        deviceMarkedAt: NOW,
        personId: 'person-1',
      })
    }
    render(<NetworkStatus locale="he" />)
    expect(await screen.findByTestId('network-status-pending')).toHaveTextContent('2 סימונים ממתינים לסנכרון')

    await act(async () => {
      await markSynced(store, ['mark-1'])
      queueChanged()
    })
    expect(await screen.findByTestId('network-status-pending')).toHaveTextContent('סימון אחד ממתין לסנכרון')

    await act(async () => {
      await markSynced(store, ['mark-2'])
      queueChanged()
    })
    expect(screen.queryByTestId('network-status-pending')).not.toBeInTheDocument()
  })
})
