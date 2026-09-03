import { describe, expect, it } from 'vitest'
import {
  coveringPlans,
  emptySubjectRow,
  familyFormValid,
  hasPreviousMinor,
  hasSharedMinors,
  isAdultBirthdate,
  isRowAdult,
  preselectedPlanId,
  resolveRowFamily,
  toJoinFamilyPayload,
  toTrialChildPayloads,
  weeklyVolumeForGroups,
  type PlanOption,
  type SubjectRow,
} from './familyDraft'

const TODAY = new Date(2026, 8, 3) // 2026-09-03

const baseState = {
  signerNationalId: '100000017',
  address: 'הרצל 12',
  city: 'רעננה',
  phone: '0548123456',
  relation: 'mother' as const,
}

function minorRow(overrides: Partial<SubjectRow> = {}): SubjectRow {
  return {
    ...emptySubjectRow('child'),
    firstName: 'דנה',
    birthdate: '2016-01-01', // 10 years old on TODAY
    nationalId: '100000009',
    grade: 'ד',
    groupIds: ['g1'],
    ...overrides,
  }
}

describe('isAdultBirthdate / isRowAdult', () => {
  it('is false for an empty or unparsable birthdate', () => {
    expect(isAdultBirthdate('', TODAY)).toBe(false)
    expect(isAdultBirthdate('not-a-date', TODAY)).toBe(false)
  })

  it('is false the day before the 18th birthday, true from that day on', () => {
    expect(isAdultBirthdate('2008-09-04', TODAY)).toBe(false) // turns 18 tomorrow
    expect(isAdultBirthdate('2008-09-03', TODAY)).toBe(true) // turns 18 today
    expect(isAdultBirthdate('2008-01-01', TODAY)).toBe(true) // already 18
  })

  it('a self row is always adult regardless of birthdate', () => {
    const row = { ...emptySubjectRow('self'), birthdate: '2020-01-01' }
    expect(isRowAdult(row, TODAY)).toBe(true)
  })

  it('a child row defers to isAdultBirthdate', () => {
    expect(isRowAdult(minorRow({ birthdate: '2016-01-01' }), TODAY)).toBe(false)
    expect(isRowAdult(minorRow({ birthdate: '2000-01-01' }), TODAY)).toBe(true)
  })
})

describe('hasSharedMinors / hasPreviousMinor', () => {
  it('is false with zero rows or only adult rows', () => {
    expect(hasSharedMinors([], TODAY)).toBe(false)
    expect(hasSharedMinors([minorRow({ birthdate: '2000-01-01' })], TODAY)).toBe(false)
  })

  it('is true with at least one minor row', () => {
    expect(hasSharedMinors([minorRow()], TODAY)).toBe(true)
  })

  it('hasPreviousMinor mirrors hasSharedMinors -- it asks the same question at add-time', () => {
    expect(hasPreviousMinor([], TODAY)).toBe(false)
    expect(hasPreviousMinor([minorRow()], TODAY)).toBe(true)
  })
})

