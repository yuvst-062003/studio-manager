// Parent artboards 12g, 12i and §6.3's trial home.
//
// The three tests that carry weight are all negatives: §6.3's reduced home must NOT show
// payments, attendance or a belt; `12g` must NOT promise a place; and `12i` must NOT let
// somebody leave before reading who still owes the month.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { AddSibling } from './AddSibling'
import { FirstRegistration } from './FirstRegistration'
import { ProfileAndLeave, chipToneFor } from './ProfileAndLeave'
import { TrialHome, daysUntil } from './TrialHome'
import { everyChildIsOnATrial } from './peopleClient'
import type { GuardianOut, PeopleClient, StudentSummary } from './peopleClient'

const student = (over: Partial<StudentSummary> = {}): StudentSummary =>
  ({
    id: 'st1',
    person_id: 'p1',
    first_name: 'נועה',
    last_name: 'לוי',
    birthdate: '2019-04-01',
    status: 'trial',
    health_status: 'trial_signed',
    joined_on: null,
    left_on: null,
    group_names: [],
    guardian_display_names: ['יעל לוי'],
    frozen_until: null,
    ...over,
  }) as StudentSummary

const GUARDIANS: GuardianOut[] = [
  {
    person_id: 'p9',
    student_id: 'st1',
    display_name: 'יעל לוי',
    relation: 'parent',
    is_primary: true,
    phone: '0521234567',
    email: 'yael@example.invalid',
  },
  {
    person_id: 'p8',
    student_id: 'st1',
    display_name: 'דוד לוי',
    relation: 'parent',
    is_primary: false,
    phone: '0527654321',
    email: 'david@example.invalid',
  },
]

function makeClient(response = new Response(null, { status: 201 })): PeopleClient {
  return {
    myStudents: vi.fn(),
    student: vi.fn(),
    enrollments: vi.fn(),
    requestSibling: vi.fn(() => Promise.resolve(response)),
    leave: vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))),
  } as unknown as PeopleClient
}

const noPhysicalCss = (container: HTMLElement) => {
  for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
    expect(node.getAttribute('style') ?? '').not.toMatch(
      /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
    )
  }
}

// -- §6.3's reduced trial home -------------------------------------------------

describe('TrialHome — §6.3', () => {
  const STARTS = '2026-09-06T14:00:00Z'

  it('shows the booked session with a countdown', () => {
    render(
      <TrialHome
        students={[student()]}
        locale="he"
        sessionStartsAt={STARTS}
        now={new Date('2026-09-03T09:00:00Z')}
      />,
    )
    expect(screen.getByTestId('trial-home-when')).not.toBeEmptyDOMElement()
    expect(screen.getByTestId('trial-home-countdown')).toHaveTextContent('3')
  })

  it('says tomorrow rather than "1 days"', () => {
    render(
      <TrialHome
        students={[student()]}
        locale="he"
        sessionStartsAt={STARTS}
        now={new Date('2026-09-05T09:00:00Z')}
      />,
    )
    expect(screen.getByTestId('trial-home-countdown')).toHaveTextContent(
      t('he', 'people.trialHome.tomorrow'),
    )
  })

  it('offers add-to-calendar, directions and what to bring', () => {
    render(<TrialHome students={[student()]} locale="he" sessionStartsAt={STARTS} />)
    expect(screen.getByTestId('trial-home-calendar')).toHaveAccessibleName(
      t('he', 'people.trialHome.addToCalendar'),
    )
    expect(screen.getByTestId('trial-home-directions')).toHaveAccessibleName(
      t('he', 'people.trialHome.directions'),
    )
    expect(screen.getByTestId('trial-home-bring-hint')).toBeInTheDocument()
  })

  it('renders NO payments, NO attendance history and NO belt', () => {
    // §6.3, the three absences that define this screen. A trial family has no charges —
    // the billing run only walks active enrollments — so a payments tab would open on an
    // empty screen and invite "what do I owe?" at exactly the wrong moment.
    render(<TrialHome students={[student()]} locale="he" sessionStartsAt={STARTS} />)
    const text = document.body.textContent ?? ''
    expect(text).not.toContain(t('he', 'common.nav.payments'))
    expect(screen.queryByTestId('parent-past-attendance')).toBeNull()
    expect(screen.queryByTestId('belt-bar')).toBeNull()
    expect(text).not.toContain('₪')
  })

  it('asks "איך היה?" only after the lesson', () => {
    // §5.4a ④. Asking before the lesson is the single most obvious way to look automated.
    const { rerender } = render(
      <TrialHome students={[student()]} locale="he" sessionStartsAt={STARTS} attended={false} />,
    )
    expect(screen.queryByTestId('trial-home-how-was-it')).toBeNull()
    rerender(
      <TrialHome students={[student()]} locale="he" sessionStartsAt={STARTS} attended />,
    )
    expect(screen.getByTestId('trial-home-how-was-it')).toBeInTheDocument()
  })

  it('says the club will be in touch when no session is booked yet', () => {
    render(<TrialHome students={[student()]} locale="he" sessionStartsAt={null} />)
    expect(screen.getByTestId('trial-home-waiting')).toBeInTheDocument()
  })

  it('renders no physical CSS', () => {
    const { container } = render(
      <TrialHome students={[student()]} locale="en" sessionStartsAt={STARTS} />,
    )
    noPhysicalCss(container)
  })
})

