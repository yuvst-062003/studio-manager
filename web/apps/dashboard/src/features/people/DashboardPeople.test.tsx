// Dashboard artboards 3b, 3c, 4a and 6c.
//
// Two things are asserted harder than the rest: the payment column on `3b` is EXPLICITLY
// empty rather than invented, and `6c` hardcodes no alert this lane does not own. Both are
// failures that look like features until somebody acts on them.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSlot, registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import { StudentsScreen, documentLabelKey } from './StudentsScreen'
import { AddStudentScreen } from './AddStudentScreen'
import { StudentDetailScreen } from './StudentDetailScreen'
import { TrialsAwaitingDecisionAlert } from './sections/TrialsAwaitingDecisionAlert'
import { AlertCentre } from './AlertCentre'
import type { AlertSectionProps } from './AlertCentre'
import { registerPeopleAlerts } from './register'
import type {
  DashboardPeopleClient,
  RegistrationRequestOut,
  StudentSummary,
  TrialBookingRow,
} from './peopleClient'

const summary = (over: Partial<StudentSummary> = {}): StudentSummary =>
  ({
    id: 'st1',
    person_id: 'p1',
    first_name: 'דנה',
    last_name: 'כהן',
    birthdate: '2018-05-01',
    status: 'active',
    health_status: 'signed',
    joined_on: '2026-09-01',
    left_on: null,
    group_names: ['מתחילים'],
    guardian_display_names: ['יעל כהן'],
    frozen_until: null,
    ...over,
  }) as StudentSummary

const REQUEST = {
  id: 'r1',
  source: 'parent_app',
  status: 'pending',
  submitted_at: '2026-09-01T09:00:00Z',
  reviewed_at: null,
  matched_person_id: 'p9',
  child_display_name: 'נועה כהן',
  guardian_display_name: 'יעל כהן',
} as unknown as RegistrationRequestOut

const booking = (over: Partial<TrialBookingRow> = {}): TrialBookingRow =>
  ({
    id: 'b1',
    student_id: 'st1',
    student_display_name: 'נועה לוי',
    group_id: 'g1',
    group_name: 'מתחילים',
    session_id: 's1',
    booked_at: '2026-09-01T09:00:00Z',
    attended: null,
    outcome: 'pending',
    is_override: false,
    ...over,
  }) as TrialBookingRow

function makeClient(over: Partial<DashboardPeopleClient> = {}): DashboardPeopleClient {
  return {
    students: vi.fn(() =>
      Promise.resolve({ items: [summary()], next_cursor: null, has_more: false }),
    ),
    student: vi.fn(() =>
      Promise.resolve({
        ...summary(),
        current_belt_color_hex: '#ffffff',
        current_belt_name: 'לבנה',
        guardians: [
          {
            person_id: 'p9',
            student_id: 'st1',
            display_name: 'יעל כהן',
            relation: 'parent',
            is_primary: true,
            phone: '0521234567',
            email: 'y@example.invalid',
          },
        ],
      }),
    ),
    pricePlan: vi.fn(() =>
      Promise.resolve({ student_id: 'st1', price_plan_id: null, weekly_volume: 2 }),
    ),
    enrollments: vi.fn(() =>
      Promise.resolve([
        {
          id: 'e1',
          student_id: 'st1',
          group_id: 'g1',
          group_name: 'מתחילים',
          status: 'active',
          started_on: '2026-09-01',
          ended_on: null,
          attends_weekdays: [0],
        },
      ]),
    ),
    statusHistory: vi.fn(() =>
      Promise.resolve({
        items: [
          {
            id: 'h1',
            student_id: 'st1',
            from_status: 'trial',
            to_status: 'active',
            reason: null,
            changed_at: '2026-09-01T09:00:00Z',
          },
        ],
      }),
    ),
    groups: vi.fn(() =>
      Promise.resolve({
        items: [
          { id: 'g1', name: 'מתחילים' },
          { id: 'g2', name: 'נבחרת' },
        ],
      }),
    ),
    weekdayOptions: vi.fn(() =>
      Promise.resolve({ group_id: 'g1', group_name: 'מתחילים', training_weekdays: [0, 3] }),
    ),
    createStudent: vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ invitation_token: 'tok-123' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
    convert: vi.fn(),
    markLost: vi.fn(),
    freeze: vi.fn(),
    pendingRequests: vi.fn(() => Promise.resolve({ items: [REQUEST] })),
    trialBookings: vi.fn(() => Promise.resolve({ items: [booking()] })),
    approve: vi.fn(),
    reject: vi.fn(),
    ...over,
  } as unknown as DashboardPeopleClient
}

