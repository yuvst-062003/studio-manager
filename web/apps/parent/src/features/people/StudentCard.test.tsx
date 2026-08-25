// Parent artboard 2c — the student-card CONTAINER.
//
// The test that matters most is the one asserting what is NOT here. 2c is composed of
// sections owned by four different milestones, and the container's whole job is to know
// none of them by name. A hardcoded belt strip would put M7's work in M3's file and
// serialize two waves the slot registry exists to keep parallel.
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clearSlot, registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import { StudentCard } from './StudentCard'
import type { StudentCardSectionProps } from './StudentCard'
import { registerPeopleSections } from './register'
import type { EnrollmentOut, GuardianOut, StudentSummary } from './peopleClient'

const STUDENT = {
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
} as unknown as StudentSummary

const ENROLLMENTS = [
  {
    id: 'e1',
    student_id: 'st1',
    group_id: 'g1',
    group_name: 'מתחילים',
    status: 'active',
    started_on: '2026-09-01',
    ended_on: null,
    attends_weekdays: [0, 3],
  },
  {
    id: 'e2',
    student_id: 'st1',
    group_id: 'g2',
    group_name: 'נבחרת',
    status: 'active',
    started_on: '2026-09-01',
    ended_on: null,
    attends_weekdays: null,
  },
] as unknown as EnrollmentOut[]

const GUARDIANS = [
  {
    person_id: 'p9',
    student_id: 'st1',
    display_name: 'יעל כהן',
    relation: 'parent',
    is_primary: true,
    phone: '0521234567',
    email: 'y@example.invalid',
  },
  {
    person_id: 'p8',
    student_id: 'st1',
    display_name: 'דוד כהן',
    relation: 'parent',
    is_primary: false,
    phone: '0527654321',
    email: 'd@example.invalid',
  },
] as unknown as GuardianOut[]

afterEach(() => clearSlot('student-card'))

describe('StudentCard — the 2c container', () => {
  it('renders the student’s name', () => {
    render(<StudentCard student={STUDENT} locale="he" />)
    expect(
      screen.getByRole('heading', { level: 1, name: /דנה כהן/ }),
    ).toBeInTheDocument()
  })

  it('renders a section a later milestone registers, without knowing what it is', () => {
    // The whole point of seam 4. M4's documents section and M6's payment section land as one
    // file plus one line in their own feature barrel, and this file is never reopened.
    registerSlot<StudentCardSectionProps>('student-card', {
      key: 'documents',
      order: 40,
      // Deliberately not a real user-facing string: G4's eslint rule reaches test files
      // too, and this stands in for a section M4 has not written yet.
      render: () => <p data-testid="future-section" />,
    })
    render(<StudentCard student={STUDENT} locale="he" />)
    expect(screen.getByTestId('future-section')).toBeInTheDocument()
  })

  it('orders sections by their declared order, not by registration order', () => {
    registerSlot<StudentCardSectionProps>('student-card', {
      key: 'z',
      order: 90,
      render: () => <p data-testid="ordered">z</p>,
    })
    registerSlot<StudentCardSectionProps>('student-card', {
      key: 'a',
      order: 10,
      render: () => <p data-testid="ordered">a</p>,
    })
    render(<StudentCard student={STUDENT} locale="he" />)
    expect(screen.getAllByTestId('ordered').map((node) => node.textContent)).toEqual(['a', 'z'])
  })

  it('passes the payload down, so a section never fetches for itself', () => {
    // slots.ts: 'Where a section needs data it reads a field the wave's contract commit
    // already put in the payload — it never asks the container to fetch for it.'
    registerSlot<StudentCardSectionProps>('student-card', {
      key: 'probe',
      order: 10,
      render: ({ student, enrollments }) => (
        <p data-testid="probe">{`${student.first_name}:${enrollments?.length ?? 0}`}</p>
      ),
    })
    render(<StudentCard student={STUDENT} locale="he" enrollments={ENROLLMENTS} />)
    expect(screen.getByTestId('probe')).toHaveTextContent('דנה:2')
  })

  it('hardcodes NO section this lane does not own', () => {
    // If belt, attendance, documents or payment ever appear here without a registerSlot
    // call, this is what catches it — and the container is where that mistake would be
    // cheapest to make and most expensive to undo.
    render(<StudentCard student={STUDENT} locale="he" />)
    expect(screen.queryByTestId('student-card-belt')).toBeNull()
    expect(screen.queryByTestId('student-card-attendance')).toBeNull()
    expect(screen.queryByTestId('student-card-documents')).toBeNull()
    expect(screen.queryByTestId('student-card-payment')).toBeNull()
    expect(document.body.textContent ?? '').not.toContain('₪')
  })

  it('says the rest is coming rather than showing an empty page', () => {
    render(<StudentCard student={STUDENT} locale="he" />)
    expect(screen.getByTestId('student-card-pending')).toHaveTextContent(
      t('he', 'people.card.sectionsComeLater'),
    )
  })

  it('renders this lane’s own sections through the registry too', () => {
    // Not as a special case. `register.ts` calls registerSlot exactly as M4 will, so the
    // container has one code path and this lane is not privileged inside it.
    registerPeopleSections()
    render(
      <StudentCard
        student={STUDENT}
        locale="he"
        enrollments={ENROLLMENTS}
        guardians={GUARDIANS}
      />,
    )
    expect(screen.getByTestId('student-card-details')).toBeInTheDocument()
    expect(screen.getByTestId('student-card-enrollments')).toBeInTheDocument()
    expect(screen.getByTestId('student-card-guardians')).toBeInTheDocument()
  })

  it('registers idempotently, so an HMR reload does not render a section twice', () => {
    registerPeopleSections()
    registerPeopleSections()
    render(<StudentCard student={STUDENT} locale="he" enrollments={ENROLLMENTS} />)
    expect(screen.getAllByTestId('student-card-details')).toHaveLength(1)
  })
})