describe('everyChildIsOnATrial — the condition §6.3 states', () => {
  it('is true when every child is on a trial', () => {
    expect(everyChildIsOnATrial([student(), student({ id: 'st2' })])).toBe(true)
  })

  it('is FALSE when one child has already converted', () => {
    // §6.3 says "all trial", not "any". A family mid-conversion must keep the app they are
    // already using — losing the payments screen the day one child joins would be a
    // regression the parent cannot explain.
    expect(everyChildIsOnATrial([student(), student({ id: 'st2', status: 'active' })])).toBe(
      false,
    )
  })

  it('is false for a guardian with no children at all', () => {
    expect(everyChildIsOnATrial([])).toBe(false)
  })
})

describe('daysUntil', () => {
  it('counts whole days forward', () => {
    expect(daysUntil('2026-09-06T14:00:00Z', new Date('2026-09-03T14:00:00Z'))).toBe(3)
  })

  it('goes negative once the lesson has passed', () => {
    expect(daysUntil('2026-09-06T14:00:00Z', new Date('2026-09-08T14:00:00Z'))).toBeLessThan(0)
  })
})

// -- 12g: add a sibling ---------------------------------------------------------

describe('AddSibling — 12g', () => {
  it('says the child joins the SAME account', () => {
    // L9 — there is no household entity, and the subtitle is how the screen says so.
    render(<AddSibling locale="he" client={makeClient()} />)
    expect(screen.getByTestId('sibling-subtitle')).toHaveTextContent(
      t('he', 'people.sibling.subtitle'),
    )
  })

  it('submits a REQUEST and promises review, never a place', async () => {
    // L6 — 'a request, not an enrollment'. The manager decides (§5.4).
    const user = userEvent.setup()
    const client = makeClient()
    render(<AddSibling locale="he" client={client} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'נועה')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'כהן')
    await user.click(screen.getByTestId('sibling-submit'))

    await waitFor(() => expect(client.requestSibling).toHaveBeenCalled())
    expect(await screen.findByTestId('sibling-pending-hint')).toHaveTextContent(
      t('he', 'people.sibling.pendingHint'),
    )
  })

  it('never claims the child is enrolled', async () => {
    const user = userEvent.setup()
    render(<AddSibling locale="he" client={makeClient()} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'נועה')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'כהן')
    await user.click(screen.getByTestId('sibling-submit'))
    await screen.findByTestId('sibling-submitted')

    const text = document.body.textContent ?? ''
    expect(text).not.toContain(t('he', 'people.enrollment.add'))
    expect(text).not.toContain(t('he', 'people.status.active'))
  })

  it('keeps what was typed when the request fails', async () => {
    const user = userEvent.setup()
    render(<AddSibling locale="he" client={makeClient(new Response(null, { status: 500 }))} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'נועה')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'כהן')
    await user.click(screen.getByTestId('sibling-submit'))

    expect(await screen.findByTestId('sibling-error')).toBeInTheDocument()
    expect(screen.getByLabelText(t('he', 'people.student.firstName'))).toHaveValue('נועה')
  })

  it('labels every input', () => {
    render(<AddSibling locale="he" client={makeClient()} />)
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).toHaveAccessibleName()
    }
  })

  it('renders no physical CSS', () => {
    const { container } = render(<AddSibling locale="en" client={makeClient()} />)
    noPhysicalCss(container)
  })
})