const noPhysicalCss = (container: HTMLElement) => {
  for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
    expect(node.getAttribute('style') ?? '').not.toMatch(
      /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
    )
  }
}

afterEach(() => clearSlot('alert-centre'))

// -- 3b: the students table -----------------------------------------------------

describe('StudentsScreen — 3b', () => {
  it('links to the add-student screen — a screen with no inbound link does not exist', () => {
    // #/students/new shipped reachable only by typing the URL; the staging full pass
    // (2026-08-28) read that as "a manager cannot create anything".
    render(<StudentsScreen locale="he" client={makeClient()} />)
    const add = screen.getByTestId('students-add')
    expect(add).toHaveAttribute('href', '#/students/new')
    expect(add).toHaveTextContent(t('he', 'people.student.add'))
  })

  it('renders a real table with a caption and column headers', async () => {
    // A grid of divs looks identical and is unreadable to a screen reader, and §6.4 puts
    // this in front of a manager who may be using one.
    render(<StudentsScreen locale="he" client={makeClient()} />)
    const table = await screen.findByTestId('students-table')
    expect(table.querySelector('caption')).not.toBeNull()
    expect(table.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(0)
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(<StudentsScreen locale="he" client={client} />)
    await screen.findByTestId('students-table')
    await user.selectOptions(screen.getByTestId('students-status-filter'), 'trial')
    await waitFor(() =>
      expect(client.students).toHaveBeenCalledWith(expect.objectContaining({ status: 'trial' })),
    )
  })

  it('renders the מסמכים column from the health status', async () => {
    render(<StudentsScreen locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('students-document')).toHaveTextContent(
      t('he', 'people.document.signed'),
    )
  })

  it('leaves מצב תשלום EXPLICITLY empty rather than inventing it', async () => {
    // `charge` is W4's table. A plausible-looking payment column in a manager's
    // decision-making screen would be a fabrication — so the column exists, is labelled,
    // and says when it fills in.
    render(<StudentsScreen locale="he" client={makeClient()} />)
    // F8: with no charges read yet the cell is an em dash — never a fake ✓ and never
    // an amount. The chip states appear only once the manager-only read lands.
    expect(await screen.findAllByTestId('students-payment-pending')).not.toHaveLength(0)
    expect(document.body.textContent ?? '').not.toContain('₪')
  })

  it('tells "nothing matched" apart from "the club has no students"', async () => {
    const client = makeClient({
      students: vi.fn(() => Promise.resolve({ items: [], next_cursor: null, has_more: false })),
    })
    render(<StudentsScreen locale="he" client={client} />)
    expect(await screen.findByText(t('he', 'people.student.empty'))).toBeInTheDocument()
  })

  it('pages with a cursor rather than an offset', async () => {
    // G16 — rosters are written to while they are being read, and LIMIT/OFFSET silently
    // skips or repeats rows when the set shifts.
    const user = userEvent.setup()
    const client = makeClient({
      students: vi
        .fn()
        .mockResolvedValueOnce({ items: [summary()], next_cursor: 'st1', has_more: true })
        .mockResolvedValueOnce({
          items: [summary({ id: 'st2', first_name: 'יוסי' })],
          next_cursor: null,
          has_more: false,
        }),
    })
    render(<StudentsScreen locale="he" client={client} />)
    await user.click(await screen.findByTestId('students-load-more'))
    // The Table primitive renders each student as the row header (its identity cell).
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    expect(client.students).toHaveBeenLastCalledWith(expect.objectContaining({ after: 'st1' }))
  })

  it('scrolls the table inside its own container, not the page sideways', async () => {
    // F1b — the scroll container is the Table primitive's own.
    render(<StudentsScreen locale="he" client={makeClient()} />)
    await screen.findByTestId('students-table')
    expect(screen.getByRole('table').parentElement).toHaveClass('studio-table-scroll')
  })

  it('renders no physical CSS', async () => {
    const { container } = render(<StudentsScreen locale="en" client={makeClient()} />)
    await screen.findByTestId('students-table')
    noPhysicalCss(container)
  })
})

describe('documentLabelKey', () => {
  it('maps all three health statuses, from people.ts and not health.ts', () => {
    // `health` is M4's namespace (plan §1.3, seam 3); a lane borrowing another's would
    // serialize both waves.
    expect(documentLabelKey('signed')).toBe('people.document.signed')
    expect(documentLabelKey('trial_signed')).toBe('people.document.trialSigned')
    expect(documentLabelKey('missing')).toBe('people.document.missing')
  })
})

// -- 3c: adding a student -------------------------------------------------------

describe('AddStudentScreen — 3c', () => {
  it('attaches to an existing PARENT, and never claims a household exists', () => {
    // The artboard says "משק בית"; L9 says there is no such entity. The screen attaches to
    // a parent, and the copy says parent.
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    expect(screen.getByTestId('add-student-parent-hint')).toHaveTextContent(
      t('he', 'people.request.matchedHint'),
    )
  })

  it('offers a group, and enrols the child into it in the same save', async () => {
    // §5.4(a) — 'parent details -> child details AND GROUP -> save. Creates everything
    // immediately.' The API accepted a group_id and silently dropped it, so this form
    // never sent one and every manager-added student arrived as a lead with no enrollment.
    const user = userEvent.setup()
    const client = makeClient()
    render(<AddStudentScreen locale="he" client={client} />)
    const [parentFirst, parentLast] = screen.getAllByLabelText(t('he', 'people.student.firstName'))
    await user.type(parentFirst!, 'יעל')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[0]!, 'כהן')
    await user.type(parentLast!, 'דנה')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[1]!, 'כהן')
    await user.selectOptions(await screen.findByTestId('add-student-group-0'), 'g1')
    await user.click(screen.getByTestId('add-student-submit'))

    await waitFor(() => expect(client.createStudent).toHaveBeenCalled())
    const body = vi.mocked(client.createStudent).mock.calls[0]![0]
    expect(body.group_id).toBe('g1')
  })

  it('collects C12’s weekdays over the chosen group’s real training days', async () => {
    // C12 — 'EVERY enrolment form collects attends_weekdays as checkboxes over the group's
    // scheduled weekdays, all ticked by default.' All ticked sends NULL, because an array
    // freezes today's timetable into the row and §5.6 rewrites future sessions.
    const user = userEvent.setup()
    const client = makeClient()
    render(<AddStudentScreen locale="he" client={client} />)
    const [parentFirst, parentLast] = screen.getAllByLabelText(t('he', 'people.student.firstName'))
    await user.type(parentFirst!, 'יעל')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[0]!, 'כהן')
    await user.type(parentLast!, 'דנה')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[1]!, 'כהן')
    await user.selectOptions(await screen.findByTestId('add-student-group-0'), 'g1')

    // The group trains Sunday and Wednesday, both ticked by default.
    expect(await screen.findByTestId('weekday-0')).toBeChecked()
    expect(screen.getByTestId('weekday-3')).toBeChecked()
    await user.click(screen.getByTestId('weekday-3'))
    await user.click(screen.getByTestId('add-student-submit'))

    await waitFor(() => expect(client.createStudent).toHaveBeenCalled())
    expect(vi.mocked(client.createStudent).mock.calls[0]![0].attends_weekdays).toEqual([0])
  })

  it('sends no group when the manager picked none, rather than inventing one', async () => {
    // §5.4a — a lead is 'a real student who simply has no enrollment'. The phone-enquiry
    // case must stay reachable from this form.
    const user = userEvent.setup()
    const client = makeClient()
    render(<AddStudentScreen locale="he" client={client} />)
    const [parentFirst, parentLast] = screen.getAllByLabelText(t('he', 'people.student.firstName'))
    await user.type(parentFirst!, 'יעל')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[0]!, 'כהן')
    await user.type(parentLast!, 'דנה')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[1]!, 'כהן')
    await user.click(screen.getByTestId('add-student-submit'))

    await waitFor(() => expect(client.createStudent).toHaveBeenCalled())
    const body = vi.mocked(client.createStudent).mock.calls[0]![0]
    expect(body.group_id ?? null).toBeNull()
  })

  it('renders no price on the add form', () => {
    // L2 — the price is on the STUDENT and `price_plan` is W4's table. A group picker is
    // the closest this screen gets to money, and it stops there.
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    expect(document.body.textContent ?? '').not.toMatch(/₪/)
  })

  it('sends the address and never a person_id it guessed', async () => {
    // L7 — matching is on a VERIFIED email or phone, and a client cannot verify anything.
    const user = userEvent.setup()
    const client = makeClient()
    render(<AddStudentScreen locale="he" client={client} />)
    const [parentFirst, parentLast] = screen.getAllByLabelText(
      t('he', 'people.student.firstName'),
    )
    await user.type(parentFirst!, 'יעל')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[0]!, 'כהן')
    await user.type(screen.getByLabelText(t('he', 'people.student.email')), 'y@example.invalid')
    await user.type(parentLast!, 'דנה')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[1]!, 'כהן')
    await user.click(screen.getByTestId('add-student-submit'))

    await waitFor(() => expect(client.createStudent).toHaveBeenCalled())
    const body = vi.mocked(client.createStudent).mock.calls[0]![0]
    expect(body.guardian.email).toBe('y@example.invalid')
    expect(JSON.stringify(body)).not.toContain('person_id')
  })

  it('adds a second child in one action', async () => {
    // §5.4a's worked example — two children submitted together.
    const user = userEvent.setup()
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    await user.click(screen.getByTestId('add-student-add-child'))
    expect(screen.getByTestId('add-student-child-1')).toBeInTheDocument()
  })

  it('shows the invitation once, for a parent at the desk', async () => {
    const user = userEvent.setup()
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    await user.type(screen.getAllByLabelText(t('he', 'people.student.firstName'))[0]!, 'יעל')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[0]!, 'כהן')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.firstName'))[1]!, 'דנה')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[1]!, 'כהן')
    await user.click(screen.getByTestId('add-student-submit'))

    expect(await screen.findByTestId('add-student-invitation')).toHaveTextContent('tok-123')
  })

  it('has NO price field', () => {
    // L2 — `price_plan` is W4's table; the conversion screen stores an id and the prices
    // screen is M6's.
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    expect(document.body.textContent ?? '').not.toContain(t('he', 'people.convert.pricePlan'))
    expect(document.body.textContent ?? '').not.toContain('₪')
  })

  it('labels every input', () => {
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).toHaveAccessibleName()
    }
  })
})

