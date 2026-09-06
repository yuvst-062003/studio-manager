// How one flat `/me/notifications` page becomes the prototype's three sections.
//
// Pure, and tested, because every mistake available here is invisible on a screenshot: an
// obligation filed under "club announcements" is an obligation a parent never sees, and a
// settled declaration still shown as outstanding is the app nagging for something already
// done — the exact defect `InboxScreen`'s header records having fixed once already.
import type { UpdateAction, UpdateFilter, UpdateGroups, UpdateRow } from './types'

/** `NotificationOut`, narrowed to what עדכונים reads. */
export type Notification = {
  id: string
  kind: string
  title: string
  body: string
  created_at: string
  read_at?: string | null
  payload?: Record<string, unknown>
  action?: {
    kind: string
    outstanding: boolean
    settled_at?: string | null
    subject_name?: string | null
  } | null
}

/** Where each action kind goes, and what its button says. Supplied by the caller so the
 *  words come from @studio/i18n and this module holds no Hebrew at all. */
export type ActionCatalogue = Readonly<Record<string, { label: string; href: string }>>

/**
 * The child a notification is about, or `null`.
 *
 * TWO SOURCES, in order. `action.subject_name` is the server's own answer and is
 * authoritative — `app/services/comms/actions.py` resolves it against the roster, so the
 * client cannot pair a notice with the wrong child. Only when there is no action does this
 * fall back to `payload.student_id`, which several kinds carry (`attendance.at_risk` and
 * its neighbours), resolved through the family's OWN children.
 *
 * The fallback is deliberately narrow: an id that is not one of this family's children
 * resolves to `null` rather than to a name looked up elsewhere. A notification is scoped to
 * the caller by the API already; this is the client refusing to widen that.
 */
export function subjectNameOf(
  notification: Notification,
  childrenById: Readonly<Record<string, string>>,
): string | null {
  const fromAction = notification.action?.subject_name
  if (fromAction) return fromAction
  const studentId = notification.payload?.['student_id']
  return typeof studentId === 'string' ? (childrenById[studentId] ?? null) : null
}

export function toRow(
  notification: Notification,
  childrenById: Readonly<Record<string, string>>,
  catalogue: ActionCatalogue,
): UpdateRow {
  const subjectName = subjectNameOf(notification, childrenById)
  const source = notification.action ?? null
  const known = source ? catalogue[source.kind] : undefined
  const action: UpdateAction | null = source
    ? {
        kind: source.kind,
        outstanding: source.outstanding,
        settledAt: source.settled_at ?? null,
        // A kind this build does not know renders as a plain row rather than as a button
        // that goes nowhere — the safe direction for a kind a later milestone adds.
        href: known?.href ?? null,
        label: known?.label ?? null,
      }
    : null

  return {
    id: notification.id,
    kind: notification.action?.kind ?? notification.kind,
    title: notification.title,
    body: notification.body,
    createdAt: notification.created_at,
    subjectName,
    // `חדש` is only meaningful on a row that asks for nothing. An outstanding obligation is
    // shown by BEING outstanding: marking it unread as well says the same thing twice, and
    // marking it read would quietly retire a demand nobody satisfied. That asymmetry is the
    // one `InboxScreen` had to learn — read_at and owed are different questions.
    isNew: !notification.read_at && !(action?.outstanding ?? false),
    action,
  }
}

export function classify(
  notifications: readonly Notification[],
  childrenById: Readonly<Record<string, string>>,
  catalogue: ActionCatalogue,
): UpdateGroups {
  const urgent: UpdateRow[] = []
  const club: UpdateRow[] = []
  const personal: UpdateRow[] = []

  for (const notification of notifications) {
    const row = toRow(notification, childrenById, catalogue)
    if (row.action?.outstanding) urgent.push(row)
    else if (row.subjectName !== null) personal.push(row)
    else club.push(row)
  }
  // Newest first within each section. The API already sorts, but the split is a fan-out and
  // a caller merging two pages must not depend on that surviving it.
  const byNewest = (a: UpdateRow, b: UpdateRow) => b.createdAt.localeCompare(a.createdAt)
  return {
    // Urgent goes OLDEST first: the thing that has been owed longest is the thing with the
    // nearest deadline, and it belongs at the top of a queue rather than the bottom.
    urgent: urgent.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    club: club.sort(byNewest),
    personal: personal.sort(byNewest),
  }
}

/**
 * TWO COUNTS, because there are two questions, and confusing them would put two different
 * numbers on one screen.
 *
 * `pendingCountOf` is what still REQUIRES AN ACTION. It badges the דורש פעולה filter chip,
 * which shows exactly those rows, so the number and the thing it labels are the same set.
 *
 * `waitingCountOf` is everything not yet dealt with — an outstanding action, OR an
 * informational notice nobody has opened. That is the definition `App.tsx` already uses for
 * the tab bar's badge (`row.action ? row.action.outstanding : row.read_at === null`), and
 * the header pill has to use it too: the tab bar is on screen while this screen is open, and
 * a pill reading "1" beside a tab reading "2" is a product arguing with itself.
 *
 * It is also why the pill's wording is not the prototype's "דורשים טיפול" — see content.ts.
 */
export function pendingCountOf(groups: UpdateGroups): number {
  return groups.urgent.length
}

export function waitingCountOf(groups: UpdateGroups): number {
  const unread = [...groups.club, ...groups.personal].filter((row) => row.isNew).length
  return groups.urgent.length + unread
}

export function applyFilter(groups: UpdateGroups, filter: UpdateFilter): UpdateGroups {
  if (filter.kind === 'all') return groups
  if (filter.kind === 'action') return { urgent: groups.urgent, club: [], personal: [] }
  if (filter.kind === 'club') return { urgent: [], club: groups.club, personal: [] }
  // One child: every section, narrowed to rows about them. The club's own announcements are
  // addressed to everyone and have no subject, so they correctly disappear — a parent
  // filtering to one child asked about that child.
  const mine = (rows: readonly UpdateRow[]) => rows.filter((row) => row.subjectName === filter.name)
  return { urgent: mine(groups.urgent), club: mine(groups.club), personal: mine(groups.personal) }
}

/** Is there anything at all to draw? Three empty sections is the empty state. */
export function isEmpty(groups: UpdateGroups): boolean {
  return groups.urgent.length + groups.club.length + groups.personal.length === 0
}
