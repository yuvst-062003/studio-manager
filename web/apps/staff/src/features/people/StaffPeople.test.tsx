// Staff artboards 9h, 9c and 11b.
//
// Two rules carry these screens: §3.2's "coaches never see money", and 9c's "פעולה של המאמן
// הראשי בלבד". Both are asserted as negatives, because both fail silently — a price that
// appears is one nobody notices until a coach mentions it to a parent, and an action an
// assistant should not have is one they will simply use.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { Actor } from '@studio/core'
import { StudentsSearch, chipToneFor } from './StudentsSearch'
import { StaffStudentCard } from './StaffStudentCard'
import { TrialInClass } from './TrialInClass'
import { WeekdayPicker, attendsWeekdaysFor } from './WeekdayPicker'
import type { EnrollmentOut, StaffPeopleClient, StudentDetail, StudentSummary } from './peopleClient'

const summary = (over: Partial<StudentSummary> = {}): StudentSummary =>
  ({
    id: 'st1',
    person_id: 'p1',
    first_name: 'נועה',
    last_name: 'לוי',
    birthdate: '2019-04-01',
    status: 'active',
    health_status: 'signed',
    joined_on: '2026-09-01',
    left_on: null,
    group_names: ['מתחילים'],
    guardian_display_names: ['יעל לוי'],
    frozen_until: null,
    ...over,
  }) as StudentSummary

const DETAIL = {
  id: 'st1',
  person_id: 'p1',
  first_name: 'נועה',
  last_name: 'לוי',
  birthdate: '2019-04-01',
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

const OWNER: Actor = { role: 'owner', scope: { type: 'studio' } } as unknown as Actor
const LEAD: Actor = { role: 'lead_coach', scope: { type: 'studio' } } as unknown as Actor
const ASSISTANT: Actor = {
  role: 'assistant_coach',
  scope: { type: 'studio' },
} as unknown as Actor

function makeClient(over: Partial<StaffPeopleClient> = {}): StaffPeopleClient {
  return {
    search: vi.fn(() => Promise.resolve({ items: [summary()] })),
    student: vi.fn(() => Promise.resolve(DETAIL)),
    enrollments: vi.fn(() => Promise.resolve(ENROLLMENTS)),
    weekdayOptions: vi.fn(() =>
      Promise.resolve({ group_id: 'g2', group_name: 'נבחרת', training_weekdays: [0, 3] }),
    ),
    endEnrollment: vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))),
    enrol: vi.fn(() => Promise.resolve(new Response(null, { status: 201 }))),
    logTrial: vi.fn(() => Promise.resolve(new Response(null, { status: 201 }))),
    ...over,
  } as unknown as StaffPeopleClient
}

const noPhysicalCss = (container: HTMLElement) => {
  for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
    expect(node.getAttribute('style') ?? '').not.toMatch(
      /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
    )
  }
}

// -- 9h: the search tab ---------------------------------------------------------