// -- 4a: the manager's card -----------------------------------------------------

describe('StudentDetailScreen — 4a', () => {
  it('renders the card, the groups and the status timeline', async () => {
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('student-detail')).toBeInTheDocument()
    expect(screen.getByTestId('detail-enrollment')).toBeInTheDocument()
    expect(screen.getByTestId('detail-history')).toBeInTheDocument()
  })

  it('shows the C11 volume beside the plan field', async () => {
    // §5.10 shows it 'so a mismatch between what a child attends and what they are billed
    // for is visible at the moment the price is set'.
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('detail-weekly-volume')).toHaveTextContent('2')
  })

  it('renders the price plan as an ID and a hint, never an amount', async () => {
    // L2 — `price_plan` is W4's table and this lane never resolves it. A helpful "₪320"
    // here would be the fabrication invariant 3 exists to prevent.
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('detail-price-hint')).toHaveTextContent(
      t('he', 'people.convert.pricePlanHint'),
    )
    expect(document.body.textContent ?? '').not.toContain('₪')
  })

  it('renders the C12 pattern per enrollment', async () => {
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('detail-weekdays')).toHaveTextContent(
      t('he', 'people.weekdays.0'),
    )
  })

  it('offers freeze, convert and mark-lost', async () => {
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('detail-freeze')).toBeInTheDocument()
    expect(screen.getByTestId('detail-convert')).toBeInTheDocument()
    expect(screen.getByTestId('detail-mark-lost')).toBeInTheDocument()
  })

  it('renders narrow as well as wide', async () => {
    // §6.4 — 'a manager checking cover from a phone is a normal case rather than an error.'
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('student-detail')).toHaveStyle({ display: 'grid' })
  })
})

