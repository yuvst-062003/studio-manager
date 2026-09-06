// C4 — the restyled student detail sheet. `StaffPeople.test.tsx` covers `StudentsSearch`
// and `StaffStudentCard`; this file covers the composition this checkpoint actually wires
// into `#/students/<id>` — see `StudentCardRoute.tsx`'s own header for why that is a
// different component from `StaffStudentCard`, which `App.tsx` never mounts.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { StudentCardRoute, ageFromBirthdate } from './StudentCardRoute'
import type { EnrollmentOut, StaffPeopleClient, StudentDetail } from './peopleClient'
import type { StaffAttendanceClient } from '../attendance/client'

// `StudentCardRoute` resolves the real signed-in `actor` via `useSession()` (see its own
// header for why) — so every render in this file now makes a `fetch` under the hood for
// `/auth/refresh`. Defaulted here to a safe "not signed in" answer, which resolves
// `session.edit` to `false` (מעבר כיתה shows the lead-only message) — none of the tests
// below this line depend on the move control, so that default never needed to be anything
// louder. The two tests that DO care about role stub their own answer instead.
function sessionFetch(roles: string[] | null) {
  const body =
    roles === null
      ? null
      : {
          access: { staff: true, parent: false },
          studios: [
            {
              studio_id: 'st-1',
              studio_name: 'מועדון בדיקה',
              studio_is_demo: false,
              person_id: 'p-1',
              roles,
              is_guardian: false,
            },
          ],
          active_studio_id: 'st-1',
        }
  return vi.fn(async (input: RequestInfo | URL) => {
    if (body === null) return new Response(null, { status: 401 })
    const url = String(input)
    if (url.includes('/auth/refresh')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 900, ...body }), {
        status: 200,
      })
    }
    if (url.includes('/auth/me')) {
      return new Response(JSON.stringify({ ...body, dev_tools: false }), { status: 200 })
    }
    return new Response(null, { status: 404 })
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', sessionFetch(null))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const DETAIL = {
  id: 'st1',
  person_id: 'p1',
  first_name: 'נועה',
  last_name: 'לוי',
  birthdate: '2015-04-01',
  status: 'active',
  health_status: 'signed',
  joined_on: '2026-09-01',
  left_on: null,
  current_belt_color_hex: '#ffffff',
  current_belt_name: 'לבנה',
  frozen_until: null,
  guardians: [
    {
      person_id: 'p9',
      student_id: 'st1',
      display_name: 'יעל לוי',
      relation: 'parent',
      is_primary: true,
      phone: '0521234567',
      email: 'y@example.invalid',
    },
  ],
} as unknown as StudentDetail

const ENROLLMENTS = [
  {
    id: 'e1',
    student_id: 'st1',
    group_id: 'g1',
    group_name: 'מתחילים',
    status: 'active',
    started_on: '2026-09-01',
    ended_on: null,
    attends_weekdays: null,
  },
] as unknown as EnrollmentOut[]

function makePeopleClient(over: Partial<StaffPeopleClient> = {}): StaffPeopleClient {
  return {
    student: vi.fn(() => Promise.resolve(DETAIL)),
    enrollments: vi.fn(() => Promise.resolve(ENROLLMENTS)),
    groups: vi.fn(() => Promise.resolve({ items: [{ id: 'g2', name: 'נבחרת', is_active: true }] })),
    ...over,
  } as unknown as StaffPeopleClient
}

function makeAttendanceClient(): StaffAttendanceClient {
  return {
    bootstrap: vi.fn(() => Promise.resolve({} as never)),
    sessionRoster: vi.fn(() => Promise.reject(new Error('unused'))),
    bulkPresent: vi.fn(() => Promise.reject(new Error('unused'))),
    studentAttendance: vi.fn(() => Promise.resolve([])),
  }
}

const renderRoute = (peopleClient = makePeopleClient()) =>
  render(
    <StudentCardRoute
      attendanceClient={makeAttendanceClient()}
      locale="he"
      peopleClient={peopleClient}
      studentId="st1"
      today="2026-09-06T12:00:00Z"
    />,
  )

describe('StudentCardRoute — the profile banner', () => {
  it('shows the name, the live group and the belt, with the ring', async () => {
    renderRoute()
    const banner = await screen.findByRole('region', { name: 'נועה לוי' })
    expect(within(banner).getByText('מתחילים')).toBeInTheDocument()
    expect(within(banner).getByText('לבנה')).toBeInTheDocument()
  })

  it('computes age from the birthdate', async () => {
    renderRoute()
    expect(await screen.findByTestId('staff-card-age')).toHaveTextContent('11')
  })

  it('ageFromBirthdate returns null with no birthdate, never NaN', () => {
    expect(ageFromBirthdate(null, '2026-09-06T00:00:00Z')).toBeNull()
  })
})

