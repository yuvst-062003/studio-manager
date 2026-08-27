// S5 — the offline machinery, made VISIBLE. §6.1's walk, end to end:
//
//   the coach goes offline → the shell says so
//   a mark is taken        → the pending count says so
//   the network returns    → the queue flushes
//   the server disagrees   → a conflict card appears here, in this app, and is dismissible
//
// Every mechanism below existed before S5 and every visible trace of it did not:
// `usePendingCount` had one consumer on an unreachable screen, and `ConflictSection`
// registered into a container only the dashboard mounts.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import {
  flush,
  memoryStore,
  pendingCount,
  queueChanged,
  queueMark,
  setForcedMode,
  setOfflineStore,
} from '@studio/core'
import type { OfflineStore } from '@studio/core'
import { NetworkStatus } from './NetworkStatus'
import { ConflictSection } from './features/attendance/ConflictSection'

const NOW = '2026-11-03T18:00:00.000Z'
const ME = 'person-me'

let store: OfflineStore

beforeEach(() => {
  store = memoryStore()
  setOfflineStore(store)
})

afterEach(() => {
  setForcedMode(null)
  setOfflineStore(null)
  vi.unstubAllGlobals()
})

async function markOne(clientMarkId = 'mark-1'): Promise<void> {
  await queueMark({
    clientMarkId,
    kind: 'attendance.mark',
    sessionId: 'session-1',
    studentId: 'student-1',
    payload: { status: 'present' },
    deviceMarkedAt: NOW,
    personId: ME,
    store,
  })
}

describe('S5 — offline → queue → reconnect → flush → conflict', () => {
  it('walks the whole path, visibly at every step', async () => {
    // The probe loop `useNetworkMonitor` starts would fetch its ping; the forced mode
    // answers before any probe runs, but jsdom still wants a fetch to exist.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    render(
      <>
        <NetworkStatus locale="he" />
        <ConflictSection locale="he" />
      </>,
    )

    // Online with an empty queue: the strip has nothing to say and says nothing.
    expect(screen.queryByTestId('network-status')).toBeNull()

    // The basement. §10.1's vocabulary, not a bare boolean.
    setForcedMode('offline')
    expect(await screen.findByTestId('network-status-mode')).toHaveTextContent(
      t('he', 'attendance.network.offline'),
    )

    // A mark taken offline lands in pending_ops and the badge counts it.
    await markOne()
    queueChanged()
    expect(await screen.findByTestId('network-status-pending')).toHaveTextContent('1')

    // Back upstairs. The flusher's job, exercised here with the server refusing the
    // session: the mark is STORED server-side and a card is raised — §10.5's "nothing is
    // silently dropped, nothing silently applied".
    setForcedMode(null)
    await flush({
      store,
      post: async () =>
        new Response(
          JSON.stringify({
            applied: 1,
            replayed: 0,
            superseded: 0,
            conflicts: [
              { kind: 'session_cancelled', session_id: 'session-1', student_ids: [], count: 1 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      refresh: async () => true,
      currentPersonId: () => ME,
    })
    queueChanged()

    // The queue drained — the strip goes quiet again…
    expect(await pendingCount(store)).toBe(0)
    await waitFor(() => expect(screen.queryByTestId('network-status')).toBeNull())

    // …and the conflict is visible IN THIS APP, and resolvable.
    const cards = await screen.findByTestId('attendance-conflicts')
    expect(cards).toHaveTextContent(t('he', 'attendance.conflict.sessionCancelled'))
    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'attendance.conflict.review') }),
    )
    await waitFor(() => expect(screen.queryByTestId('attendance-conflicts')).toBeNull())
  })

  it('shows the pending count even when back online, until the queue drains', async () => {
    // The badge is about the QUEUE, not the network: marks waiting on a working connection
    // (mid-flush, or a flush that deferred on auth) are still invisible work the coach is
    // owed a count of.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    await markOne('mark-2')
    render(<NetworkStatus locale="he" />)
    queueChanged()
    expect(await screen.findByTestId('network-status-pending')).toBeInTheDocument()
    expect(screen.queryByTestId('network-status-mode')).toBeNull()
  })
})