describe('resolveRowFamily', () => {
  it('is empty for a self row or an adult child row, regardless of what is in the fields', () => {
    const self = { ...emptySubjectRow('self'), otherFullName: 'should never surface' }
    expect(resolveRowFamily([self], 0, TODAY)).toEqual({
      otherFullName: '',
      otherNationalId: '',
      otherPhone: '',
      pickups: [],
    })
    const adult = minorRow({ birthdate: '2000-01-01', otherFullName: 'should never surface' })
    expect(resolveRowFamily([adult], 0, TODAY)).toEqual({
      otherFullName: '',
      otherNationalId: '',
      otherPhone: '',
      pickups: [],
    })
  })

  it('reads a non-linked minor row its own fields', () => {
    const row = minorRow({
      otherFullName: 'דוד כהן',
      otherNationalId: '100000041',
      otherPhone: '0501112222',
      pickups: [{ name: 'סבתא', phone: '0503334444' }],
    })
    expect(resolveRowFamily([row], 0, TODAY)).toEqual({
      otherFullName: 'דוד כהן',
      otherNationalId: '100000041',
      otherPhone: '0501112222',
      pickups: [{ name: 'סבתא', phone: '0503334444' }],
    })
  })

  it('F7 -- "same as previous" resolves to the nearest earlier minor, not the family as a whole', () => {
    const first = minorRow({ firstName: 'דנה', otherFullName: 'דוד כהן' })
    const second = minorRow({ firstName: 'יוסי', sameAsPrevious: true, otherFullName: 'stale' })
    const rows = [first, second]
    expect(resolveRowFamily(rows, 1, TODAY).otherFullName).toBe('דוד כהן')
    // The first row is unaffected -- it is not itself linked to anything.
    expect(resolveRowFamily(rows, 0, TODAY).otherFullName).toBe('דוד כהן')
  })

  it('chains through more than one "same as previous" link to the original source', () => {
    const first = minorRow({ firstName: 'דנה', otherFullName: 'דוד כהן' })
    const second = minorRow({ firstName: 'יוסי', sameAsPrevious: true })
    const third = minorRow({ firstName: 'נועה', sameAsPrevious: true })
    const rows = [first, second, third]
    expect(resolveRowFamily(rows, 2, TODAY).otherFullName).toBe('דוד כהן')
  })

  it('resolves empty when ticked but no earlier minor exists yet', () => {
    const row = minorRow({ sameAsPrevious: true, otherFullName: 'stale' })
    expect(resolveRowFamily([row], 0, TODAY)).toEqual({
      otherFullName: '',
      otherNationalId: '',
      otherPhone: '',
      pickups: [],
    })
  })

  it('an earlier ADULT child row is skipped -- only a minor counts as "previous"', () => {
    const adultSibling = minorRow({ firstName: 'עידו', birthdate: '2000-01-01' })
    const earlierMinor = minorRow({ firstName: 'דנה', otherFullName: 'דוד כהן' })
    const linked = minorRow({ firstName: 'יוסי', sameAsPrevious: true })
    const rows = [earlierMinor, adultSibling, linked]
    expect(resolveRowFamily(rows, 2, TODAY).otherFullName).toBe('דוד כהן')
  })
})

describe('familyFormValid', () => {
  it('is invalid with zero subject rows', () => {
    expect(familyFormValid({ ...baseState, rows: [] }, TODAY)).toBe(false)
  })

  it('is valid with one self row that has a group, and nothing else required', () => {
    const row = { ...emptySubjectRow('self'), groupIds: ['g1'] }
    expect(familyFormValid({ ...baseState, rows: [row] }, TODAY)).toBe(true)
  })

  it('is invalid when the signer fields are incomplete, even with a valid row', () => {
    const row = { ...emptySubjectRow('self'), groupIds: ['g1'] }
    expect(familyFormValid({ ...baseState, address: '', rows: [row] }, TODAY)).toBe(false)
    expect(
      familyFormValid({ ...baseState, signerNationalId: '123456789', rows: [row] }, TODAY),
    ).toBe(false)
  })

  it('requires name, birthdate, national id and grade on a child row regardless of derived age', () => {
    const incomplete = minorRow({ birthdate: '2000-01-01', firstName: '', grade: '' })
    expect(familyFormValid({ ...baseState, rows: [incomplete] }, TODAY)).toBe(false)

    const complete = { ...incomplete, firstName: 'דנה' }
    // even an ADULT "child" row still needs a grade -- required_registration_fields
    // only drops it for a self-guarding student, which this is not (decision 12).
    expect(familyFormValid({ ...baseState, rows: [complete] }, TODAY)).toBe(false)
    expect(familyFormValid({ ...baseState, rows: [{ ...complete, grade: 'יב' }] }, TODAY)).toBe(
      true,
    )
  })

  it('requires at least one group per row', () => {
    expect(familyFormValid({ ...baseState, rows: [minorRow({ groupIds: [] })] }, TODAY)).toBe(
      false,
    )
  })

  it('rejects an invalid national id on a child row', () => {
    expect(
      familyFormValid({ ...baseState, rows: [minorRow({ nationalId: '123456789' })] }, TODAY),
    ).toBe(false)
  })

  it('requires the other-parent fields only when relation is "other" AND the row is a minor', () => {
    const minor = minorRow()
    expect(familyFormValid({ ...baseState, relation: 'other', rows: [minor] }, TODAY)).toBe(false)
    expect(
      familyFormValid(
        {
          ...baseState,
          relation: 'other',
          rows: [{ ...minor, otherFullName: 'יוסי כהן', otherNationalId: '100000025' }],
        },
        TODAY,
      ),
    ).toBe(true)

    // Decision 12/F8 -- an 18+ "child" row never needs it, even under "other".
    const adultChild = minorRow({ birthdate: '2000-01-01' })
    expect(familyFormValid({ ...baseState, relation: 'other', rows: [adultChild] }, TODAY)).toBe(
      true,
    )
  })

  it('"same as previous" satisfies the "other" requirement through the row it resolves to', () => {
    const first = minorRow({
      firstName: 'דנה',
      otherFullName: 'יוסי כהן',
      otherNationalId: '100000025',
    })
    const second = minorRow({ firstName: 'נועה', sameAsPrevious: true })
    expect(
      familyFormValid({ ...baseState, relation: 'other', rows: [first, second] }, TODAY),
    ).toBe(true)
  })
})

