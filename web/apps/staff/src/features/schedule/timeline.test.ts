// The seam behind the restyled card: sessions and events merged into one ordered list, and
// the four-colour rule stated in the module's own header. Pure functions, tested directly —
// no React here, and `TodayScreen.test.tsx` covers the render on top of these.
import { describe, expect, it } from 'vitest'
import type { RosterRow } from '@studio/core'
import { confirmationCounts, mergeTimeline, timelineStates } from './timeline'
import type { SessionRow } from './client'
import type { EventOut } from '../events/client'

const sessionBase = {
  group_id: 'g1',
  group_name: 'מתחילים',
  training_year_id: 'y1',
  location_id: null,
  location_name: 'אולם א׳',
  cancel_reason: null,
  is_manually_edited: false,
  is_ad_hoc: false,
  headcount: 10,
  staff: [],
}

function session(
  overrides: Partial<SessionRow> & { id: string; starts_at: string; ends_at: string },
): SessionRow {
  return { ...sessionBase, status: 'scheduled', attendance_taken: false, ...overrides }
}

const eventBase = {
  title: 'תחרות אזורית',
  description: null,
  location_id: null,
  location_text: 'היכל הספורט',
  requires_consent: false,
  consent_text: null,
  consent_signed_count: 0,
  rsvp_deadline: null,
  rsvp_yes_count: 0,
  rsvp_no_count: 0,
  rsvp_pending_count: 0,
  fee_agorot: null,
  type: 'competition' as const,
  status: 'published' as const,
}

function event(overrides: Partial<EventOut> & { id: string; starts_at: string }): EventOut {
  return { ...eventBase, ends_at: null, ...overrides }
}

const DAY = '2026-11-03'

describe('mergeTimeline', () => {
  it('orders a session and an event on the same day by start time', () => {
    const items = mergeTimeline(
      [session({ id: 's1', starts_at: '2026-11-03T16:00:00Z', ends_at: '2026-11-03T17:00:00Z' })],
      [event({ id: 'e1', starts_at: '2026-11-03T14:00:00Z' })],
      DAY,
    )
    expect(items.map((item) => item.id)).toEqual(['e1', 's1'])
    expect(items.map((item) => item.kind)).toEqual(['event', 'session'])
  })

  it('drops a session or event that falls on a different studio day', () => {
    const items = mergeTimeline(
      [session({ id: 's1', starts_at: '2026-11-04T16:00:00Z', ends_at: '2026-11-04T17:00:00Z' })],
      [event({ id: 'e1', starts_at: '2026-11-02T14:00:00Z' })],
      DAY,
    )
    expect(items).toHaveLength(0)
  })

  it('files a late-evening session under the studio day it actually falls on', () => {
    // 22:30Z on 3 November is already 4 November in Jerusalem — the same trap TodayScreen
    // itself guards against for the day strip.
    const items = mergeTimeline(
      [session({ id: 'late', starts_at: '2026-11-03T22:30:00Z', ends_at: '2026-11-03T23:30:00Z' })],
      [],
      '2026-11-04',
    )
    expect(items.map((item) => item.id)).toEqual(['late'])
  })
})