// -- 6c: the alert centre container ---------------------------------------------

describe('AlertCentre — the 6c container', () => {
  it('renders an alert a later milestone registers, without knowing what it is', () => {
    registerSlot<AlertSectionProps>('alert-centre', {
      key: 'debt',
      order: 10,
      render: () => <p data-testid="future-alert" />,
    })
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(screen.getByTestId('future-alert')).toBeInTheDocument()
  })

  it('orders alerts by their declared order', () => {
    registerSlot<AlertSectionProps>('alert-centre', {
      key: 'z',
      order: 90,
      render: () => <p data-testid="ordered">z</p>,
    })
    registerSlot<AlertSectionProps>('alert-centre', {
      key: 'a',
      order: 10,
      render: () => <p data-testid="ordered">a</p>,
    })
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(screen.getAllByTestId('ordered').map((n) => n.textContent)).toEqual(['a', 'z'])
  })

  it('hardcodes NO alert this lane does not own', () => {
    // M4's missing declarations, M5's at-risk students and M6's debt and reconciliation
    // alerts all land through the registry. If one appears here without a registerSlot
    // call, this catches it.
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(screen.queryByTestId('alert-debt')).toBeNull()
    expect(screen.queryByTestId('alert-reconciliation')).toBeNull()
    expect(screen.queryByTestId('alert-at-risk')).toBeNull()
    expect(screen.queryByTestId('alert-missing-health')).toBeNull()
  })

  it('says nothing needs attention rather than showing a blank panel', () => {
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(screen.getByTestId('alerts-empty')).toHaveTextContent(t('he', 'people.alerts.empty'))
  })

  it('renders this lane’s own alerts through the registry too', async () => {
    registerPeopleAlerts()
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('alert-pending-requests')).toBeInTheDocument()
    expect(screen.getByTestId('alert-upcoming-trials')).toBeInTheDocument()
    expect(screen.getByTestId('alert-trials-awaiting')).toBeInTheDocument()
  })
})

