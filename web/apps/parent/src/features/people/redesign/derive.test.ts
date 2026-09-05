// A percentage is the one number on this screen a parent will quote back at the club, so
// the way it is counted is the thing worth pinning down.
import { describe, expect, it } from 'vitest'
import { coverageFrom, familyNameOf, purchasesFrom, summariseAttendance } from './derive'
import { whatsappNumber } from './ContactSheet'
import type { AttendanceRow } from './derive'
import type { ProfileChild } from './types'

const child = (id: string, firstName: string): ProfileChild => ({
  id,
  firstName,
  lastName: 'כהן',
  displayName: `${firstName} כהן`,
  beltName: 'ירוקה',
  beltColorHex: '#10b981',
  groupNames: [],
  attendancePercent: null,
  needsDeclaration: false,
})

const row = (studentId: string, status: string, id = Math.random().toString()): AttendanceRow => ({
  student_id: studentId,
  session_id: id,
  group_name: 'קבוצה 2',
  starts_at: '2026-08-25T13:00:00Z',
  status,
})

describe('summariseAttendance — an unmarked register is not an absence', () => {
  it('leaves unmarked sessions out of the denominator entirely', () => {
    // The defect this rules out: a coach who has not marked Tuesday yet would push a
    // family's percentage down, and it would drift back up on its own days later.
    const rows = [row('c1', 'present'), row('c1', 'present'), row('c1', 'unmarked')]
    const [summary] = summariseAttendance(rows, [child('c1', 'דנה')])
    expect(summary).toEqual({ studentId: 'c1', attended: 2, marked: 2, percent: 100 })
  })

  it('counts both kinds of absence against the child', () => {
    const rows = [
      row('c1', 'present'),
      row('c1', 'absent_excused'),
      row('c1', 'absent_unexcused'),
      row('c1', 'present'),
    ]
    const [summary] = summariseAttendance(rows, [child('c1', 'דנה')])
    expect(summary).toMatchObject({ attended: 2, marked: 4, percent: 50 })
  })

  it('is 0 and not NaN for a child with nothing marked', () => {
    const [summary] = summariseAttendance([row('c1', 'unmarked')], [child('c1', 'דנה')])
    expect(summary).toEqual({ studentId: 'c1', attended: 0, marked: 0, percent: 0 })
  })

  it('keeps each child’s rows to that child', () => {
    const rows = [row('c1', 'present'), row('c2', 'absent_unexcused'), row('c2', 'present')]
    const summaries = summariseAttendance(rows, [child('c1', 'דנה'), child('c2', 'יוסי')])
    expect(summaries).toEqual([
      { studentId: 'c1', attended: 1, marked: 1, percent: 100 },
      { studentId: 'c2', attended: 1, marked: 2, percent: 50 },
    ])
  })

  it('rounds once, to a whole percent', () => {
    const rows = [row('c1', 'present'), row('c1', 'present'), row('c1', 'absent_excused')]
    const [summary] = summariseAttendance(rows, [child('c1', 'דנה')])
    expect(summary!.percent).toBe(67)
  })
})

describe('purchasesFrom', () => {
  const charge = (over: Partial<Parameters<typeof purchasesFrom>[0][number]> = {}) => ({
    id: 'ch1',
    label: 'גי',
    amount_agorot: 18_000,
    due_date: '2026-08-20',
    status: 'open',
    created_by: 'manual',
    ...over,
  })

  it('keeps only what the shop wrote — tuition is not a purchase', () => {
    // A family scanning what they BOUGHT should not read past twelve months of fees to
    // find a גי. §4.3: an item order is one `manual` charge per line.
    const rows = purchasesFrom([
      charge({ id: 'gi' }),
      charge({ id: 'tuition', created_by: 'billing_run', label: 'שכר לימוד' }),
      charge({ id: 'event', created_by: 'event', label: 'תחרות' }),
    ])
    expect(rows.map((r) => r.id)).toEqual(['gi'])
  })

  it('is newest first', () => {
    const rows = purchasesFrom([
      charge({ id: 'old', due_date: '2026-07-01' }),
      charge({ id: 'new', due_date: '2026-08-01' }),
    ])
    expect(rows.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('survives a charge with no label', () => {
    expect(purchasesFrom([charge({ label: null })])[0]!.label).toBe('')
  })
})

describe('familyNameOf', () => {
  it('names a household that shares a surname, and refuses one that does not', () => {
    expect(familyNameOf(['כהן', 'כהן'])).toBe('כהן')
    expect(familyNameOf(['כהן', 'לוי'])).toBeNull()
    expect(familyNameOf([])).toBeNull()
  })
})

describe('whatsappNumber — a stored number is not a wa.me number', () => {
  it('turns a local Israeli number into its international form', () => {
    // `wa.me` takes digits with a country code and no `+`. Sending the leading zero
    // produces "this number is not on WhatsApp" for a number that plainly is.
    expect(whatsappNumber('050-8492019')).toBe('972508492019')
    expect(whatsappNumber('(050) 849 2019')).toBe('972508492019')
  })

  it('leaves an already-international number alone', () => {
    expect(whatsappNumber('+972 50 849 2019')).toBe('972508492019')
    expect(whatsappNumber('972508492019')).toBe('972508492019')
  })

  it('refuses anything too short to be a number, so no button is drawn', () => {
    expect(whatsappNumber('12345')).toBeNull()
    expect(whatsappNumber('')).toBeNull()
    expect(whatsappNumber(null)).toBeNull()
  })
})

describe('coverageFrom — "am I sorted", not "charged vs paid"', () => {
  const tuition = (year: number, month: number, status = 'settled') => ({
    kind: 'tuition',
    status,
    period_year: year,
    period_month: month,
  })

  it('an open balance wins over any calendar', () => {
    // Telling a family "משולם עד יוני" above a debt is the app arguing with itself.
    expect(coverageFrom(32_000, 2, [tuition(2027, 6)])).toEqual({
      kind: 'owed',
      balanceAgorot: 32_000,
      openChargeCount: 2,
    })
  })

  it('finds the furthest month already settled — the cheque payer’s whole year', () => {
    const year = Array.from({ length: 10 }, (_, i) => tuition(2026, i + 9 > 12 ? i - 3 : i + 9))
    expect(coverageFrom(0, 0, year)).toMatchObject({ kind: 'covered' })
  })

  it('crosses a year boundary correctly', () => {
    expect(coverageFrom(0, 0, [tuition(2026, 12), tuition(2027, 1)])).toEqual({
      kind: 'covered',
      year: 2027,
      month: 1,
    })
    expect(coverageFrom(0, 0, [tuition(2027, 1), tuition(2026, 12)])).toEqual({
      kind: 'covered',
      year: 2027,
      month: 1,
    })
  })

  it('ignores an UNSETTLED month — being billed is not being covered', () => {
    expect(coverageFrom(0, 0, [tuition(2026, 9), tuition(2026, 10, 'open')])).toEqual({
      kind: 'covered',
      year: 2026,
      month: 9,
    })
  })

  it('ignores a settled registration fee or a shop item', () => {
    // A גי says nothing about which MONTHS of training are paid for.
    const rows = [
      { kind: 'registration', status: 'settled', period_year: 2027, period_month: 12 },
      { kind: 'manual', status: 'settled', period_year: 2027, period_month: 12 },
    ]
    expect(coverageFrom(0, 0, rows)).toEqual({ kind: 'settled' })
  })

  it('says only "nothing outstanding" when there is no settled tuition to point at', () => {
    expect(coverageFrom(0, 0, [])).toEqual({ kind: 'settled' })
  })
})