describe('toJoinFamilyPayload', () => {
  it('maps a self row to a self_student child with no birthdate/national_id/grade/family data', () => {
    const row = { ...emptySubjectRow('self'), groupIds: ['g1'], pricePlanId: 'plan-1' }
    const payload = toJoinFamilyPayload('מיכל כהן', { ...baseState, rows: [row] }, TODAY)
    expect(payload.children).toEqual([
      {
        first_name: 'מיכל',
        last_name: 'כהן',
        birthdate: null,
        group_ids: ['g1'],
        self_student: true,
        national_id: null,
        grade: null,
        price_plan_id: 'plan-1',
        other_parent: null,
        pickup_contacts: [],
      },
    ])
    expect(payload.signer.national_id).toBe('100000017')
  })

  it('maps a child row with all its fields, omitting other_parent/pickups for an adult child', () => {
    const row = minorRow({
      firstName: 'דנה כהן',
      birthdate: '2000-01-01',
      pricePlanId: 'plan-2',
    })
    const payload = toJoinFamilyPayload('מיכל כהן', { ...baseState, rows: [row] }, TODAY)
    expect(payload.children).toEqual([
      {
        first_name: 'דנה',
        last_name: 'כהן',
        birthdate: '2000-01-01',
        group_ids: ['g1'],
        self_student: false,
        national_id: '100000009',
        grade: 'ד',
        price_plan_id: 'plan-2',
        other_parent: null,
        pickup_contacts: [],
      },
    ])
  })

  it('F7 -- two minors in one submission carry DIFFERENT other_parent/pickup data', () => {
    const dana = minorRow({
      firstName: 'דנה',
      otherFullName: 'דוד כהן',
      otherNationalId: '100000041',
      otherPhone: '0501112222',
      pickups: [{ name: 'סבתא רותי', phone: '0503334444' }],
    })
    const yossi = minorRow({
      firstName: 'יוסי',
      otherFullName: 'שרה לוי',
      otherNationalId: '100000066',
      otherPhone: '0505556666',
      pickups: [{ name: 'דוד אבי', phone: '0507778888' }],
    })
    const payload = toJoinFamilyPayload('מיכל כהן', { ...baseState, rows: [dana, yossi] }, TODAY)

    expect(payload.children[0]?.other_parent).toEqual({
      first_name: 'דוד',
      last_name: 'כהן',
      national_id: '100000041',
      phone: '0501112222',
    })
    expect(payload.children[0]?.pickup_contacts).toEqual([
      { name: 'סבתא רותי', phone: '0503334444' },
    ])
    expect(payload.children[1]?.other_parent).toEqual({
      first_name: 'שרה',
      last_name: 'לוי',
      national_id: '100000066',
      phone: '0505556666',
    })
    expect(payload.children[1]?.pickup_contacts).toEqual([{ name: 'דוד אבי', phone: '0507778888' }])
  })

  it('"same as previous" copies the resolved value into the payload, not a stale field', () => {
    const dana = minorRow({ firstName: 'דנה', otherFullName: 'דוד כהן', otherNationalId: '100000041' })
    const yossi = minorRow({ firstName: 'יוסי', sameAsPrevious: true, otherFullName: 'ignored' })
    const payload = toJoinFamilyPayload('מיכל כהן', { ...baseState, rows: [dana, yossi] }, TODAY)
    expect(payload.children[1]?.other_parent?.first_name).toBe('דוד')
  })
})