describe('the alerts this lane owns', () => {
  it('shows two display names and no payload', async () => {
    // L10 — an unapproved registration is a stranger's personal data about a minor.
    registerPeopleAlerts()
    render(<AlertCentre locale="he" client={makeClient()} />)
    const row = await screen.findByTestId('alert-request-row')
    expect(row).toHaveTextContent('יעל כהן')
    expect(row).toHaveTextContent('נועה כהן')
    expect(row.textContent ?? '').not.toContain('2018')
  })

  it('never claims certainty about a match', async () => {
    // §5.4a — matching is on a verified address, so the copy is 'ייתכן שזה אותו הורה'.
    registerPeopleAlerts()
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('alert-request-matched')).toHaveTextContent(
      t('he', 'people.request.matchedPerson'),
    )
  })

  it('opens the decision rather than approving in place', async () => {
    // §5.4 — 'Approving is where the group is chosen.'
    registerPeopleAlerts()
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('alert-request-approve-r1')).toHaveTextContent(
      t('he', 'people.request.approveInGroup'),
    )
  })

  it('excludes a trial that has not happened from the decision queue', async () => {
    // `attended === null` is 'the lesson has not happened yet'. Listing it as awaiting a
    // decision puts a choice in front of somebody who cannot make it.
    registerPeopleAlerts()
    render(<AlertCentre locale="he" client={makeClient()} />)
    await screen.findByTestId('alert-trials-awaiting')
    expect(screen.queryByTestId('alert-decision-row')).toBeNull()
    // …and it DOES appear in the upcoming queue.
    expect(screen.getByTestId('alert-trial-row')).toBeInTheDocument()
  })

  it('lists an attended trial as awaiting a decision, with both outcomes', async () => {
    // §5.4a ⑤ — `lost` is a real outcome, not an absence of one. A queue with only the
    // happy path never empties.
    registerPeopleAlerts()
    const client = makeClient({
      trialBookings: vi.fn(() => Promise.resolve({ items: [booking({ attended: true })] })),
    })
    render(<AlertCentre locale="he" client={client} />)
    expect(await screen.findByTestId('alert-decision-row')).toBeInTheDocument()
    expect(screen.getByTestId('alert-convert-st1')).toBeInTheDocument()
    expect(screen.getByTestId('alert-lost-st1')).toBeInTheDocument()
  })

  it('shows an override, because §5.4a makes it countable', async () => {
    registerPeopleAlerts()
    const client = makeClient({
      trialBookings: vi.fn(() => Promise.resolve({ items: [booking({ is_override: true })] })),
    })
    render(<AlertCentre locale="he" client={client} />)
    expect(await screen.findByTestId('alert-trial-override')).toBeInTheDocument()
  })

  it('shows no money in any alert', async () => {
    registerPeopleAlerts()
    render(<AlertCentre locale="he" client={makeClient()} />)
    await screen.findByTestId('alert-pending-requests')
    expect(document.body.textContent ?? '').not.toContain('₪')
  })
})

