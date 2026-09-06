// Every case here is a way עדכונים could look perfectly correct and be wrong: an
// obligation filed under club announcements is one nobody sees; a settled declaration still
// listed as outstanding is the app demanding something already done.
import { describe, expect, it } from 'vitest'
import {
  applyFilter,
  classify,
  isEmpty,
  pendingCountOf,
  subjectNameOf,
  toRow,
  waitingCountOf,
} from './classify'
import type { ActionCatalogue, Notification } from './classify'

const CATALOGUE: ActionCatalogue = {
  health_declaration: { label: 'מילוי הצהרה', href: '#/' },
  payment: { label: 'תשלום', href: '#/payments' },
  event_rsvp: { label: 'אישור הגעה', href: '#/events' },
}

const KIDS = { 's1': 'נועה', 's2': 'יוסי' }

const note = (over: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  kind: 'announcement',
  title: 'כותרת',
  body: 'גוף',
  created_at: '2026-08-20T10:00:00Z',
  read_at: null,
  ...over,
})

describe('classify — the three sections', () => {
  it('files an outstanding action as urgent, whoever it is about', () => {
    const groups = classify(
      [note({ action: { kind: 'health_declaration', outstanding: true, subject_name: 'נועה' } })],
      KIDS,
      CATALOGUE,
    )
    expect(groups.urgent).toHaveLength(1)
    expect(groups.club).toHaveLength(0)
    expect(groups.personal).toHaveLength(0)
  })

  it('moves a SETTLED action out of the queue and into the child’s own updates', () => {
    // The defect: a declaration signed from §6.1's gate settles the notice even though the
    // parent never opened it. Leaving it in the urgent section is the app nagging for
    // something already done.
    const groups = classify(
      [
        note({
          action: {
            kind: 'health_declaration',
            outstanding: false,
            settled_at: '2026-08-21T09:00:00Z',
            subject_name: 'נועה',
          },
        }),
      ],
      KIDS,
      CATALOGUE,
    )
    expect(groups.urgent).toHaveLength(0)
    expect(groups.personal).toHaveLength(1)
    expect(groups.personal[0]!.action!.settledAt).toBe('2026-08-21T09:00:00Z')
  })

  it('files a club-wide notice with no subject as an announcement', () => {
    const groups = classify([note()], KIDS, CATALOGUE)
    expect(groups.club).toHaveLength(1)
    expect(groups.personal).toHaveLength(0)
  })

  it('files a subject-carrying notice with no action as a personal update', () => {
    const groups = classify(
      [note({ kind: 'attendance.at_risk', payload: { student_id: 's2' } })],
      KIDS,
      CATALOGUE,
    )
    expect(groups.personal.map((r) => r.subjectName)).toEqual(['יוסי'])
  })

  it('puts the longest-owed obligation at the top, and the newest news first', () => {
    const groups = classify(
      [
        note({ id: 'new-owed', created_at: '2026-08-22T10:00:00Z', action: { kind: 'payment', outstanding: true } }),
        note({ id: 'old-owed', created_at: '2026-08-01T10:00:00Z', action: { kind: 'payment', outstanding: true } }),
        note({ id: 'old-news', created_at: '2026-08-02T10:00:00Z' }),
        note({ id: 'new-news', created_at: '2026-08-23T10:00:00Z' }),
      ],
      KIDS,
      CATALOGUE,
    )
    // Oldest first — the nearest deadline is the one owed longest.
    expect(groups.urgent.map((r) => r.id)).toEqual(['old-owed', 'new-owed'])
    expect(groups.club.map((r) => r.id)).toEqual(['new-news', 'old-news'])
  })
})

describe('subjectNameOf', () => {
  it('prefers the server’s own answer over any client-side join', () => {
    expect(
      subjectNameOf(
        note({
          payload: { student_id: 's2' },
          action: { kind: 'payment', outstanding: true, subject_name: 'נועה' },
        }),
        KIDS,
      ),
    ).toBe('נועה')
  })

  it('refuses to name a student id that is not one of this family’s children', () => {
    expect(subjectNameOf(note({ payload: { student_id: 'someone-else' } }), KIDS)).toBeNull()
  })

  it('is null when there is nothing to go on', () => {
    expect(subjectNameOf(note(), KIDS)).toBeNull()
  })
})

describe('toRow', () => {
  it('renders an unknown action kind as a row with no button, not a button to nowhere', () => {
    const row = toRow(note({ action: { kind: 'kind_from_a_later_milestone', outstanding: true } }), KIDS, CATALOGUE)
    expect(row.action).not.toBeNull()
    expect(row.action!.href).toBeNull()
    expect(row.action!.label).toBeNull()
  })

  it('never marks an outstanding obligation "new" — being owed already says it', () => {
    const row = toRow(note({ read_at: null, action: { kind: 'payment', outstanding: true } }), KIDS, CATALOGUE)
    expect(row.isNew).toBe(false)
  })

  it('marks an unread informational notice new, and a read one not', () => {
    expect(toRow(note({ read_at: null }), KIDS, CATALOGUE).isNew).toBe(true)
    expect(toRow(note({ read_at: '2026-08-21T00:00:00Z' }), KIDS, CATALOGUE).isNew).toBe(false)
  })
})

describe('applyFilter', () => {
  const groups = classify(
    [
      note({ id: 'owed', action: { kind: 'payment', outstanding: true, subject_name: 'נועה' } }),
      note({ id: 'news' }),
      note({ id: 'about-yossi', payload: { student_id: 's2' } }),
    ],
    KIDS,
    CATALOGUE,
  )

  it('הכל keeps everything', () => {
    expect(isEmpty(applyFilter(groups, { kind: 'all' }))).toBe(false)
  })

  it('counts actions for the chip, and actions PLUS unread for the pill', () => {
    // The pill must match the tab bar's badge, whose rule is
    // `action ? action.outstanding : read_at === null`. One owed payment here, and two
    // unread informational notices.
    expect(pendingCountOf(groups)).toBe(1)
    expect(waitingCountOf(groups)).toBe(3)
  })

  it('דורש פעולה keeps only the queue', () => {
    const filtered = applyFilter(groups, { kind: 'action' })
    expect(filtered.urgent.map((r) => r.id)).toEqual(['owed'])
    expect(filtered.club).toEqual([])
    expect(filtered.personal).toEqual([])
  })

  it('מועדון keeps only what is addressed to everyone', () => {
    const filtered = applyFilter(groups, { kind: 'club' })
    expect(filtered.club.map((r) => r.id)).toEqual(['news'])
    expect(filtered.urgent).toEqual([])
  })

  it('one child narrows every section, and drops club-wide notices', () => {
    const filtered = applyFilter(groups, { kind: 'child', name: 'נועה' })
    expect(filtered.urgent.map((r) => r.id)).toEqual(['owed'])
    expect(filtered.club).toEqual([])
    expect(filtered.personal).toEqual([])
  })

  it('a filter that matches nothing is empty — which the screen must say differently', () => {
    expect(isEmpty(applyFilter(groups, { kind: 'child', name: 'מישהו אחר' }))).toBe(true)
  })
})