describe('weeklyVolumeForGroups', () => {
  const groups = [
    { id: 'g1', weekdays: [0, 2] },
    { id: 'g2', weekdays: [4] },
  ]

  it('sums the weekday counts of the chosen groups', () => {
    expect(weeklyVolumeForGroups([], groups)).toBe(0)
    expect(weeklyVolumeForGroups(['g1'], groups)).toBe(2)
    expect(weeklyVolumeForGroups(['g1', 'g2'], groups)).toBe(3)
  })

  it('ignores an unknown group id rather than throwing', () => {
    expect(weeklyVolumeForGroups(['does-not-exist'], groups)).toBe(0)
  })
})

describe('coveringPlans / preselectedPlanId', () => {
  const plans: PlanOption[] = [
    { id: 'small', name: 'פעם בשבוע', monthlyAmountAgorot: 15_000, sessionsPerWeek: 1 },
    { id: 'cheap-cover', name: 'זול', monthlyAmountAgorot: 20_000, sessionsPerWeek: 2 },
    { id: 'pricier-cover', name: 'יקר', monthlyAmountAgorot: 30_000, sessionsPerWeek: 3 },
    { id: 'open', name: 'פתוח', monthlyAmountAgorot: 80_000, sessionsPerWeek: null },
  ]

  it('is empty when nothing is chosen yet (volume 0)', () => {
    expect(coveringPlans(0, plans)).toEqual([])
    expect(preselectedPlanId(0, plans)).toBeNull()
  })

  it('offers only plans whose sessions_per_week covers the volume, plus any open plan', () => {
    const covering = coveringPlans(2, plans)
    expect(covering.map((plan) => plan.id)).toEqual(['cheap-cover', 'pricier-cover', 'open'])
  })

  it('preselects the cheapest covering plan', () => {
    expect(preselectedPlanId(2, plans)).toBe('cheap-cover')
  })

  it('falls back to whatever open plan exists when nothing sized covers the volume', () => {
    expect(preselectedPlanId(10, plans)).toBe('open')
  })

  it('is null when nothing at all covers the volume', () => {
    const noOpenPlan = plans.filter((plan) => plan.sessionsPerWeek !== null)
    expect(preselectedPlanId(10, noOpenPlan)).toBeNull()
  })
})

