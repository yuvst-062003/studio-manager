// "The same family paid with cheques for one child and cash for the other" (owner,
// 2026-10-14). A payment row is one payer and one method, so this is two rows — and the
// screen's job is to make it one press, not to pretend it is one row.
import { describe, expect, it } from 'vitest'
import { DEFAULT_METHOD, groupByChild, planPayments } from './splitByMethod'
import type { OpenCharge } from './cashClient'

const charge = (over: Partial<OpenCharge> & { id: string }): OpenCharge => ({
  payer_person_id: 'p-1',
  student_id: 's-1',
  kind: 'tuition',
  period_year: 2026,
  period_month: 9,
  amount_agorot: 30000,
  allocated_agorot: 0,
  due_date: '2026-09-01',
  status: 'open',
  ...over,
})

const NAMES = new Map([
  ['s-1', 'ליאון טמיר'],
  ['s-2', 'לביא טמיר'],
])

describe('planPayments', () => {
  it('writes one payment per method, not one per charge', () => {
    const plan = planPayments(
      [
        charge({ id: 'c-1', student_id: 's-1', amount_agorot: 27500 }),
        charge({ id: 'c-2', student_id: 's-1', amount_agorot: 55000 }),
        charge({ id: 'c-3', student_id: 's-2', amount_agorot: 30000 }),
        charge({ id: 'c-4', student_id: 's-2', amount_agorot: 30000 }),
      ],
      new Map([
        ['s-1', 'cheque'],
        ['s-2', 'cash'],
      ]),
      NAMES,
    )

    expect(plan).toHaveLength(2)
    expect(plan.map((line) => line.method)).toEqual(['cash', 'cheque'])
    expect(plan.find((line) => line.method === 'cheque')).toMatchObject({
      amountAgorot: 82500,
      chargeIds: ['c-1', 'c-2'],
      childNames: ['ליאון טמיר'],
    })
    expect(plan.find((line) => line.method === 'cash')).toMatchObject({
      amountAgorot: 60000,
      chargeIds: ['c-3', 'c-4'],
    })
  })

  it('stays one payment when the family pays one way', () => {
    const plan = planPayments(
      [charge({ id: 'c-1', student_id: 's-1' }), charge({ id: 'c-2', student_id: 's-2' })],
      new Map([
        ['s-1', 'cash'],
        ['s-2', 'cash'],
      ]),
      NAMES,
    )

    expect(plan).toHaveLength(1)
    expect(plan[0]!.chargeIds).toEqual(['c-1', 'c-2'])
    expect(plan[0]!.childNames).toEqual(['ליאון טמיר', 'לביא טמיר'])
  })

  it('counts what is LEFT of a part-paid charge', () => {
    const plan = planPayments(
      [charge({ id: 'c-1', amount_agorot: 30000, allocated_agorot: 10000 })],
      new Map([['s-1', 'cash']]),
      NAMES,
    )
    expect(plan[0]!.amountAgorot).toBe(20000)
  })

  it('an override puts everything on one method — the evening beats the records', () => {
    const plan = planPayments(
      [charge({ id: 'c-1', student_id: 's-1' }), charge({ id: 'c-2', student_id: 's-2' })],
      new Map([
        ['s-1', 'cheque'],
        ['s-2', 'cash'],
      ]),
      NAMES,
      'standing_order',
    )

    expect(plan).toHaveLength(1)
    expect(plan[0]!.method).toBe('standing_order')
    expect(plan[0]!.chargeIds).toEqual(['c-1', 'c-2'])
  })

  it('falls back to cash for a child nobody has been asked about', () => {
    const plan = planPayments([charge({ id: 'c-1' })], new Map([['s-1', null]]), NAMES)
    expect(plan[0]!.method).toBe(DEFAULT_METHOD)
  })

  it('never plans a card — uPay records those itself and the server refuses them here', () => {
    const plan = planPayments([charge({ id: 'c-1' })], new Map([['s-1', 'upay_card']]), NAMES)
    expect(plan[0]!.method).toBe('cash')
  })

  it('handles a charge with no child on it, like a manual charge against the payer', () => {
    const plan = planPayments([charge({ id: 'c-1', student_id: null })], new Map(), NAMES)
    expect(plan).toHaveLength(1)
    expect(plan[0]!.childNames).toEqual([])
  })
})

describe('groupByChild', () => {
  it('groups a family by child, each with the method that child is on', () => {
    const groups = groupByChild(
      [
        charge({ id: 'c-1', student_id: 's-2' }),
        charge({ id: 'c-2', student_id: 's-1' }),
        charge({ id: 'c-3', student_id: 's-1' }),
      ],
      NAMES,
      new Map([
        ['s-1', 'cheque'],
        ['s-2', 'cash'],
      ]),
    )

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.name)).toEqual(['לביא טמיר', 'ליאון טמיר'])
    expect(groups[1]!.method).toBe('cheque')
    expect(groups[1]!.charges.map((row) => row.id)).toEqual(['c-2', 'c-3'])
  })

  it('puts charges with no child last, where they read as the family\'s own', () => {
    const groups = groupByChild(
      [charge({ id: 'c-1', student_id: null }), charge({ id: 'c-2', student_id: 's-1' })],
      NAMES,
      new Map([['s-1', 'cash']]),
    )
    expect(groups.at(-1)!.studentId).toBeNull()
  })
})