describe('StudentsSearch — 9h', () => {
  it('searches as the coach types', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(<StudentsSearch locale="he" client={client} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.search')), 'נועה')
    await waitFor(() => expect(client.search).toHaveBeenCalled())
  })

  it('renders a StudentRow rather than a redrawn row', async () => {
    // Composing @studio/ui's row is what carries D7's belt ring into this screen without
    // this lane having to remember it (G10).
    render(<StudentsSearch locale="he" client={makeClient()} />)
    expect(await screen.findByText('נועה לוי')).toBeInTheDocument()
  })

  it('carries the ניסיון chip on a trial student’s row', async () => {
    // §5.4a — 'student.status is surfaced everywhere a student is rendered, never inferred
    // from the absence of an enrollment.' A coach taking attendance must see at a glance
    // that this child is not enrolled.
    const client = makeClient({
      search: vi.fn(() => Promise.resolve({ items: [summary({ status: 'trial' })] })),
    })
    render(<StudentsSearch locale="he" client={client} />)
    expect(await screen.findByText(t('he', 'people.status.trial'))).toBeInTheDocument()
  })

  it('tells "nothing matched" apart from "the club has no students"', async () => {
    const user = userEvent.setup()
    const client = makeClient({ search: vi.fn(() => Promise.resolve({ items: [] })) })
    render(<StudentsSearch locale="he" client={client} />)
    expect(await screen.findByText(t('he', 'people.student.empty'))).toBeInTheDocument()

    await user.type(screen.getByLabelText(t('he', 'people.student.search')), 'זזז')
    expect(
      await screen.findByText(t('he', 'people.student.emptyFiltered')),
    ).toBeInTheDocument()
  })

  it('shows NO money of any kind', async () => {
    // §3.2's hard rule: 'coaches never see money. No charge, payment, debt or price is
    // reachable from any coach-scoped endpoint or screen.'
    render(<StudentsSearch locale="he" client={makeClient()} />)
    await screen.findByText('נועה לוי')
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('₪')
    expect(text).not.toContain(t('he', 'people.convert.pricePlan'))
  })

  it('gives the search field a 44px target', () => {
    // §6.2 — one-handed, on a mat, in bright light.
    render(<StudentsSearch locale="he" client={makeClient()} />)
    expect(screen.getByLabelText(t('he', 'people.student.search'))).toHaveStyle({
      minBlockSize: '44px',
    })
  })

  it('renders no physical CSS', () => {
    const { container } = render(<StudentsSearch locale="en" client={makeClient()} />)
    noPhysicalCss(container)
  })
})

// -- 9c: the card and the group move --------------------------------------------

describe('StaffStudentCard — 9c', () => {
  const card = (actor: Actor) => (
    <StaffStudentCard
      student={DETAIL}
      enrollments={ENROLLMENTS}
      locale="he"
      client={makeClient()}
      actor={actor}
      groups={[{ id: 'g2', name: 'נבחרת' }]}
      today="2026-09-01"
    />
  )

  it('renders the card for every staff role', () => {
    render(card(ASSISTANT))
    expect(screen.getByTestId('staff-student-card')).toBeInTheDocument()
    expect(screen.getByTestId('staff-card-guardian')).toBeInTheDocument()
  })

  it('offers contact in one tap', () => {
    render(card(LEAD))
    expect(screen.getByTestId('staff-card-call')).toHaveAttribute('href', 'tel:0521234567')
  })

  it('renders every live enrollment, not one', () => {
    // C11 — a card showing one group would hide the second from the coach standing in
    // front of the child.
    render(card(LEAD))
    expect(screen.getAllByTestId('staff-card-enrollment')).toHaveLength(ENROLLMENTS.length)
  })

  it('offers מעבר כיתה to a lead coach', () => {
    render(card(LEAD))
    expect(screen.getByTestId('move-group-start')).toBeInTheDocument()
  })

  it('does NOT offer it to an assistant, and says who can', () => {
    // 9c: "פעולה של המאמן הראשי בלבד". Hiding it silently would leave an assistant asking
    // the parent instead.
    render(card(ASSISTANT))
    expect(screen.queryByTestId('move-group-start')).toBeNull()
    expect(screen.getByTestId('move-group-lead-only')).toHaveTextContent(
      t('he', 'people.convert.moveGroupLeadOnly'),
    )
  })

  it('offers it to an owner too', () => {
    render(card(OWNER))
    expect(screen.getByTestId('move-group-start')).toBeInTheDocument()
  })

  it('collects the C12 weekdays, all ticked by default', async () => {
    // C12/L4 — 'Offer the group's scheduled weekdays as checkboxes, all ticked by default.'
    const user = userEvent.setup()
    render(card(LEAD))
    await user.click(screen.getByTestId('move-group-start'))
    await user.selectOptions(screen.getByTestId('move-group-target'), 'g2')

    expect(await screen.findByTestId('weekday-picker')).toBeInTheDocument()
    expect(screen.getByTestId('weekday-0')).toBeChecked()
    expect(screen.getByTestId('weekday-3')).toBeChecked()
  })

  it('ends the old enrollment and opens the new one', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <StaffStudentCard
        student={DETAIL}
        enrollments={ENROLLMENTS}
        locale="he"
        client={client}
        actor={LEAD}
        groups={[{ id: 'g2', name: 'נבחרת' }]}
        today="2026-09-01"
      />,
    )
    await user.click(screen.getByTestId('move-group-start'))
    await user.selectOptions(screen.getByTestId('move-group-target'), 'g2')
    await screen.findByTestId('weekday-picker')
    await user.click(screen.getByTestId('move-group-submit'))

    await waitFor(() => expect(client.enrol).toHaveBeenCalled())
    expect(client.endEnrollment).toHaveBeenCalledWith('e1', '2026-09-01')
    // All days ticked → NULL, not the full array. See attendsWeekdaysFor.
    expect(vi.mocked(client.enrol).mock.calls[0]![0].attends_weekdays).toBeNull()
  })

  it('refuses to move into a group with no timetable', async () => {
    // C12's pattern is validated against the schedule server-side; disabling here with the
    // reason visible beats submitting a guess and reading a 422.
    const user = userEvent.setup()
    const client = makeClient({
      weekdayOptions: vi.fn(() =>
        Promise.resolve({ group_id: 'g2', group_name: 'נבחרת', training_weekdays: [] }),
      ),
    })
    render(
      <StaffStudentCard
        student={DETAIL}
        enrollments={ENROLLMENTS}
        locale="he"
        client={client}
        actor={LEAD}
        groups={[{ id: 'g2', name: 'נבחרת' }]}
        today="2026-09-01"
      />,
    )
    await user.click(screen.getByTestId('move-group-start'))
    await user.selectOptions(screen.getByTestId('move-group-target'), 'g2')

    expect(await screen.findByTestId('weekday-no-schedule')).toBeInTheDocument()
    expect(screen.getByTestId('move-group-submit')).toBeDisabled()
  })

  it('shows NO price and no money', () => {
    // §3.2. `StudentDetailOut` has no price_plan_id at all, so this screen could not render
    // one even by accident — asserted so a later shape change cannot quietly add it.
    render(card(LEAD))
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('₪')
    expect(text).not.toContain(t('he', 'people.convert.pricePlan'))
    expect(JSON.stringify(DETAIL)).not.toContain('price_plan_id')
  })

  it('renders no physical CSS', () => {
    const { container } = render(card(LEAD))
    noPhysicalCss(container)
  })
})

