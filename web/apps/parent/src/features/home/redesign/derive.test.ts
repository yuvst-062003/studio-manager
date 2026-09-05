// The half of בית that a screenshot cannot check.
//
// Every case here is a way the screen could look completely correct and be wrong: a lesson
// filed under the previous day, a sibling silently dropped, an absence badge on the wrong
// child, a cancelled lesson reading as one the family called off themselves.
import { describe, expect, it } from 'vitest'
import {
  buildWeekStrip,
  childrenNeedingDeclaration,
  durationMinutesOf,
  expandSessions,
  familyNameOf,
  headlineFor,
  shiftDay,
  weekdayOf,
} from './derive'
import type { Lesson } from './derive'
import type { HomeChild } from './types'

const child = (id: string, firstName: string, groups: string[], belt = '#10b981'): HomeChild => ({
  id,
  firstName,
  displayName: `${firstName} כהן`,
  groupNames: groups,
  beltColorHex: belt,
  beltName: 'ירוקה',
})

const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: 'sess-1',
  groupName: 'קבוצה 2',
  startsAt: '2026-08-25T13:00:00Z',
  endsAt: '2026-08-25T14:15:00Z',
  locationName: 'אולם מרכזי',
  coachName: 'ולדי',
  status: 'scheduled',
  cancelReason: null,
  ...over,
})

const noReason = () => ''

describe('expandSessions — a lesson belongs to a group, not to a child', () => {
  it('gives two siblings in one group a row each, keyed on the pair the server stores', () => {
    // The defect this rules out: `ParentHome` names the FIRST matching child, so the
    // second child in a group could never be asked about. The redesign draws a card each.
    const rows = expandSessions(
      [lesson()],
      [child('c1', 'דנה', ['קבוצה 2']), child('c2', 'יוסי', ['קבוצה 2'])],
      {},
      noReason,
    )
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.studentId)).toEqual(['c1', 'c2'])
    // Same lesson — so the id repeats, and the React key cannot be it alone.
    expect(new Set(rows.map((r) => r.id))).toEqual(new Set(['sess-1']))
  })

  it('drops a lesson no child of the family is in, rather than showing it unattributed', () => {
    const rows = expandSessions([lesson()], [child('c1', 'דנה', ['קבוצה 5'])], {}, noReason)
    expect(rows).toEqual([])
  })

  it('marks only the child the absence was reported for', () => {
    const rows = expandSessions(
      [lesson()],
      [child('c1', 'דנה', ['קבוצה 2']), child('c2', 'יוסי', ['קבוצה 2'])],
      { 'sess-1:c2': 'not_coming' },
      noReason,
    )
    expect(rows.find((r) => r.studentId === 'c1')!.reportedAbsent).toBe(false)
    expect(rows.find((r) => r.studentId === 'c2')!.reportedAbsent).toBe(true)
  })

  it('does not read "coming" as an absence — the two answers are not opposites of one flag', () => {
    const rows = expandSessions([lesson()], [child('c1', 'דנה', ['קבוצה 2'])], { 'sess-1:c1': 'coming' }, noReason)
    expect(rows[0]!.reportedAbsent).toBe(false)
  })

  it('carries a cancellation as its own state, never as an absence', () => {
    const rows = expandSessions(
      [lesson({ status: 'cancelled', cancelReason: 'system:closure' })],
      [child('c1', 'דנה', ['קבוצה 2'])],
      {},
      () => 'המועדון סגור',
    )
    expect(rows[0]!.cancelledReason).toBe('המועדון סגור')
    expect(rows[0]!.reportedAbsent).toBe(false)
  })

  it('sorts by time, and breaks a tie by name so the order is not the roster’s accident', () => {
    const rows = expandSessions(
      [lesson({ id: 'late', startsAt: '2026-08-25T16:00:00Z' }), lesson({ id: 'early' })],
      [child('c2', 'יוסי', ['קבוצה 2']), child('c1', 'דנה', ['קבוצה 2'])],
      {},
      noReason,
    )
    expect(rows.map((r) => `${r.id}:${r.studentName}`)).toEqual([
      'early:דנה כהן',
      'early:יוסי כהן',
      'late:דנה כהן',
      'late:יוסי כהן',
    ])
  })
})