describe('the sections this lane owns', () => {
  it('renders EVERY live enrollment, not one', () => {
    // C11 and L3 — a child in two groups is two rows, which the club confirmed is normal.
    // A section that rendered enrollments[0] would hide the second group from the parent.
    registerPeopleSections()
    render(<StudentCard student={STUDENT} locale="he" enrollments={ENROLLMENTS} />)
    expect(screen.getAllByTestId('student-card-enrollment')).toHaveLength(2)
  })

  it('renders a null weekday pattern as "every day" rather than seven checkboxes', () => {
    // C12 — NULL means all of them, which is the default and the common case. Listing seven
    // days would imply a choice nobody made.
    registerPeopleSections()
    render(<StudentCard student={STUDENT} locale="he" enrollments={ENROLLMENTS} />)
    const patterns = screen.getAllByTestId('student-card-weekdays')
    expect(patterns[0]).toHaveTextContent(t('he', 'people.weekdays.0'))
    expect(patterns[1]).toHaveTextContent(t('he', 'people.weekdays.allDays'))
  })

  it('renders no price on an enrollment, because there is none to render', () => {
    // C11 and L2 — the price is on the STUDENT, and `EnrollmentOut` has no field for one.
    registerPeopleSections()
    render(<StudentCard student={STUDENT} locale="he" enrollments={ENROLLMENTS} />)
    const section = screen.getByTestId('student-card-enrollments')
    expect(section.textContent ?? '').not.toMatch(/₪|price|מחיר/)
  })

  it('gives every guardian the same affordances', () => {
    // L8 — §5.3: 'One guardian view, no permission branching.'
    registerPeopleSections()
    render(<StudentCard student={STUDENT} locale="he" guardians={GUARDIANS} />)
    expect(screen.getAllByTestId('guardian-row')).toHaveLength(2)
    expect(screen.getAllByTestId('guardian-call')).toHaveLength(2)
    expect(screen.getAllByTestId('guardian-primary')).toHaveLength(1)
  })

  it('surfaces the student’s status rather than inferring it', () => {
    // §5.4a — 'student.status is surfaced everywhere a student is rendered, never inferred
    // from the absence of an enrollment.'
    registerPeopleSections()
    const trial = { ...STUDENT, status: 'trial' } as StudentSummary
    render(<StudentCard student={trial} locale="he" enrollments={[]} />)
    expect(screen.getByTestId('student-card-details')).toHaveTextContent(
      t('he', 'people.status.trial'),
    )
  })

  it('renders no physical CSS', () => {
    registerPeopleSections()
    const { container } = render(
      <StudentCard
        student={STUDENT}
        locale="en"
        enrollments={ENROLLMENTS}
        guardians={GUARDIANS}
      />,
    )
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
