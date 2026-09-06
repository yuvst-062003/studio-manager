// Pure-derivation tests for §4.4's central rule: a task exists exactly as long as the
// state it was built from says it should, and vanishes the moment that state changes —
// never because something remembered it was done. Every test below rebuilds the list from
// a slightly different snapshot of the same underlying fixture rather than mutating a
// stored task, because there is no stored task to mutate.
import { describe, expect, it, vi } from 'vitest'
import type { RosterRow } from '@studio/core'
import type { SessionRow } from '../schedule/client'
import type { StaffPromiseRow } from '../billing/promiseClient'
import type { NotificationOut } from './tasksClient'
import {
  callParentTasks,
  cashPendingTasks,
  closeSessionTasks,
  healthReviewTasks,
  missingHealthFormTasks,
} from './deriveTasks'

const NOW = '2026-11-03T18:00:00Z'

const baseSession = {
  group_id: 'g1',
  training_year_id: 'y1',
  location_id: null,
  location_name: null,
  cancel_reason: null,
  is_manually_edited: false,
  is_ad_hoc: false,
  headcount: 10,
  staff: [],
} satisfies Partial<SessionRow>

function session(overrides: Partial<SessionRow>): SessionRow {
  return {
    ...baseSession,
    id: 's1',
    group_name: 'מתחילים',
    starts_at: '2026-11-03T15:00:00Z',
    ends_at: '2026-11-03T17:00:00Z',
    status: 'scheduled',
    attendance_taken: false,
    ...overrides,
  }
}

describe('closeSessionTasks — coach row 1', () => {
  it('surfaces a session that ended with attendance not taken', () => {
    const tasks = closeSessionTasks([session({ attendance_taken: false })], NOW, 'he')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.bucket).toBe('urgent')
    expect(tasks[0]!.primaryAction).toMatchObject({ kind: 'link', href: '#/attendance/s1' })
  })

  it('disappears the moment attendance_taken flips true — the same session, no new fetch', () => {
    const ended = session({ attendance_taken: false })
    expect(closeSessionTasks([ended], NOW, 'he')).toHaveLength(1)
    const closed = { ...ended, attendance_taken: true }
    expect(closeSessionTasks([closed], NOW, 'he')).toHaveLength(0)
  })

  it('does not raise a session that has not ended yet', () => {
    const upcoming = session({ starts_at: '2026-11-03T20:00:00Z', ends_at: '2026-11-03T22:00:00Z' })
    expect(closeSessionTasks([upcoming], NOW, 'he')).toHaveLength(0)
  })

  it('ignores a cancelled session even if nothing was ever marked', () => {
    const cancelled = session({ status: 'cancelled', attendance_taken: false })
    expect(closeSessionTasks([cancelled], NOW, 'he')).toHaveLength(0)
  })
})