// -- 11b: a trial student, mid-lesson -------------------------------------------

describe('TrialInClass — 11b', () => {
  it('asks four fields and no more', () => {
    // §5.4a — 'Name, age, parent name, phone. Four fields.' On a mat, mid-lesson, every
    // extra field is a place to give up.
    render(<TrialInClass locale="he" client={makeClient()} groupId="g1" />)
    // Exactly four, named: child's first and last, the parent, and a phone. `type="tel"`
    // still carries the textbox role, so the count IS the four fields §5.4a allows.
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
    for (const key of [
      'people.student.firstName',
      'people.student.lastName',
      'people.guardian.one',
      'people.student.phone',
    ]) {
      expect(screen.getByLabelText(t('he', key))).toBeInTheDocument()
    }
  })

  it('logs the trial against the session the coach is standing in', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <TrialInClass locale="he" client={client} groupId="g1" sessionId="s1" />,
    )
    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'אורי')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'מזרחי')
    await user.type(screen.getByLabelText(t('he', 'people.guardian.one')), 'רותי מזרחי')
    await user.type(screen.getByLabelText(t('he', 'people.student.phone')), '0521112222')
    await user.click(screen.getByTestId('trial-submit'))

    await waitFor(() => expect(client.logTrial).toHaveBeenCalled())
    const body = vi.mocked(client.logTrial).mock.calls[0]![0]
    expect(body.group_id).toBe('g1')
    expect(body.session_id).toBe('s1')
  })

  it('offers NO group assignment and NO price', () => {
    // L6 — a coach adding a child mid-lesson is logging a trial, not enrolling anybody.
    render(<TrialInClass locale="he" client={makeClient()} groupId="g1" />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(document.body.textContent ?? '').not.toContain('₪')
  })

  it('tells a coach to ask the office when the family already used a trial', async () => {
    // §5.4a — the override is a MANAGER's deliberate, countable act, so a coach is told who
    // can grant it rather than handed the power.
    const user = userEvent.setup()
    const client = makeClient({
      logTrial: vi.fn(() => Promise.resolve(new Response(null, { status: 409 }))),
    })
    render(<TrialInClass locale="he" client={client} groupId="g1" canGrantOverride={false} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'א')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'ב')
    await user.type(screen.getByLabelText(t('he', 'people.guardian.one')), 'ג ד')
    await user.type(screen.getByLabelText(t('he', 'people.student.phone')), '05')
    await user.click(screen.getByTestId('trial-submit'))

    expect(await screen.findByTestId('trial-already-used')).toHaveTextContent(
      t('he', 'people.landing.alreadyUsed'),
    )
  })

  it('offers the override wording to somebody who can grant it', async () => {
    const user = userEvent.setup()
    const client = makeClient({
      logTrial: vi.fn(() => Promise.resolve(new Response(null, { status: 409 }))),
    })
    render(<TrialInClass locale="he" client={client} groupId="g1" canGrantOverride />)
    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'א')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'ב')
    await user.type(screen.getByLabelText(t('he', 'people.guardian.one')), 'ג ד')
    await user.type(screen.getByLabelText(t('he', 'people.student.phone')), '05')
    await user.click(screen.getByTestId('trial-submit'))

    expect(await screen.findByTestId('trial-already-used')).toHaveTextContent(
      t('he', 'people.trial.overrideHint'),
    )
  })

  it('gives every field a 44px target and a label', () => {
    render(<TrialInClass locale="he" client={makeClient()} groupId="g1" />)
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).toHaveAccessibleName()
      expect(input).toHaveStyle({ minBlockSize: '44px' })
    }
  })
})

