// Pure-derivation tests for the birthday section — mirrors `deriveTasks.test.ts`'s own
// shape (a slightly different snapshot of the same fixture per test, never a mutation of
// stored state, because there is nothing stored).
import { describe, expect, it } from 'vitest'
import type { StudentSummary } from '../people'
import { upcomingBirthdays } from './deriveBirthdays'

const NOW = '2026-11-03T18:00:00Z' // 2026-11-03, studio time (Asia/Jerusalem, UTC+2 in November)

function student(overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: 'st1',
    person_id: 'p1',
    first_name: 'נועה',
    last_name: 'לוי',
    birthdate: null,
    health_status: 'signed',
    joined_on: null,
    left_on: null,
    status: 'active',
    ...overrides,
  }
}

describe('upcomingBirthdays', () => {
  it('surfaces a student whose birthday is today', () => {
    const rows = upcomingBirthdays([student({ birthdate: '2015-11-03' })], NOW, 'he')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.isToday).toBe(true)
    expect(rows[0]!.turningAge).toBe(11)
  })

  it('surfaces a student whose birthday is later this same week', () => {
    const rows = upcomingBirthdays([student({ birthdate: '2010-11-08' })], NOW, 'he')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.isToday).toBe(false)
    expect(rows[0]!.daysUntil).toBe(5)
  })

  it('excludes a birthday that already passed this week — the prototype mixed those in, real data does not', () => {
    const rows = upcomingBirthdays([student({ birthdate: '2015-11-01' })], NOW, 'he')
    expect(rows).toHaveLength(0)
  })

  it('excludes a birthday more than a week out', () => {
    const rows = upcomingBirthdays([student({ birthdate: '2015-01-15' })], NOW, 'he')
    expect(rows).toHaveLength(0)
  })

  it('rolls a birthday early in the year into "this week" from late December — the year-boundary case', () => {
    const lateDecember = '2026-12-29T12:00:00Z'
    const rows = upcomingBirthdays([student({ birthdate: '2012-01-02' })], lateDecember, 'he')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.daysUntil).toBe(4)
    // The age this birthday turns them is next year's, not this one's.
    expect(rows[0]!.turningAge).toBe(15)
  })

  it('has no birthdate on file — silently excluded, not raised as a gap', () => {
    const rows = upcomingBirthdays([student({ birthdate: null })], NOW, 'he')
    expect(rows).toHaveLength(0)
  })

  it('sorts soonest first', () => {
    const rows = upcomingBirthdays(
      [
        student({ id: 'a', birthdate: '2010-11-07' }),
        student({ id: 'b', birthdate: '2010-11-03' }),
        student({ id: 'c', birthdate: '2010-11-05' }),
      ],
      NOW,
      'he',
    )
    expect(rows.map((row) => row.studentId)).toEqual(['b', 'c', 'a'])
  })

  it('falls back to a "no group" sentence rather than a blank line', () => {
    const rows = upcomingBirthdays([student({ birthdate: '2015-11-03', group_names: [] })], NOW, 'he')
    expect(rows[0]!.groupLabel).not.toBe('')
  })

  it('joins multiple groups rather than picking one', () => {
    const rows = upcomingBirthdays(
      [student({ birthdate: '2015-11-03', group_names: ['נבחרת נוער', 'תחרותי'] })],
      NOW,
      'he',
    )
    expect(rows[0]!.groupLabel).toBe('נבחרת נוער · תחרותי')
  })

  it('a February 29 birthdate in a non-leap year falls back a day rather than rolling into March', () => {
    const lateFebruary = '2027-02-25T12:00:00Z' // 2027 is not a leap year — no February 29
    const rows = upcomingBirthdays([student({ birthdate: '2016-02-29' })], lateFebruary, 'he')
    expect(rows).toHaveLength(1)
    // Falls back to the 28th (3 days out from the 25th) rather than rolling into March,
    // which `Date` would otherwise do silently (Feb 29 + normalization = March 1).
    expect(rows[0]!.daysUntil).toBe(3)
    expect(rows[0]!.turningAge).toBe(11)
  })
})
