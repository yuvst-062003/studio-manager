// The birthday section's data seam — mirrors `useOpenTasks.ts`'s own shape (a plain fetch
// on mount/refresh, no store of its own) but is deliberately its own hook: birthdays are
// not tasks (see `deriveBirthdays.ts`'s header) and this reads a different client call
// (`peopleClient.search`, the same one `StudentsSearch.tsx` already calls) rather than
// sessions/notifications/promises.
//
// `peopleClient.search('')` is the students tab's own "everything" query — server-scoped
// exactly the way that tab already is (a coach's own groups, a manager's whole studio), so
// this needs no role check of its own for the same reason `deriveTasks.ts`'s header gives:
// the personal scoping already happened before the list reaches here.
import { useCallback, useEffect, useState } from 'react'
import type { ContactFamily } from '../contact'
import type { StaffPeopleClient, StudentDetail } from '../people'
import { greetedKey, loadGreeted, toggleGreeted } from './birthdayGreetings'
import { upcomingBirthdays } from './deriveBirthdays'
import type { BirthdayRow } from './deriveBirthdays'
import type { Locale } from '@studio/i18n'

/** The same narrow shape `useOpenTasks.ts`'s own `primaryGuardianContact` reads off
 *  `StudentDetail` — duplicated rather than imported for the same reason that file's own
 *  comment gives: it is eight lines, and each caller reads it off a different fetch. */
function primaryGuardianContact(student: StudentDetail): ContactFamily | null {
  const guardians = student.guardians ?? []
  const guardian = guardians.find((g) => g.is_primary) ?? guardians[0]
  if (!guardian) return null
  return { person_id: guardian.person_id, name: guardian.display_name, phone: guardian.phone ?? null }
}

export function useBirthdays({
  enabled,
  locale,
  peopleClient,
  viewerPersonId,
  today,
  refreshKey,
}: {
  enabled: boolean
  locale: Locale
  peopleClient: StaffPeopleClient
  viewerPersonId: string | null
  /** An ISO instant, not `new Date()` — the same discipline `useOpenTasks.ts` and
   *  `deriveTasks.ts` hold every derivation to. */
  today: string
  refreshKey?: unknown
}): {
  rows: BirthdayRow[]
  isGreeted: (row: BirthdayRow) => boolean
  toggle: (row: BirthdayRow) => void
  resolveFamilies: (studentId: string) => () => Promise<ContactFamily[]>
} {
  const [rows, setRows] = useState<BirthdayRow[]>([])
  // A device shared by more than one coach must not read one coach's tick as another's —
  // see `birthdayGreetings.ts`'s own header. `'shared'` is the honest fallback for the one
  // moment `viewerPersonId` is not yet known (before the session's membership resolves)
  // rather than a key that changes later and drops whatever was ticked under the old one.
  const personKey = viewerPersonId ?? 'shared'
  // Read once, lazily, at mount — not through an effect. `react-hooks/set-state-in-effect`
  // forbids seeding React state from `setState` inside an effect body (an effect is for
  // synchronizing with an external system, not for copying one into state on every
  // dependency change); reading `localStorage` in the lazy initializer instead means this
  // never needs to. `toggle` below is the only writer, and it updates this state directly
  // from an event handler, which carries none of that restriction.
  const [greeted, setGreeted] = useState<Set<string>>(() => loadGreeted(personKey))

  useEffect(() => {
    if (!enabled) return
    let live = true
    peopleClient
      .search('')
      .then((page) => live && setRows(upcomingBirthdays(page.items, today, locale)))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [enabled, peopleClient, today, locale, refreshKey])

  const isGreeted = useCallback(
    (row: BirthdayRow) => greeted.has(greetedKey(row.studentId, row.occursYear)),
    [greeted],
  )

  const toggle = useCallback(
    (row: BirthdayRow) => {
      setGreeted(toggleGreeted(personKey, greetedKey(row.studentId, row.occursYear)))
    },
    [personKey],
  )

  // Lazy, on-demand resolve — the same shape `useOpenTasks.ts`'s own health-form rows use
  // `peopleClient.student(id)` for: `StudentSummaryOut` carries no phone number
  // (§3.2/§13 — coach-scoped student data never does), so the guardian's contact is looked
  // up only once the coach actually opens `ContactFamiliesButton`'s panel for that child.
  const resolveFamilies = useCallback(
    (studentId: string) => (): Promise<ContactFamily[]> =>
      peopleClient
        .student(studentId)
        .then((student) => {
          const contact = primaryGuardianContact(student)
          return contact ? [contact] : []
        })
        // §4.9 rule 1 — a failed lookup still leaves the button real; it opens to an empty
        // list rather than throwing.
        .catch(() => []),
    [peopleClient],
  )

  return { rows, isGreeted, toggle, resolveFamilies }
}
