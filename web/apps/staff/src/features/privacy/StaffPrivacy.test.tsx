// §16's operator view of §11.3 and §11.4 — the queue, and above all its failures.
//
// The parent screen tells a guardian their export or erasure did not run. This screen is
// where the person who has to ANSWER that guardian finds out, without being told to poll a
// database. `app/workers/privacy.py` refuses on purpose (HB-privacy-worker-unbuilt), so
// today every request in this queue ends `failed` with a reason — and a queue that
// rendered those as "in progress" would hide a compliance gap behind a spinner.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PrivacyOperatorScreen } from './PrivacyOperatorScreen'
import type { PrivacyRequest, PrivacyRequests, StaffPrivacyClient } from './staffPrivacyClient'

function request(over: Partial<PrivacyRequest>): PrivacyRequest {
  return {
    id: 'req-1',
    kind: 'export',
    subject_person_id: 'p-9',
    requested_by_person_id: 'p-9',
    status: 'pending',
    error: null,
    reason: null,
    has_bundle: false,
    created_at: '2026-08-29T06:00:00Z',
    completed_at: null,
    ...over,
  }
}

function client(requests: PrivacyRequests): StaffPrivacyClient {
  return { requests: vi.fn(async () => requests) }
}

describe('the staff privacy queue', () => {
  it('says so when there is nothing in the queue', async () => {
    render(
      <PrivacyOperatorScreen client={client({ exports: [], deletions: [] })} locale="he" />,
    )
    await waitFor(() => expect(screen.getByTestId('privacy-operator')).toBeInTheDocument())
    expect(screen.getByText('אין בקשות')).toBeInTheDocument()
  })

  it('counts the failures where somebody will see them', async () => {
    render(
      <PrivacyOperatorScreen
        client={client({
          exports: [request({ status: 'failed', error: 'not implemented' })],
          deletions: [
            request({ id: 'del-1', kind: 'deletion', status: 'failed', error: 'not implemented' }),
            request({ id: 'del-2', kind: 'deletion', status: 'pending' }),
          ],
        })}
        locale="he"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('privacy-operator')).toBeInTheDocument())
    expect(screen.getByTestId('privacy-failed-count')).toHaveTextContent('2')
  })

  it('shows a failed erasure as failed, with the reason, and never as completed', async () => {
    render(
      <PrivacyOperatorScreen
        client={client({
          exports: [],
          deletions: [
            request({
              id: 'del-1',
              kind: 'deletion',
              status: 'failed',
              reason: 'gdpr_request',
              error: 'subject data purge is not implemented -- no data was deleted',
            }),
          ],
        })}
        locale="he"
      />,
    )
    const row = await screen.findByTestId('privacy-request-del-1')
    expect(row).toHaveTextContent('המחיקה נכשלה')
    expect(row).toHaveTextContent('no data was deleted')
    expect(row).not.toHaveTextContent('הושלם')
  })

  it('puts the failures first, because the pending ones are only waiting', async () => {
    render(
      <PrivacyOperatorScreen
        client={client({
          exports: [
            request({ id: 'a', status: 'pending', created_at: '2026-08-29T09:00:00Z' }),
            request({ id: 'b', status: 'failed', error: 'x', created_at: '2026-08-29T06:00:00Z' }),
          ],
          deletions: [],
        })}
        locale="he"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('privacy-operator')).toBeInTheDocument())
    const ids = screen
      .getAllByTestId(/^privacy-request-/)
      .map((node) => node.getAttribute('data-testid'))
    // `b` is older, and it is still first: an unanswered subject-access request that
    // FAILED is work, and a pending one is a queue that has not drained yet.
    expect(ids).toEqual(['privacy-request-b', 'privacy-request-a'])
  })
})
