// `toWizardGroup` is the seam task 2 finished: the API gained three facts the group card
// always drew but never had, and this is where a missing/old-server field must not become
// a crash on the wizard's first screen rather than an empty label.
import { describe, expect, it } from 'vitest'
import type { ApiGroup } from './adapters'
import { toRegisterPayload, toWizardGroup } from './adapters'
import { emptyStudent } from './types'

const FULL_GROUP: ApiGroup = {
  id: 'g1',
  name: 'קבוצת בוקר',
  class_name: 'מתחילים',
  weekdays: [3, 0],
  training_durations_min: [60],
  coaches: ['דנה לוי', 'אבי כהן'],
  locations: ['אולם א'],
}

describe('toWizardGroup', () => {
  it('a full ApiGroup maps to a WizardGroup with every label populated', () => {
    const group = toWizardGroup(FULL_GROUP)
    expect(group.id).toBe('g1')
    expect(group.name).toBe('קבוצת בוקר')
    // The LEVEL line -- the class name, not the session count that used to sit here.
    expect(group.trackLabel).toBe('מתחילים')
    // Exactly one duration -- the one real number.
    expect(group.durationMin).toBe(60)
    // Sorted (weekdays arrive unsorted above) with the session count appended.
    expect(group.scheduleLabel).toBe('ראשון · רביעי · 2 אימונים בשבוע')
    expect(group.coachesLabel).toBe('דנה לוי · אבי כהן')
    expect(group.locationLabel).toBe('אולם א')
  })

  it('two different lesson lengths produce durationMin: 0, not one of the two', () => {
    const group = toWizardGroup({ ...FULL_GROUP, training_durations_min: [60, 90] })
    expect(group.durationMin).toBe(0)
  })

  it('no lesson length at all is also durationMin: 0 -- the same "do not draw this line" value', () => {
    const group = toWizardGroup({ ...FULL_GROUP, training_durations_min: [] })
    expect(group.durationMin).toBe(0)
  })

  it('a response with none of the new fields present still maps without throwing, with empty labels', () => {
    const legacy: ApiGroup = { id: 'g2', name: 'קבוצת ערב', weekdays: [1] }
    expect(() => toWizardGroup(legacy)).not.toThrow()
    const group = toWizardGroup(legacy)
    expect(group.trackLabel).toBe('')
    expect(group.durationMin).toBe(0)
    expect(group.scheduleLabel).toBe('שני · 1 אימונים בשבוע')
    expect(group.coachesLabel).toBe('')
    expect(group.locationLabel).toBe('')
  })

  it('a group with no training days at all gets an empty schedule label, not a lone session count', () => {
    const group = toWizardGroup({ ...FULL_GROUP, weekdays: [] })
    expect(group.scheduleLabel).toBe('')
  })
})