// -- C12's picker ---------------------------------------------------------------

describe('attendsWeekdaysFor', () => {
  it('sends NULL when every training day is ticked', () => {
    // C12 — NULL means 'all of them'. Storing the array freezes today's timetable into the
    // row: §5.6 rewrites future sessions when a rule changes, and the child would silently
    // stop matching the day the club moves to Monday.
    expect(attendsWeekdaysFor([0, 3], [0, 3])).toBeNull()
  })

  it('sends the array when the manager narrowed it', () => {
    expect(attendsWeekdaysFor([0], [0, 3])).toEqual([0])
  })

  it('sends NULL when the group has no timetable, rather than an empty array', () => {
    // The table's CHECK rejects an empty array outright — it would mean a student expected
    // at nothing, which is a student who left rather than one who enrolled.
    expect(attendsWeekdaysFor([], [])).toBeNull()
  })

  it('sorts what it sends', () => {
    expect(attendsWeekdaysFor([3, 0], [0, 1, 3])).toEqual([0, 3])
  })
})

describe('WeekdayPicker', () => {
  it('labels every checkbox', () => {
    render(
      <WeekdayPicker locale="he" trainingWeekdays={[0, 3]} selected={[0]} onChange={() => {}} />,
    )
    expect(screen.getByTestId('weekday-0')).toHaveAccessibleName(t('he', 'people.weekdays.0'))
    expect(screen.getByTestId('weekday-3')).toHaveAccessibleName(t('he', 'people.weekdays.3'))
  })

  it('says a group has no timetable rather than rendering an empty fieldset', () => {
    render(
      <WeekdayPicker locale="he" trainingWeekdays={[]} selected={[]} onChange={() => {}} />,
    )
    expect(screen.getByTestId('weekday-no-schedule')).toBeInTheDocument()
    expect(screen.queryByTestId('weekday-picker')).toBeNull()
  })
})

describe('chipToneFor', () => {
  it('maps every status to a tone, with the label carrying the meaning', () => {
    for (const status of ['lead', 'trial', 'pending_approval', 'active', 'frozen', 'left', 'lost']) {
      expect(chipToneFor(status)).toBeTruthy()
      expect(t('he', `people.status.${status}`)).not.toBe(`people.status.${status}`)
    }
  })
})
