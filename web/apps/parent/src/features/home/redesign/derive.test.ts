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
  expandEvents,
  headlineFor,
  mergeSchedule,
  monthGrid,
  monthOf,
  shiftDay,
  shiftMonth,
  weekdayOf,
} from './derive'
import type { FamilyEvent, Lesson } from './derive'
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
    expect(strip.find((d) => d.dayKey === '2026-03-15')!.sessionCount).toBe(1)
    expect(strip.find((d) => d.dayKey === '2026-03-14')!.sessionCount).toBe(0)
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
    expect(strip.filter((d) => d.sessionCount > 0).map((d) => d.dayKey)).toEqual(['2026-08-25'])
  })
})

describe('headlineFor', () => {
  it('prints the prototype’s own headline shape', () => {
    expect(headlineFor('2026-08-25', 'he')).toBe('יום ג׳ • 25 באוגוסט 2026')
  })

  it('and translates it, which the hard-coded month table it replaced could not', () => {
    // Russian declines the month after a day number — `августа`, not `август`. A key per
    // month would have shipped the nominative and read wrong every single day.
    expect(headlineFor('2026-08-25', 'ru')).toContain('августа')
    expect(headlineFor('2026-08-25', 'en')).toBe('Tue • August 25, 2026')
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

describe('monthGrid — the calendar modal cannot hardcode one month', () => {
  it('leads with the right number of blanks: August 2026 starts on a Saturday', () => {
    // The prototype writes six empty cells into the JSX for exactly this month. Saturday
    // is index 6, so six blanks — and the very next month has a different answer.
    const { leadingBlanks, cells } = monthGrid(2026, 8, [], '2026-08-23')
    expect(leadingBlanks).toBe(6)
    expect(cells).toHaveLength(31)
    expect(cells[0]!.dayKey).toBe('2026-08-01')
    expect(cells[30]!.dayKey).toBe('2026-08-31')
  })

  it('gets February right in a leap year and in a common one', () => {
    expect(monthGrid(2028, 2, [], '2028-01-01').cells).toHaveLength(29)
    expect(monthGrid(2026, 2, [], '2026-01-01').cells).toHaveLength(28)
  })

  it('marks the days the family trains, and today', () => {
    const rows = expandSessions([lesson()], [child('c1', 'דנה', ['קבוצה 2'])], {}, noReason)
    const { cells } = monthGrid(2026, 8, rows, '2026-08-23')
    expect(cells.filter((c) => c.hasSessions).map((c) => c.dayOfMonth)).toEqual([25])
    expect(cells.filter((c) => c.isToday).map((c) => c.dayOfMonth)).toEqual([23])
  })

  it('shifts months across a year boundary in both directions', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(monthOf('2026-08-25')).toEqual({ year: 2026, month: 8 })
  })
})

// -- §4: events beside the lessons ---------------------------------------------
describe('expandEvents', () => {
  const kids = [child('c1', 'נועה', ['מתחילים']), child('c2', 'דנה', ['מתקדמים'])]

  const event = (over: Partial<FamilyEvent> = {}): FamilyEvent => ({
    id: 'e1',
    title: 'אליפות המחוז',
    startsAt: '2026-08-25T15:00:00Z',
    endsAt: '2026-08-25T18:00:00Z',
    locationText: 'היכל הספורט, נתניה',
    studentId: 'c1',
    studentName: 'נועה כהן',
    rsvp: 'pending',
    ...over,
  })

  it('puts the event TITLE where a lesson puts its group name', () => {
    // An event has no group, and the title is the line a parent reads to know what the row
    // is. `coachName` stays null: an event has organisers, not a lead coach, and inventing
    // one would put a name on a card no table can back.
    const [row] = expandEvents([event()], kids, 'בוטל')
    expect(row!.kind).toBe('event')
    expect(row!.groupName).toBe('אליפות המחוז')
    expect(row!.locationName).toBe('היכל הספורט, נתניה')
    expect(row!.coachName).toBeNull()
  })

  it('does NOT fan out over the family, the way a group lesson does', () => {
    // The server has already resolved who is entered — one registration per entered child.
    // Fanning out would invite a parent to RSVP for a child the club never entered.
    expect(expandEvents([event()], kids, 'בוטל')).toHaveLength(1)
  })

  it('turns "pending" into no answer at all', () => {
    // `pending` is the ABSENCE of an answer. Rendered as a value it would read as though
    // the parent had chosen it.
    expect(expandEvents([event()], kids, 'בוטל')[0]!.rsvp).toBeNull()
    expect(expandEvents([event({ rsvp: 'yes' })], kids, 'בוטל')[0]!.rsvp).toBe('yes')
  })

  it('is never "reported absent", whatever the family answered', () => {
    // Declining an event is an RSVP, in a different table. A `no` that showed up as an
    // absence would land in the club's report for a lesson that never existed.
    expect(expandEvents([event({ rsvp: 'no' })], kids, 'בוטל')[0]!.reportedAbsent).toBe(false)
  })

  it('carries the child’s belt colour, so the card looks like the ones around it', () => {
    expect(expandEvents([event()], kids, 'בוטל')[0]!.beltColorHex).toBe(kids[0]!.beltColorHex)
  })

  it('says cancelled when the club calls the event off', () => {
    expect(expandEvents([event({ cancelled: true })], kids, 'בוטל')[0]!.cancelledReason).toBe('בוטל')
  })
})

describe('mergeSchedule', () => {
  it('interleaves events and lessons by time, not by kind', () => {
    // §4 asks for events "beside every other session". Two lists, or one list with the
    // events bolted on the end, is an event a parent scrolls past.
    const lessons = expandSessions(
      [lesson({ id: 's1', startsAt: '2026-08-25T16:00:00Z' })],
      [child('c1', 'נועה', ['קבוצה 2'])],
      {},
      noReason,
    )
    const events = expandEvents(
      [
        {
          id: 'e1',
          title: 'אליפות',
          startsAt: '2026-08-25T14:00:00Z',
          studentId: 'c1',
          studentName: 'נועה כהן',
          rsvp: 'pending',
        },
      ],
      [child('c1', 'נועה', ['קבוצה 2'])],
      'בוטל',
    )
    expect(mergeSchedule(lessons, events).map((row) => row.id)).toEqual(['e1', 's1'])
  })
})
