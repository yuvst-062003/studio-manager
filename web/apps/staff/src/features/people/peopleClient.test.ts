// Staff `9h` — the list has to be the WHOLE roster, not the server's first page.
//
// Gladiator's load (2026-10-12) put 72 children in the club and this screen drew 50: the
// search sent no `limit` and never followed `next_cursor`, so 22 children were unreachable
// from the staff app and each class heading counted only what had arrived — קבוצה 2 read
// "7" against 12 enrolled. Attendance was never affected (the roster comes from the session
// endpoint); this is the search tab alone.
import { describe, expect, it, vi } from 'vitest'

import { makeStaffPeopleClient } from './peopleClient'

/** A page of the real `StudentSummaryPage` shape: items + the two paging fields. */
function page(ids: string[], nextCursor: string | null) {
  return {
    ok: true,
    json: async () => ({
      items: ids.map((id) => ({ id, first_name: id, last_name: '' })),
      next_cursor: nextCursor,
      has_more: nextCursor !== null,
    }),
  } as unknown as Response
}

describe('the staff students search', () => {
  it('follows the cursor until the server stops offering one', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page(['a', 'b'], 'cursor-1'))
      .mockResolvedValueOnce(page(['c', 'd'], 'cursor-2'))
      .mockResolvedValueOnce(page(['e'], null))
    const client = makeStaffPeopleClient(fetcher)

    const body = await client.search('')

    expect(body.items.map((student) => student.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(fetcher).toHaveBeenCalledTimes(3)
    // The follow-ups carry the cursor the previous page handed back.
    expect(fetcher.mock.calls[1]?.[0]).toContain('after=cursor-1')
    expect(fetcher.mock.calls[2]?.[0]).toContain('after=cursor-2')
  })

  it('asks for the largest page the server allows, so one club is usually one request', async () => {
    const fetcher = vi.fn().mockResolvedValue(page(['a'], null))

    await makeStaffPeopleClient(fetcher).search('')

    expect(fetcher.mock.calls[0]?.[0]).toContain('limit=200')
  })

  it('keeps the group filter and the query on every page it asks for', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page(['a'], 'cursor-1'))
      .mockResolvedValueOnce(page(['b'], null))

    await makeStaffPeopleClient(fetcher).search('דוד', 'group-7')

    for (const call of fetcher.mock.calls) {
      expect(call[0]).toContain(`q=${encodeURIComponent('דוד')}`)
      expect(call[0]).toContain('group_id=group-7')
    }
  })

  it('stops rather than loops forever if a server ever repeats a cursor', async () => {
    const fetcher = vi.fn().mockResolvedValue(page(['a'], 'same-cursor'))

    const body = await makeStaffPeopleClient(fetcher).search('')

    // The guard is a page cap, not a promise about the exact number of requests.
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(25)
    expect(body.items.length).toBeGreaterThan(0)
  })
})
