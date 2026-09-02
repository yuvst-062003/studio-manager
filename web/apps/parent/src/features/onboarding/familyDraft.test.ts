import { describe, expect, it } from 'vitest'
import { emptySubjectRow, familyFormValid, hasSharedMinors, toJoinFamilyPayload } from './familyDraft'

const baseState = {
  signerNationalId: '100000017',
  address: 'הרצל 12',
  city: 'רעננה',
  phone: '0548123456',
  otherFullName: '',
  otherNationalId: '',
  relation: 'mother' as const,
}

describe('familyFormValid', () => {
  it('is invalid with zero subject rows', () => {
    expect(familyFormValid({ ...baseState, rows: [] })).toBe(false)
  })

  it('is valid with one self row that has a group, and nothing else required', () => {
    const row = { ...emptySubjectRow('self'), groupIds: ['g1'] }
    expect(familyFormValid({ ...baseState, rows: [row] })).toBe(true)
  })

  it('is invalid when the signer fields are incomplete, even with a valid row', () => {
    const row = { ...emptySubjectRow('self'), groupIds: ['g1'] }
    expect(familyFormValid({ ...baseState, address: '', rows: [row] })).toBe(false)
    expect(familyFormValid({ ...baseState, signerNationalId: '123456789', rows: [row] })).toBe(
      false,
    )
  })

  it('requires name, birthdate, national id and grade on a child row regardless of the 18+ answer', () => {
    const incomplete = { ...emptySubjectRow('child'), groupIds: ['g1'], isAdult: true }
    expect(familyFormValid({ ...baseState, rows: [incomplete] })).toBe(false)

    const complete = {
      ...incomplete,
      firstName: 'דנה',
      birthdate: '2005-01-01',
      nationalId: '100000009',
      grade: '',
    }
    // even an adult "child" row still needs a grade -- required_registration_fields
    // only drops it for a self-guarding student, which this is not.
    expect(familyFormValid({ ...baseState, rows: [complete] })).toBe(false)
    expect(familyFormValid({ ...baseState, rows: [{ ...complete, grade: 'יב' }] })).toBe(true)
  })

  it('requires at least one group per row', () => {
    const row = {
      ...emptySubjectRow('child'),
      firstName: 'דנה',
      birthdate: '2016-01-01',
      nationalId: '100000009',
      grade: 'ד',
      groupIds: [],
    }
    expect(familyFormValid({ ...baseState, rows: [row] })).toBe(false)
  })

  it('rejects an invalid national id on a child row', () => {
    const row = {
      ...emptySubjectRow('child'),
      firstName: 'דנה',
      birthdate: '2016-01-01',
      nationalId: '123456789',
      grade: 'ד',
      groupIds: ['g1'],
    }
    expect(familyFormValid({ ...baseState, rows: [row] })).toBe(false)
  })

  it('requires the other-parent fields only when relation is "other" and a minor exists', () => {
    const minor = {
      ...emptySubjectRow('child'),
      firstName: 'דנה',
      birthdate: '2016-01-01',
      nationalId: '100000009',
      grade: 'ד',
      groupIds: ['g1'],
      isAdult: false,
    }
    expect(
      familyFormValid({ ...baseState, relation: 'other', rows: [minor] }),
    ).toBe(false)
    expect(
      familyFormValid({
        ...baseState,
        relation: 'other',
        otherFullName: 'יוסי כהן',
        otherNationalId: '100000025',
        rows: [minor],
      }),
    ).toBe(true)
  })
})

describe('hasSharedMinors', () => {
  it('is false with zero minor rows', () => {
    expect(hasSharedMinors([])).toBe(false)
    expect(hasSharedMinors([{ ...emptySubjectRow('child'), isAdult: true }])).toBe(false)
  })

  it('is true with one or more minor rows', () => {
    expect(hasSharedMinors([{ ...emptySubjectRow('child'), isAdult: false }])).toBe(true)
    expect(
      hasSharedMinors([
        { ...emptySubjectRow('child'), isAdult: false },
        { ...emptySubjectRow('child'), isAdult: false },
      ]),
    ).toBe(true)
  })
})

describe('toJoinFamilyPayload', () => {
  it('maps a self row to a self_student child with no birthdate/national_id/grade', () => {
    const row = { ...emptySubjectRow('self'), groupIds: ['g1'] }
    const payload = toJoinFamilyPayload('מיכל כהן', { ...baseState, rows: [row] })
    expect(payload.children).toEqual([
      {
        first_name: 'מיכל',
        last_name: 'כהן',
        birthdate: null,
        group_ids: ['g1'],
        self_student: true,
        national_id: null,
        grade: null,
      },
    ])
    expect(payload.signer.national_id).toBe('100000017')
  })

  it('maps a child row with all its fields, and omits pickup/other-parent when no minor exists', () => {
    const row = {
      ...emptySubjectRow('child'),
      firstName: 'דנה כהן',
      birthdate: '2016-03-14',
      nationalId: '100000009',
      grade: 'ד',
      groupIds: ['g1'],
      isAdult: true,
    }
    const payload = toJoinFamilyPayload('מיכל כהן', { ...baseState, rows: [row] })
    expect(payload.children).toEqual([
      {
        first_name: 'דנה',
        last_name: 'כהן',
        birthdate: '2016-03-14',
        group_ids: ['g1'],
        self_student: false,
        national_id: '100000009',
        grade: 'ד',
      },
    ])
    expect(payload.other_parent).toBeNull()
    expect(payload.pickup_contacts).toEqual([])
  })
})