describe('F2 — the four buttons that used to do nothing', () => {
  it('freeze expands, then fires POST /students/{id}/freeze with the dates', async () => {
    const client = makeClient()
    ;(client.freeze as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}'))
    render(<StudentDetailScreen studentId="st1" locale="he" client={client} />)
    await userEvent.click(await screen.findByTestId('detail-freeze'))
    // The second press is the confirmation step; the fields are the decision.
    const from = screen.getByTestId('detail-freeze-from') as HTMLInputElement
    expect(from.value).not.toBe('')
    await userEvent.click(screen.getByTestId('detail-freeze-submit'))
    expect(client.freeze).toHaveBeenCalledWith('st1', {
      from_date: from.value,
      to_date: null,
    })
  })

  it('mark-lost expands, requires a reason, then fires with it', async () => {
    const client = makeClient()
    ;(client.markLost as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}'))
    render(<StudentDetailScreen studentId="st1" locale="he" client={client} />)
    await userEvent.click(await screen.findByTestId('detail-mark-lost'))
    expect(screen.getByTestId('detail-mark-lost-submit')).toBeDisabled()
    await userEvent.type(screen.getByTestId('detail-lost-reason'), 'עברו לעיר אחרת')
    await userEvent.click(screen.getByTestId('detail-mark-lost-submit'))
    expect(client.markLost).toHaveBeenCalledWith('st1', 'עברו לעיר אחרת')
  })

  it('the alert converts with the chosen group — same route as the detail screen', async () => {
    const client = makeClient({
      trialBookings: vi.fn(async () => ({
        items: [
          {
            id: 'b1',
            student_id: 'st9',
            student_display_name: 'דנה ניסיון',
            booked_at: '2026-11-01T10:00:00Z',
            attended: true,
            outcome: 'pending',
          } as never,
        ],
      })),
    })
    ;(client.convert as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}'))
    render(<TrialsAwaitingDecisionAlert locale="he" client={client} />)
    await userEvent.click(await screen.findByTestId('alert-convert-st9'))
    await userEvent.selectOptions(screen.getByTestId('alert-convert-group-st9'), 'g1')
    await userEvent.click(screen.getByTestId('alert-convert-submit-st9'))
    expect(client.convert).toHaveBeenCalledWith('st9', {
      group_id: 'g1',
      started_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown as string,
    })
  })

  it('the alert marks lost with the typed reason', async () => {
    const client = makeClient({
      trialBookings: vi.fn(async () => ({
        items: [
          {
            id: 'b1',
            student_id: 'st9',
            student_display_name: 'דנה ניסיון',
            booked_at: '2026-11-01T10:00:00Z',
            attended: true,
            outcome: 'pending',
          } as never,
        ],
      })),
    })
    ;(client.markLost as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}'))
    render(<TrialsAwaitingDecisionAlert locale="he" client={client} />)
    await userEvent.click(await screen.findByTestId('alert-lost-st9'))
    await userEvent.type(screen.getByTestId('alert-lost-reason-st9'), 'לא התאים')
    await userEvent.click(screen.getByTestId('alert-lost-submit-st9'))
    expect(client.markLost).toHaveBeenCalledWith('st9', 'לא התאים')
  })
})

describe('F12 — bulk actions on the students screen', () => {
  it('selects rows and fires one bulk move with per-row outcomes', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/students/bulk')) {
          bodies.push(JSON.parse(String(init?.body)))
          return new Response(
            JSON.stringify({
              applied: 1,
              refused: [{ id: 'st1', reason: 'multiple_enrollments' }],
            }),
            { status: 200 },
          )
        }
        if (url.includes('/groups')) {
          return new Response(
            JSON.stringify({ items: [{ id: 'g9', name: 'יעד', is_active: true }] }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
    render(<StudentsScreen locale="he" client={makeClient()} />)
    await userEvent.click(await screen.findByTestId('select-st1'))
    await userEvent.selectOptions(await screen.findByTestId('bulk-group'), 'g9')
    await userEvent.click(screen.getByTestId('bulk-move'))
    // Destructive-adjacent: the confirm dialog gates the press.
    await userEvent.click(await screen.findByTestId('confirm-bulk-confirm'))
    expect(bodies[0]).toMatchObject({
      student_moves: [{ student_id: 'st1', group_id: 'g9' }],
    })
    // The half-succeeded batch says WHICH row failed and why, translated.
    expect(await screen.findByTestId('bulk-refused-st1')).toHaveTextContent(
      t('he', 'people.bulk.refused.multiple_enrollments'),
    )
    vi.unstubAllGlobals()
  })
})
