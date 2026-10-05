// A child loaded with no parent yet is never billed (2026-10-04) — `BillingRunService` needs
// a primary guardian to raise anything. The payment column read "no open charge" as "paid",
// so the first look at the loaded club showed a ✓ over sixty-nine children nobody had ever
// billed. Asserted at the seam: the charges read the screen actually makes, and the row the
// list actually returns.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { StudentsScreen } from './StudentsScreen'
import type { DashboardPeopleClient } from './peopleClient'

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) =>
      path.startsWith('/api/v1/charges')
        ? new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200 })
        : new Response(JSON.stringify({ items: [] }), { status: 200 }),
    ),
  }
})

const row = (id: string, guardian_invite_state: string) => ({
  id,
  person_id: `p-${id}`,
  first_name: 'דנה',
  last_name: 'כהן',
  birthdate: null,
  status: 'active',
  health_status: 'missing',
  joined_on: null,
  left_on: null,
  group_names: ['קבוצה 3'],
  guardian_display_names: [],
  guardian_invite_state,
})

function client(): DashboardPeopleClient {
  return {
    students: vi.fn(async () => ({
      items: [row('orphan', 'no_contact'), row('family', 'ready')],
      next_cursor: null,
      has_more: false,
    })),
  } as unknown as DashboardPeopleClient
}

describe('the payment column for a child with no parent yet', () => {
  it('says "not billed", and keeps "paid" for a family that has nothing open', async () => {
    render(<StudentsScreen locale="he" client={client()} />)
    await waitFor(() =>
      expect(screen.getByTestId('students-payment-orphan')).toHaveTextContent(
        t('he', 'people.student.payment.notBilled'),
      ),
    )
    expect(screen.getByTestId('students-payment-family')).toHaveTextContent(
      t('he', 'people.student.payment.settled'),
    )
  })
})

describe('the result count while more pages wait', () => {
  it('says 50+ rather than a page size that reads as the total', async () => {
    const many = Array.from({ length: 50 }, (_, n) => row(`s${n}`, 'no_contact'))
    const paged = {
      students: vi.fn(async () => ({ items: many, next_cursor: 's49', has_more: true })),
    } as unknown as DashboardPeopleClient
    render(<StudentsScreen locale="he" client={paged} />)
    await waitFor(() =>
      expect(screen.getByTestId('students-result-count')).toHaveTextContent('50+'),
    )
  })

  it('carries the invite-state filter onto the next page as well', async () => {
    // Page 1 was filtered and page 2 was not, so one press of "load more" under
    // `no_contact` appended the whole club to a list of children with no parent — and the
    // `50+` above is precisely what puts a manager's finger on that button on a 69-child
    // roster. Asserted on the arguments of the paging call, because the appended rows look
    // like plausible rows either way.
    const user = userEvent.setup()
    const many = Array.from({ length: 50 }, (_, n) => row(`s${n}`, 'no_contact'))
    // Declared WITH its argument, so `mock.calls` below is a tuple that has an element 0 —
    // the arguments of the paging call are the whole point of this test.
    const students = vi.fn<(args: Record<string, unknown>) => Promise<unknown>>(async () => ({
      items: many,
      next_cursor: 's49',
      has_more: true,
    }))
    render(<StudentsScreen locale="he" client={{ students } as unknown as DashboardPeopleClient} />)
    await screen.findByTestId('students-load-more')

    await user.selectOptions(screen.getByTestId('students-invite-filter'), 'no_contact')
    await waitFor(() =>
      expect(students).toHaveBeenCalledWith(
        expect.objectContaining({ invite_state: 'no_contact' }),
      ),
    )

    await user.click(screen.getByTestId('students-load-more'))
    await waitFor(() => {
      const paging = students.mock.calls
        .map(([args]) => args)
        .filter((args) => args.after !== undefined)
      expect(paging.length).toBeGreaterThan(0)
      for (const args of paging) expect(args.invite_state).toBe('no_contact')
    })
  })
})