// -- 12i: profile and leaving ---------------------------------------------------

describe('ProfileAndLeave — 12i', () => {
  const active = student({ status: 'active' })

  it('renders every guardian with identical affordances', () => {
    // L8 and §5.3 — 'One guardian view, no permission branching.'
    render(
      <ProfileAndLeave
        students={[active]}
        guardians={GUARDIANS}
        locale="he"
        client={makeClient()}
      />,
    )
    const rows = screen.getAllByTestId('guardian-row')
    expect(rows).toHaveLength(2)
    expect(screen.getAllByTestId('guardian-call')).toHaveLength(2)
  })

  it('offers no call link to a guardian with no phone number', () => {
    // `href={`tel:${phone ?? ''}`}` rendered a live "חיוג" link to the bare string `tel:`
    // for every guardian the club holds no number for — a control that looks identical to
    // the working one and dials nothing. §19.3's personas carry no phone, so every guardian
    // row in the demo studio had one.
    render(
      <ProfileAndLeave
        students={[active]}
        guardians={[{ ...GUARDIANS[0]!, phone: null }]}
        locale="he"
        client={makeClient()}
      />,
    )
    expect(screen.queryByTestId('guardian-call')).toBeNull()
  })

  it('keeps the name and the primary badge from running together', () => {
    // `<bdi>{name}</bdi><span>{primary}</span>` with nothing between them rendered
    // "שירה הורההורה ראשי" — one word, two facts. A chip is the separation, and it is the
    // primitive the rest of the app already uses for exactly this.
    render(
      <ProfileAndLeave
        students={[active]}
        guardians={GUARDIANS}
        locale="he"
        client={makeClient()}
      />,
    )
    // Asserted on the LAYOUT, not on `textContent` — `textContent` concatenates whatever
    // the CSS does, so it reads "יעל לויהורה ראשי" either way and can never tell the bug
    // from the fix. What went wrong was two adjacent inline elements with no separator
    // between them; what fixes it is a flex row with a gap, and a chip with its own border.
    const badge = screen.getByTestId('guardian-primary')
    expect(badge.firstElementChild).toHaveClass('studio-chip')
    expect(getComputedStyle(badge.parentElement!).display).toBe('flex')
  })

  it('explains what is_primary decides, and nothing more', () => {
    render(
      <ProfileAndLeave
        students={[active]}
        guardians={GUARDIANS}
        locale="he"
        client={makeClient()}
      />,
    )
    expect(screen.getByTestId('guardian-primary-hint')).toHaveTextContent(
      t('he', 'people.guardian.primaryHint'),
    )
    // Exactly one primary marker — §5.3.
    expect(screen.getAllByTestId('guardian-primary')).toHaveLength(1)
  })

  it('shows the debt notice BEFORE the decision, and disables confirm until a date', async () => {
    // 12i's own subtitle. §5.4: leaving is not a refund. A notice after the tap is a notice
    // nobody read.
    const user = userEvent.setup()
    render(
      <ProfileAndLeave
        students={[active]}
        guardians={GUARDIANS}
        locale="he"
        client={makeClient()}
      />,
    )
    await user.click(screen.getByTestId(`leave-start-${active.id}`))
    expect(screen.getByTestId('leave-debt-notice')).toHaveTextContent(
      t('he', 'people.leave.debtNotice'),
    )
    expect(screen.getByTestId('leave-submit')).toBeDisabled()
  })

  it('sends no money field when leaving', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <ProfileAndLeave
        students={[active]}
        guardians={GUARDIANS}
        locale="he"
        client={client}
      />,
    )
    await user.click(screen.getByTestId(`leave-start-${active.id}`))
    await user.type(screen.getByTestId('leave-date'), '2026-12-15')
    await user.click(screen.getByTestId('leave-submit'))

    await waitFor(() => expect(client.leave).toHaveBeenCalled())
    const body = vi.mocked(client.leave).mock.calls[0]![1]
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['left_on']))
    expect(JSON.stringify(body)).not.toMatch(/refund|amount|agorot|balance|write_off/)
  })

  it('shows a frozen child’s return date', () => {
    const frozen = student({ status: 'frozen', frozen_until: '2026-11-01' })
    render(
      <ProfileAndLeave
        students={[frozen]}
        guardians={GUARDIANS}
        locale="he"
        client={makeClient()}
      />,
    )
    expect(screen.getByTestId(`frozen-${frozen.id}`)).toHaveTextContent(
      t('he', 'people.freeze.active'),
    )
  })

  it('renders no physical CSS', () => {
    const { container } = render(
      <ProfileAndLeave
        students={[active]}
        guardians={GUARDIANS}
        locale="en"
        client={makeClient()}
      />,
    )
    noPhysicalCss(container)
  })
})