describe('the studio day, not the UTC day', () => {
  it('files a late-evening lesson under the Jerusalem day it falls on', () => {
    // 22:30Z on 14 March is already 15 March in Jerusalem, and in a judo club almost every
    // class is in the evening. Grouping by the UTC date would file it a day early.
    const rows = expandSessions(
      [lesson({ startsAt: '2026-03-14T22:30:00Z', endsAt: '2026-03-14T23:30:00Z' })],
      [child('c1', 'דנה', ['קבוצה 2'])],
      {},
      noReason,
    )
    const strip = buildWeekStrip('2026-03-15', rows)
    expect(strip.find((d) => d.dayKey === '2026-03-15')!.hasSessions).toBe(true)
    expect(strip.find((d) => d.dayKey === '2026-03-14')!.hasSessions).toBe(false)
  })

  it('reads a weekday from a day key without the midnight slip', () => {
    // 2026-08-25 is a Tuesday. Parsed at midnight UTC this is still Monday in any
    // negative-offset zone the test runner might sit in.
    expect(weekdayOf('2026-08-25')).toBe(2)
    expect(weekdayOf('2026-08-23')).toBe(0)
  })

  it('shifts across a month boundary', () => {
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31')
  })
})

describe('buildWeekStrip', () => {
  it('puts today third, with two days behind and four ahead', () => {
    const strip = buildWeekStrip('2026-08-23', [])
    expect(strip).toHaveLength(7)
    expect(strip.map((d) => d.dayOfMonth)).toEqual([21, 22, 23, 24, 25, 26, 27])
    expect(strip.findIndex((d) => d.isToday)).toBe(2)
  })

  it('marks exactly the days the family actually trains', () => {
    const rows = expandSessions([lesson()], [child('c1', 'דנה', ['קבוצה 2'])], {}, noReason)
    const strip = buildWeekStrip('2026-08-23', rows)
    expect(strip.filter((d) => d.hasSessions).map((d) => d.dayKey)).toEqual(['2026-08-25'])
  })
})

describe('headlineFor', () => {
  it('prints the prototype’s own headline shape', () => {
    expect(headlineFor('2026-08-25')).toBe('יום ג׳ • 25 באוגוסט 2026')
  })
})

describe('durationMinutesOf', () => {
  it('measures the lesson', () => {
    const [row] = expandSessions([lesson()], [child('c1', 'דנה', ['קבוצה 2'])], {}, noReason)
    expect(durationMinutesOf(row!)).toBe(75)
  })

  it('is null with no end, rather than 0 — which would print "0 דק׳"', () => {
    const [row] = expandSessions([lesson({ endsAt: null })], [child('c1', 'דנה', ['קבוצה 2'])], {}, noReason)
    expect(durationMinutesOf(row!)).toBeNull()
  })
})

describe('familyNameOf', () => {
  it('names the household when every child shares a surname', () => {
    expect(familyNameOf(['כהן', 'כהן'])).toBe('כהן')
  })

  it('refuses to name a household with two surnames', () => {
    // Guessing from the first child would put one parent's name on the other's phone.
    expect(familyNameOf(['כהן', 'לוי'])).toBeNull()
  })

  it('refuses on no children, and ignores blanks', () => {
    expect(familyNameOf([])).toBeNull()
    expect(familyNameOf(['', 'כהן'])).toBe('כהן')
  })
})

describe('the card names the child in full', () => {
  it('uses the display name, which is what the prototype prints on a card', () => {
    const rows = expandSessions([lesson()], [child('c1', 'דנה', ['קבוצה 2'])], {}, noReason)
    expect(rows[0]!.studentName).toBe('דנה כהן')
  })
})

describe('childrenNeedingDeclaration', () => {
  it('returns first names, in roster order, for the banner to name', () => {
    const kids = [child('c1', 'דנה', []), child('c2', 'נועה', []), child('c3', 'יוסי', [])]
    expect(childrenNeedingDeclaration(kids, (c) => c.id !== 'c1')).toEqual(['נועה', 'יוסי'])
  })
})