describe('missingHealthFormTasks — coach row 2', () => {
  const rosterRow = (overrides: Partial<RosterRow>): RosterRow => ({
    student_id: 'st1',
    display_name: 'דניאל',
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

  it('surfaces a student whose health status is missing', () => {
    const today = session({})
    const tasks = missingHealthFormTasks(
      [today],
      { s1: [rosterRow({})] },
      () => () => Promise.resolve([]),
      'he',
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.title).toBe('דניאל')
    // §4.4's non-negotiable: never render the declaration's own content.
    expect(tasks[0]!.alertText).not.toMatch(/אסתמה|אלרגיה|asthma/i)
  })

  it('disappears once the roster reports the declaration signed', () => {
    const today = session({})
    const missing = missingHealthFormTasks(
      [today],
      { s1: [rosterRow({ health_status: 'missing' })] },
      () => () => Promise.resolve([]),
      'he',
    )
    expect(missing).toHaveLength(1)
    const signed = missingHealthFormTasks(
      [today],
      { s1: [rosterRow({ health_status: 'signed' })] },
      () => () => Promise.resolve([]),
      'he',
    )
    expect(signed).toHaveLength(0)
  })

  it('never doubles up a student cached under two of the coach’s sessions', () => {
    const first = session({ id: 's1' })
    const second = session({ id: 's2' })
    const tasks = missingHealthFormTasks(
      [first, second],
      { s1: [rosterRow({})], s2: [rosterRow({})] },
      () => () => Promise.resolve([]),
      'he',
    )
    expect(tasks).toHaveLength(1)
  })

  it('leaves a trial-signed or fully signed student uncounted', () => {
    const today = session({})
    const tasks = missingHealthFormTasks(
      [today],
      { s1: [rosterRow({ health_status: 'trial_signed' }), rosterRow({ student_id: 'st2', health_status: 'signed' })] },
      () => () => Promise.resolve([]),
      'he',
    )
    expect(tasks).toHaveLength(0)
  })
})

describe('callParentTasks — coach row 3, the one with a tick', () => {
  function notification(overrides: Partial<NotificationOut> = {}): NotificationOut {
    return {
      id: 'n1',
      kind: 'attendance.at_risk',
      title: 'תלמיד בסיכון',
      body: 'דניאל מזרחי — 3 היעדרויות רצופות',
      created_at: NOW,
      payload: { contact_person_id: 'p1', contact_phone: '050-0000000', missed_count: 3 },
      ...overrides,
    }
  }

  it('reads the student name and missed count out of the notification body/payload', () => {
    const tasks = callParentTasks([notification()], 'he', vi.fn())
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.title).toContain('דניאל מזרחי')
    expect(tasks[0]!.subtitle).toContain('3')
  })

  it('resolves its own contact synchronously from the payload, no extra fetch', async () => {
    const tasks = callParentTasks([notification()], 'he', vi.fn())
    const action = tasks[0]!.primaryAction
    if (action.kind !== 'contact') throw new Error('expected a contact action')
    const families = await action.resolveFamilies()
    expect(families).toEqual([{ person_id: 'p1', name: 'דניאל מזרחי', phone: '050-0000000' }])
  })

  it('is the only kind that carries a tick, and the tick reports the notification id', () => {
    const onTick = vi.fn()
    const tasks = callParentTasks([notification({ id: 'n42' })], 'he', onTick)
    expect(tasks[0]!.tick).toBeDefined()
    tasks[0]!.tick!.onTick()
    expect(onTick).toHaveBeenCalledWith('n42')
  })

  it('produces nothing once the inbox no longer contains it — the disappearance the tick buys', () => {
    expect(callParentTasks([], 'he', vi.fn())).toHaveLength(0)
  })
})

describe('cashPendingTasks — manager row 1', () => {
  function promise(overrides: Partial<StaffPromiseRow> = {}): StaffPromiseRow {
    return {
      id: 'pr1',
      status: 'pending',
      method: 'cash',
      total_agorot: 10000,
      claimed_plan_name: null,
      already_paid: false,
      payer_name: 'משפחת כהן',
      charge_count: 1,
      created_at: NOW,
      ...overrides,
    }
  }

  it('is one aggregate card, not one per promise', () => {
    const tasks = cashPendingTasks([promise({ id: 'a' }), promise({ id: 'b' })], 'he')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.moneyAgorot).toBe(20000)
    expect(tasks[0]!.primaryAction).toMatchObject({ kind: 'link', href: '#/cash' })
  })

  it('disappears once nothing is pending', () => {
    expect(cashPendingTasks([], 'he')).toHaveLength(0)
  })
})

describe('healthReviewTasks — manager row 2', () => {
  function notification(overrides: Partial<NotificationOut> = {}): NotificationOut {
    return {
      id: 'hn1',
      kind: 'health.review_pending',
      title: 'נדרש אישור מנהל',
      body: 'עומר שטרן — הרישום ממתין לאישור מנהל',
      created_at: NOW,
      payload: { enrollment_id: 'e1', student_id: 'st9' },
      ...overrides,
    }
  }

  it('links to the flagged student\'s own card and reads the name from the body', () => {
    const tasks = healthReviewTasks([notification()], 'he', vi.fn())
    expect(tasks[0]!.title).toBe('עומר שטרן')
    expect(tasks[0]!.primaryAction).toMatchObject({ kind: 'link', href: '#/students/st9' })
  })

  it('never renders a health answer, only the server-built summary', () => {
    const tasks = healthReviewTasks([notification()], 'he', vi.fn())
    expect(tasks[0]!.alertText).toBe('עומר שטרן — הרישום ממתין לאישור מנהל')
  })

  it('marks the notification read the moment its link is taken', () => {
    const onOpen = vi.fn()
    const tasks = healthReviewTasks([notification({ id: 'hn9' })], 'he', onOpen)
    const action = tasks[0]!.primaryAction
    if (action.kind !== 'link') throw new Error('expected a link action')
    action.onSelect?.()
    expect(onOpen).toHaveBeenCalledWith('hn9')
  })

  it('disappears once the inbox no longer contains it', () => {
    expect(healthReviewTasks([], 'he', vi.fn())).toHaveLength(0)
  })
})
