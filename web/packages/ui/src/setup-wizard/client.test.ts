// The wizard's clients are the only place that knows an endpoint's path and body shape,
// which makes them the only place a mismatch with the server can be caught. This file
// exists because one went uncaught: step 5 posted every invitation to a route that does
// not exist, and the step reported it to the owner as a bad email address.
import { describe, expect, it, vi } from 'vitest'
import { makeStaffClient } from './client'
import type { Fetcher } from './client'

/** Records what the client asked for, and answers 201 with an empty body. */
function spyFetcher(status = 201) {
  const calls: { path: string; init?: RequestInit }[] = []
  const fetcher: Fetcher = vi.fn(async (path, init) => {
    calls.push({ path, init })
    return new Response(status === 204 ? null : '{}', {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return { calls, fetcher }
}

const body = (init?: RequestInit) => JSON.parse(String(init?.body ?? '{}'))

/** The one call the test made. Throws rather than returning undefined under strict mode. */
function only(calls: { path: string; init?: RequestInit }[]) {
  const call = calls[0]
  if (!call) throw new Error('the client made no request')
  return call
}

describe('makeStaffClient.invite', () => {
  it('posts to the route the server actually mounts', async () => {
    // Regression, 2026-08-29: this was `/api/v1/invitations`, which 404s. The router
    // mounts `POST /staff/invitations` (app/routers/staff.py) and never mounted the
    // shorter path, so no coach could be invited from the wizard at all — and because
    // the step catches any rejection as `inviteFailed`, the owner was told to check the
    // email address. Asserting the path is the whole point of this test.
    const { calls, fetcher } = spyFetcher()
    await makeStaffClient(fetcher).invite('coach@example.com', 'lead_coach', [])
    expect(calls).toHaveLength(1)
    expect(only(calls).path).toBe('/api/v1/staff/invitations')
    expect(only(calls).init?.method).toBe('POST')
  })

  it('sends the body StaffInvitationIn declares — roles as a list, not intended_role', async () => {
    // The schema is {email, roles: [...], first_name, last_name, group_ids: [...]}. The
    // client used to send `intended_role` and `group_id`, neither of which the schema
    // has; even against the right path that is a 422.
    const { calls, fetcher } = spyFetcher()
    await makeStaffClient(fetcher).invite('coach@example.com', 'assistant_coach', ['g1', 'g2'])
    expect(body(only(calls).init)).toEqual({
      email: 'coach@example.com',
      roles: ['assistant_coach'],
      group_ids: ['g1', 'g2'],
    })
  })

  it('sends no groups as an empty list rather than a null', async () => {
    const { calls, fetcher } = spyFetcher()
    await makeStaffClient(fetcher).invite('coach@example.com', 'lead_coach', [])
    expect(body(only(calls).init).group_ids).toEqual([])
  })

  it('rejects on a failed invite so the step can say so', async () => {
    const { fetcher } = spyFetcher(422)
    await expect(
      makeStaffClient(fetcher).invite('nope', 'lead_coach', []),
    ).rejects.toThrow()
  })
})