describe('chipToneFor', () => {
  it('never relies on colour alone — every status maps to a tone AND carries a label', () => {
    // SC 1.4.1. `ChipStatus` has no `trial` member and @studio/ui is not this lane's to
    // change, so the tone is the nearest honest one and the label carries the meaning.
    for (const status of ['lead', 'trial', 'pending_approval', 'active', 'frozen', 'left', 'lost']) {
      expect(chipToneFor(status)).toBeTruthy()
      expect(t('he', `people.status.${status}`)).not.toBe(`people.status.${status}`)
    }
  })
})

// -- 12j: the first registration ------------------------------------------------

describe('FirstRegistration — 12j', () => {
  const onFile = [student({ status: 'pending_approval' })]

  it('renders the children the club already holds', () => {
    // Both entry paths land on a student that already exists — a manager created it
    // (§5.4a) or a trial booking did. This screen never creates one.
    render(<FirstRegistration source="invitation" students={onFile} locale="he" />)
    expect(screen.getByTestId('first-reg-student')).toHaveTextContent('נועה לוי')
  })

  it('says something different for an invitation than for a finished trial', () => {
    // 12j's own title: "קישור מהמועדון או המשך משיעור ניסיון" — two ways in, and a parent
    // arriving from a trial has already met the club.
    const { rerender } = render(
      <FirstRegistration source="invitation" students={onFile} locale="he" />,
    )
    const invited = screen.getByTestId('first-reg-source').textContent
    rerender(<FirstRegistration source="trial" students={onFile} locale="he" />)
    expect(screen.getByTestId('first-reg-source').textContent).not.toBe(invited)
  })

  it('offers NO group picker and NO price on either path', () => {
    // L6 — 'enrolment is always a manager decision'. A group picker here would be the one
    // place in the product where somebody enrols themselves.
    for (const source of ['invitation', 'trial'] as const) {
      const { unmount } = render(
        <FirstRegistration source={source} students={onFile} locale="he" />,
      )
      expect(screen.queryByRole('combobox')).toBeNull()
      expect(document.body.textContent ?? '').not.toContain('₪')
      expect(document.body.textContent ?? '').not.toContain(t('he', 'people.convert.pricePlan'))
      unmount()
    }
  })

  it('renders the status as text, never as a control the parent can change', () => {
    render(<FirstRegistration source="trial" students={onFile} locale="he" />)
    const status = screen.getByTestId('first-reg-status')
    expect(status).toHaveTextContent(t('he', 'people.status.pending_approval'))
    expect(status.tagName).toBe('SPAN')
  })

  it('renders no physical CSS', () => {
    const { container } = render(
      <FirstRegistration source="trial" students={onFile} locale="en" />,
    )
    noPhysicalCss(container)
  })
})
