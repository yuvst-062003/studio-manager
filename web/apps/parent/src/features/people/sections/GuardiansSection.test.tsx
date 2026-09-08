// A2 and A4, as tests.
//
// The screenshot that started this: an adult member's own card, showing his own name under
// הורים. `guardian.relation` has been `'self'` in the database for every self-registering
// adult since the join wizard shipped, and nothing read it.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GuardiansSection, guardianLabelKey } from './GuardiansSection'
import type { GuardianOut, StudentSummary } from '../peopleClient'

const student = {
  id: 'st1',
  person_id: 'p0',
  first_name: 'יובל',
  last_name: 'סטולין',
  status: 'active',
  health_status: 'signed',
} as unknown as StudentSummary

const guardian = (over: Partial<GuardianOut>): GuardianOut =>
  ({
    person_id: 'g1',
    student_id: 'st1',
    display_name: 'יובל סטולין',
    relation: 'parent',
    is_primary: true,
    phone: null,
    email: null,
    ...over,
  }) as GuardianOut

describe('guardianLabelKey', () => {
  it('is הורים when every guardian is a parent', () => {
    expect(guardianLabelKey([{ relation: 'parent' }, { relation: 'parent' }])).toBe(
      'people.card.guardians',
    )
  })

  it('moves the whole row to אפוטרופוסים when any guardian is not a parent', () => {
    // True of the SET. A grandparent among two parents makes "הורים" wrong about the row,
    // and the join wizard's own form already says 'פרטי ההורה / אפוטרופוס'.
    expect(guardianLabelKey([{ relation: 'parent' }, { relation: 'grandparent' }])).toBe(
      'people.card.guardiansPlural',
    )
  })

  it('is NO ROW for an adult who is their own guardian', () => {
    // §5.3's adult member — one person in both roles. There is nobody else to name, and a
    // heading with one self-referential name under it is the defect stated politely.
    expect(guardianLabelKey([{ relation: 'self' }])).toBeNull()
  })

  it('ignores a self row beside real guardians', () => {
    // An adult member who also has a parent on file: the parent is named, the member is
    // not listed as their own guardian.
    expect(guardianLabelKey([{ relation: 'self' }, { relation: 'parent' }])).toBe(
      'people.card.guardians',
    )
  })
})

describe('GuardiansSection', () => {
  it('renders nothing at all for a self-guarding adult', () => {
    const { container } = render(
      <GuardiansSection
        locale="he"
        student={student}
        guardians={[guardian({ relation: 'self' })]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names each guardian with their relation and a way to call them', () => {
    render(
      <GuardiansSection
        locale="he"
        student={student}
        guardians={[
          guardian({ person_id: 'g1', display_name: 'דנה כהן', phone: '050-1234567' }),
          guardian({
            person_id: 'g2',
            display_name: 'שרה כהן',
            relation: 'grandparent',
            phone: null,
          }),
        ]}
      />,
    )
    expect(screen.getByTestId('student-card-guardians')).toBeInTheDocument()
    expect(screen.getByText('דנה כהן')).toBeInTheDocument()
    expect(screen.getByText('שרה כהן')).toBeInTheDocument()
    // Two anchors reading "חיוג" would be two links a screen reader cannot tell apart, and
    // telling them apart is the whole point of listing more than one guardian.
    expect(screen.getByRole('link', { name: /דנה כהן/ })).toHaveAttribute(
      'href',
      'tel:050-1234567',
    )
  })

  it('does NOT link to #/profile', () => {
    // A4 — the row pointed at the profile tab, whose 2026-09-06 redesign has no guardian
    // view in any of its five sheets. It answers itself now.
    render(
      <GuardiansSection
        locale="he"
        student={student}
        guardians={[guardian({ display_name: 'דנה כהן' })]}
      />,
    )
    const row = screen.getByTestId('student-card-guardians')
    expect(row.tagName).not.toBe('A')
    expect(row.querySelector('a[href="#/profile"]')).toBeNull()
  })
})