// -- wave E: decision 8's trial field set --------------------------------------
describe('trial field set', () => {
  function trialRow(overrides: Partial<SubjectRow> = {}): SubjectRow {
    return {
      ...emptySubjectRow('child', false, 'trial'),
      firstName: 'נועה כהן',
      birthdate: '2019-04-01',
      groupIds: ['g1'],
      ...overrides,
    }
  }

  it('emptySubjectRow defaults to the member field set, and trial is opt-in', () => {
    expect(emptySubjectRow('child').fieldSet).toBe('member')
    expect(emptySubjectRow('child', false, 'trial').fieldSet).toBe('trial')
  })

  it('a trial row is valid with only a name, a birthdate and a group -- no ת.ז., no address', () => {
    const valid = { ...baseState, rows: [trialRow()] }
    expect(familyFormValid(valid, TODAY, { requireSignerDetails: false })).toBe(true)
  })

  it('a trial row needs no national id, grade or second-parent details to be valid', () => {
    const row = trialRow({ birthdate: '2016-01-01' }) // a minor by age, same as minorRow()
    expect(row.nationalId).toBe('')
    expect(row.grade).toBe('')
    const state = { ...baseState, rows: [row] }
    expect(familyFormValid(state, TODAY, { requireSignerDetails: false })).toBe(true)
  })

  it('still requires a name, a birthdate and at least one group', () => {
    const state = { ...baseState, rows: [trialRow({ firstName: '' })] }
    expect(familyFormValid(state, TODAY, { requireSignerDetails: false })).toBe(false)
    expect(
      familyFormValid({ ...baseState, rows: [trialRow({ birthdate: '' })] }, TODAY, {
        requireSignerDetails: false,
      }),
    ).toBe(false)
    expect(
      familyFormValid({ ...baseState, rows: [trialRow({ groupIds: [] })] }, TODAY, {
        requireSignerDetails: false,
      }),
    ).toBe(false)
  })

  it('requireSignerDetails: false skips the signer ת.ז./address/city/phone checks entirely (Door D)', () => {
    const state = {
      signerNationalId: '',
      address: '',
      city: '',
      phone: '',
      relation: 'mother' as const,
      rows: [
        { ...emptySubjectRow('child'), firstName: 'א', birthdate: '2016-01-01', nationalId: '100000009', grade: 'ד', groupIds: ['g1'] },
      ],
    }
    expect(familyFormValid(state, TODAY, { requireSignerDetails: false })).toBe(true)
    expect(familyFormValid(state, TODAY)).toBe(false) // default still requires them
  })

  it('an adult trial self-row needs only a group -- decision 9, no children-only step', () => {
    const self = { ...emptySubjectRow('self', false, 'trial'), groupIds: ['g1'] }
    const state = { ...baseState, rows: [self] }
    expect(familyFormValid(state, TODAY, { requireSignerDetails: false })).toBe(true)
  })
})

describe('toJoinFamilyPayload excludes trial rows', () => {
  it('a mixed member+trial submission sends only the member rows to the member shape', () => {
    const member = minorRow({ firstName: 'דנה' })
    const trial = {
      ...emptySubjectRow('child', false, 'trial' as const),
      firstName: 'יוסי',
      birthdate: '2019-01-01',
      groupIds: ['g1'],
    }
    const payload = toJoinFamilyPayload('מיכל כהן', { ...baseState, rows: [member, trial] }, TODAY)
    expect(payload.children).toHaveLength(1)
    expect(payload.children[0]?.first_name).toBe('דנה')
  })
})

describe('toTrialChildPayloads', () => {
  it('extracts only the trial rows, one group and one slot each, splitting the full name', () => {
    const member = minorRow({ firstName: 'דנה' })
    const trial = {
      ...emptySubjectRow('child', false, 'trial' as const),
      firstName: 'יוסי כהן',
      birthdate: '2019-01-01',
      groupIds: ['g1'],
      sessionId: 's1',
    }
    const payloads = toTrialChildPayloads([member, trial])
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toEqual({
      first_name: 'יוסי',
      last_name: 'כהן',
      birthdate: '2019-01-01',
      group_id: 'g1',
      session_id: 's1',
    })
  })

  it('a trial self row reuses the contact name it was given, never asks twice', () => {
    const self = {
      ...emptySubjectRow('self', false, 'trial' as const),
      groupIds: ['g1'],
      sessionId: null,
    }
    const payloads = toTrialChildPayloads([self], { firstName: 'רותי', lastName: 'מזרחי' })
    expect(payloads[0]).toMatchObject({ first_name: 'רותי', last_name: 'מזרחי', session_id: null })
  })
})