// The three fields the 2026-09-06 review added, asserted at the SEAM rather than on the
// form: a field collected and then dropped on the way to the write passes every component
// test there is. CLAUDE.md names this one directly.
describe('toRegisterPayload — שנת עליה and הורה 2', () => {
  const OPTIONS = { templateId: 'tmpl-1', clubTermsAccepted: true }

  /** A minor with everything the review asked for filled in. */
  function minorDraft() {
    return {
      ...emptyStudent('s1'),
      firstName: 'אנה',
      lastName: 'לוי',
      birthDate: '2015-05-05',
      nationalId: '100000009',
      address: 'יפו 1',
      city: 'תל אביב',
      grade: 'grade_3' as const,
      aliyahYear: '2014',
      guardianFirstName: 'מרינה',
      guardianLastName: 'לוי',
      guardianNationalId: '100000025',
      guardianPhone: '050-1234567',
      guardianEmail: 'marina@example.invalid',
      guardianAliyahYear: '1998',
      otherParent: {
        firstName: 'סרגיי',
        lastName: 'לוי',
        nationalId: '100000033',
        phone: '052-7654321',
      },
    }
  }

  it('sends the student’s year and the guardian’s year as two different values', () => {
    const payload = toRegisterPayload([minorDraft()], OPTIONS)
    expect(payload.children[0]!.aliyah_year).toBe('2014')
    expect(payload.signer.aliyah_year).toBe('1998')
  })

  it('sends the second parent on the child, with only the fields that were filled', () => {
    const payload = toRegisterPayload([minorDraft()], OPTIONS)
    expect(payload.children[0]!.other_parent).toEqual({
      first_name: 'סרגיי',
      last_name: 'לוי',
      national_id: '100000033',
      phone: '052-7654321',
    })
  })

  it('sends no second parent for a tab that was opened and left blank', () => {
    // An empty second parent is NO second parent. The API requires a first name of one that
    // exists at all, so sending `{first_name: ''}` would be a 422 for a family that simply
    // changed their mind.
    const student = { ...minorDraft(), otherParent: { firstName: '  ', lastName: '', nationalId: '', phone: '' } }
    expect(toRegisterPayload([student], OPTIONS).children[0]!.other_parent).toBeNull()
  })

  it('asks an adult member for one year, and sends it as the signer’s', () => {
    // §5.3's adult member is one `Person` in both roles, so the child write and the signer
    // write land on the same row. Sending the year twice is two writes to one column where
    // whichever ran last wins — the form asks once, and this is the seam that proves it.
    const adult = {
      ...emptyStudent('s2'),
      firstName: 'איגור',
      lastName: 'פטרוב',
      birthDate: '1996-02-02',
      nationalId: '100000009',
      address: 'יפו 1',
      city: 'תל אביב',
      aliyahYear: '1999',
    }
    const payload = toRegisterPayload([adult], OPTIONS)
    expect(payload.children[0]!.self_student).toBe(true)
    expect(payload.children[0]!.aliyah_year).toBeNull()
    expect(payload.signer.aliyah_year).toBe('1999')
  })

  it('never sends a second parent for an adult member', () => {
    // Nobody else's name belongs on an adult's own registration — the same rule the server
    // enforces in `_apply_family_details` regardless of what is sent.
    const adult = {
      ...emptyStudent('s3'),
      firstName: 'איגור',
      lastName: 'פטרוב',
      birthDate: '1996-02-02',
      address: 'יפו 1',
      city: 'תל אביב',
      otherParent: { firstName: 'מישהו', lastName: '', nationalId: '', phone: '' },
    }
    expect(toRegisterPayload([adult], OPTIONS).children[0]!.other_parent).toBeNull()
  })

  it('never sends a home phone, because the form no longer asks for one', () => {
    expect(toRegisterPayload([minorDraft()], OPTIONS).signer.phone_home).toBeNull()
  })

  it('sends an ADULT member’s own mobile as the account phone (#28)', () => {
    // The owner's #28 — 'phone number did not load'. Every other signer field already
    // falls back to the student's own (`guardianFirstName || firstName`,
    // `guardianNationalId || nationalId`, `guardianAliyahYear || aliyahYear`); `phone` was
    // the one that did not, because there was no student-side field to fall back TO.
    //
    // So `Person.phone` was written NULL for every adult who registered themselves, and
    // `GET /me/profile` — which reads that column straight — had nothing to return. The
    // screen was right: the number was never collected.
    const adult = {
      ...emptyStudent('s4'),
      firstName: 'איגור',
      lastName: 'פטרוב',
      birthDate: '1996-02-02',
      nationalId: '100000009',
      address: 'יפו 1',
      city: 'תל אביב',
      phone: '054-9876543',
    }
    expect(toRegisterPayload([adult], OPTIONS).phone).toBe('054-9876543')
  })

  it('still prefers the guardian’s mobile for a minor (#28)', () => {
    // The account holder is the GUARDIAN when there is one, so a child who happens to
    // carry their own number must not displace the parent the club actually rings.
    const child = { ...minorDraft(), phone: '054-0000000' }
    expect(toRegisterPayload([child], OPTIONS).phone).toBe('050-1234567')
  })
})

describe('the belt a family declares', () => {
  // Bug #10 gave the wizard the CLUB's own ladder so a family would not register against
  // belts the club does not award. The picker shipped, the review card showed the answer
  // back — and THIS function had no belt field, so every child registered through the
  // wizard landed with `current_belt_id` NULL. Asked, answered, displayed, dropped.
  it('rides on the payload the registration actually posts', () => {
    const payload = toRegisterPayload(
      [emptyStudent('c1', { firstName: 'נועה', lastName: 'לוי', beltId: 'belt-blue' })],
      { templateId: null, clubTermsAccepted: true },
    )
    expect(payload.children[0]!.belt_rank_id).toBe('belt-blue')
  })

  it('sends null when the picker was left alone', () => {
    // "No belt recorded" is a beginner's ordinary state and must not become a guess.
    const payload = toRegisterPayload(
      [emptyStudent('c1', { firstName: 'נועה', lastName: 'לוי' })],
      { templateId: null, clubTermsAccepted: true },
    )
    expect(payload.children[0]!.belt_rank_id).toBeNull()
  })
})