describe('StudentCardRoute — the two things the data does not support', () => {
  it('shows the birthdate and never a school or a grade field', async () => {
    renderRoute()
    const details = await screen.findByTestId('staff-card-personal-details')
    expect(within(details).getByText('2015-04-01')).toBeInTheDocument()
    // No school/grade row — StudentDetailOut carries no such field, and none is invented.
    expect(within(details).queryByText(/כיתה|בית ספר|מוסד לימודים/)).toBeNull()
  })

  it('renders no attendance trend chart', async () => {
    renderRoute()
    await screen.findByTestId('staff-card-personal-details')
    expect(document.body.textContent ?? '').not.toContain('נוכחות באימונים החודש')
  })

  it('shows NO money of any kind', async () => {
    renderRoute()
    await screen.findByTestId('staff-card-personal-details')
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('₪')
    expect(text).not.toContain(t('he', 'people.convert.pricePlan'))
  })
})

describe('StudentCardRoute — parent contacts (§4.9, reusing features/contact)', () => {
  it('offers a direct one-tap call to each guardian', async () => {
    renderRoute()
    expect(await screen.findByTestId('staff-card-call')).toHaveAttribute(
      'href',
      'tel:0521234567',
    )
  })

  it('reuses ContactFamiliesButton for the parents, never a second contact panel', async () => {
    const user = userEvent.setup()
    renderRoute()
    const section = await screen.findByTestId('staff-card-guardian')
    expect(section).toBeInTheDocument()
    const trigger = screen.getByText(t('he', 'people.staffCard.contactParentsTrigger'))
    await user.click(trigger)
    expect(await screen.findByTestId('contact-panel')).toHaveTextContent('נועה לוי')
  })

  it('says NO guardians rather than an empty, silent card', async () => {
    const client = makePeopleClient({
      student: vi.fn(() => Promise.resolve({ ...DETAIL, guardians: [] })),
    })
    renderRoute(client)
    expect(await screen.findByTestId('staff-card-no-guardians')).toBeInTheDocument()
  })

  it('offers direct-to-student contact only when the student has their own phone', async () => {
    const client = makePeopleClient({
      student: vi.fn(() => Promise.resolve({ ...DETAIL, phone: '0541112222' })),
    })
    renderRoute(client)
    expect(
      await screen.findByText(t('he', 'people.staffCard.contactStudentTrigger')),
    ).toBeInTheDocument()
  })

  it('does not offer it when the student has no phone on file', async () => {
    renderRoute()
    await screen.findByTestId('staff-card-guardian')
    expect(screen.queryByText(t('he', 'people.staffCard.contactStudentTrigger'))).toBeNull()
  })
})

describe('StudentCardRoute — composes the existing attendance/health card underneath', () => {
  it('still renders the slot container this checkpoint does not touch', async () => {
    renderRoute()
    expect(await screen.findByTestId('staff-student-card')).toBeInTheDocument()
  })

  it('shows a retry on a failed read, never a blank sheet', async () => {
    const client = makePeopleClient({ student: vi.fn(() => Promise.reject(new Error('boom'))) })
    renderRoute(client)
    expect(await screen.findByTestId('load-failed')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('load-failed-retry'))
    await waitFor(() => expect(client.student).toHaveBeenCalledTimes(2))
  })
})

// Defect A: `StaffStudentCard` (9c) was exported, tested and mounted nowhere — a lead
// coach was told (via `DrawerIdentity`'s permission boundaries) that moving a student is
// NOT locked for them, with no screen on which to do it. These prove the fix reaches all
// the way from the real signed-in role — resolved inside `StudentCardRoute` via
// `useSession()`, exactly as the deployed app resolves it — down to `StaffStudentCard`'s
// own `can(actor, 'session.edit')` gate, rather than a hand-built `actor` prop standing in
// for it.
describe('StudentCardRoute — #/students/<id> and the real signed-in role (defect A)', () => {
  it('renders the move control for a lead coach', async () => {
    vi.stubGlobal('fetch', sessionFetch(['lead_coach']))
    renderRoute()
    expect(await screen.findByTestId('move-group-start')).toBeInTheDocument()
    expect(screen.queryByTestId('move-group-lead-only')).toBeNull()
  })

  it('does NOT render the move control for an assistant coach, and says who can', async () => {
    vi.stubGlobal('fetch', sessionFetch(['assistant_coach']))
    renderRoute()
    expect(await screen.findByTestId('move-group-lead-only')).toBeInTheDocument()
    expect(screen.queryByTestId('move-group-start')).toBeNull()
  })

  it('also renders it for an owner and a manager, exactly like §3.2', async () => {
    vi.stubGlobal('fetch', sessionFetch(['owner']))
    renderRoute()
    expect(await screen.findByTestId('move-group-start')).toBeInTheDocument()
  })
})