describe('timelineStates', () => {
  const NOW = '2026-11-03T15:30:00Z'

  it('marks an ended session with no register closed as pendingClose', () => {
    const items = mergeTimeline(
      [session({ id: 's1', starts_at: '2026-11-03T14:00:00Z', ends_at: '2026-11-03T15:00:00Z' })],
      [],
      DAY,
    )
    expect(timelineStates(items, NOW)).toEqual(['pendingClose'])
  })

  it('marks an ended, already-closed session as later — neutral, nothing owed', () => {
    const items = mergeTimeline(
      [
        session({
          id: 's1',
          starts_at: '2026-11-03T14:00:00Z',
          ends_at: '2026-11-03T15:00:00Z',
          attendance_taken: true,
        }),
      ],
      [],
      DAY,
    )
    expect(timelineStates(items, NOW)).toEqual(['later'])
  })

  it('marks the session in progress as activeNow', () => {
    const items = mergeTimeline(
      [session({ id: 's1', starts_at: '2026-11-03T15:00:00Z', ends_at: '2026-11-03T16:00:00Z' })],
      [],
      DAY,
    )
    expect(timelineStates(items, NOW)).toEqual(['activeNow'])
  })

  it('gives the FIRST upcoming item nextUp and every later one later — the rule the prototype lacks', () => {
    const items = mergeTimeline(
      [
        session({ id: 'a', starts_at: '2026-11-03T16:00:00Z', ends_at: '2026-11-03T17:00:00Z' }),
        session({ id: 'b', starts_at: '2026-11-03T18:00:00Z', ends_at: '2026-11-03T19:00:00Z' }),
        session({ id: 'c', starts_at: '2026-11-03T20:00:00Z', ends_at: '2026-11-03T21:00:00Z' }),
      ],
      [],
      DAY,
    )
    expect(timelineStates(items, NOW)).toEqual(['nextUp', 'later', 'later'])
  })

  it('an event with no ends_at is never activeNow — only ended or upcoming', () => {
    const upcoming = mergeTimeline([], [event({ id: 'e1', starts_at: '2026-11-03T16:00:00Z' })], DAY)
    expect(timelineStates(upcoming, NOW)).toEqual(['nextUp'])

    const ended = mergeTimeline([], [event({ id: 'e1', starts_at: '2026-11-03T14:00:00Z' })], DAY)
    expect(timelineStates(ended, NOW)).toEqual(['later'])
  })

  it('an event never gets pendingClose — that state only exists for a session', () => {
    const items = mergeTimeline([], [event({ id: 'e1', starts_at: '2026-11-03T14:00:00Z' })], DAY)
    expect(timelineStates(items, NOW)).toEqual(['later'])
  })

  it('a cancelled session is always later, and never consumes the nextUp slot', () => {
    const items = mergeTimeline(
      [
        session({
          id: 'cancelled',
          starts_at: '2026-11-03T16:00:00Z',
          ends_at: '2026-11-03T17:00:00Z',
          status: 'cancelled',
        }),
        session({ id: 'real-next', starts_at: '2026-11-03T18:00:00Z', ends_at: '2026-11-03T19:00:00Z' }),
      ],
      [],
      DAY,
    )
    expect(timelineStates(items, NOW)).toEqual(['later', 'nextUp'])
  })
})

describe('confirmationCounts', () => {
  const row = (overrides: Partial<RosterRow> = {}): RosterRow => ({
    student_id: 'st-1',
    display_name: 'ילד',
    belt_color_hex: null,
    belt_name: null,
    health_status: 'missing',
    derived_flags: {},
    status: 'unmarked',
    source: null,
    has_absence_report: false,
    absence_reason: null,
    ...overrides,
  })

  it('counts confirmed and not-yet-answered separately from a declined absence', () => {
    const roster = [
      row({ student_id: '1', has_confirmation: true }),
      row({ student_id: '2', has_confirmation: true }),
      row({ student_id: '3', has_absence_report: true }),
      row({ student_id: '4' }),
      row({ student_id: '5' }),
    ]
    expect(confirmationCounts(roster)).toEqual({ total: 5, confirmed: 2, notAnswered: 2 })
  })

  it('treats a roster row from before has_confirmation existed as not confirmed, not a crash', () => {
    const roster = [row({ student_id: '1' })]
    expect(confirmationCounts(roster)).toEqual({ total: 1, confirmed: 0, notAnswered: 1 })
  })

  it('returns zeroes for an undefined roster — no cached data yet, not an error', () => {
    expect(confirmationCounts(undefined)).toEqual({ total: 0, confirmed: 0, notAnswered: 0 })
  })
})
