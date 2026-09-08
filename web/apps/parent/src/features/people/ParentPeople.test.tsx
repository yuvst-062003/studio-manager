// §6.3's trial home, and the belt chip's tone.
//
// The test that carries weight is a negative: §6.3's reduced home must NOT show payments,
// attendance or a belt.
//
// 12i (ProfileAndLeave) and 12j (FirstRegistration) were deleted with the redesign of
// 2026-09-06 — פרופיל is now `redesign/ProfileScreen`, covered by `redesign/derive.test.ts`
// and the sheet tests, and the first registration is the onboarding wizard's.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { chipToneFor } from './chipTone'
import { TrialHome, daysUntil } from './TrialHome'
import { everyChildIsOnATrial } from './peopleClient'
import type { StudentSummary } from './peopleClient'

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

  it('offers directions and what to bring, and no longer a dead calendar link', () => {
    render(<TrialHome students={[student()]} locale="he" sessionStartsAt={STARTS} />)
    // 'הוסף ליומן' went with `#/calendar` (owner, 2026-09-08). It promised to add THIS
    // lesson and opened a month of every lesson — the confusion #29 fixed on the הגדרות
    // row, left standing here.
    expect(screen.queryByTestId('trial-home-calendar')).toBeNull()
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

// -- 12i: profile and leaving ---------------------------------------------------

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

// `ProfileAndLeave — 12i` and `FirstRegistration — 12j` used to be tested here. Both
// components were deleted with the parent-app redesign: 12i's screen is replaced by
// `features/people/redesign/`, and 12j was already an orphan before the redesign began —
// exported from the barrel and rendered by nothing, which `unreachable-screens` had been
// reporting. `chipToneFor` outlived both (the student card still uses it) and moved to
// `features/people/chipTone.ts`, where its test above now points.
