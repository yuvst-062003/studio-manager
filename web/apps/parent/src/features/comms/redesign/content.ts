// עדכונים's strings, pre-i18n and temporary — the same arrangement every other ported
// screen in this redesign uses. Build-order step 6 moves them into
// `web/packages/i18n/he/comms.ts` and writes the en and ru mirrors.
//
// The action LABELS are the exception worth naming: `comms.inbox.action.*` already exists
// in @studio/i18n with all three locales, because `InboxScreen` shipped with them. The
// container passes those in through `UpdateAction.label` rather than re-typing them here —
// a second Hebrew spelling of a shipped button is exactly what step 6 would then have to
// reconcile against itself.

export const UPDATES = {
  title: 'לוח עדכונים והודעות',
  /** The counter pill, both ways round.
   *
   *  NOT the prototype's "דורשים טיפול" — "require handling" is true of an outstanding
   *  action and false of an unopened announcement, and the pill counts both, because the tab
   *  bar's badge does and the two are on screen together. "ממתינים לכם" is true of both.
   *  See `waitingCountOf`. */
  pendingCount: '{count} ממתינים לכם',
  allClear: 'הכל מעודכן ✓',

  /** The filter strip. */
  filterLabel: 'פילטר קטגוריות',
  filterAll: 'הכל',
  filterAction: 'דורש פעולה',
  filterClub: 'מועדון',

  /** Section headings. */
  urgentHeading: 'דורש פעולה מיידית',
  urgentNote: 'חובה להסדיר',
  clubHeading: 'הודעות המועדון',
  /** The prototype's trailing caption on each heading row. Static labels, so they port. */
  clubNote: 'כלל המתאמנים',
  personalHeading: 'עדכונים אישיים',
  personalNote: 'מעקב ילדים',

  /** Row marks. */
  isNew: 'חדש',
  /** Not in the prototype — see UpdatesFeed. A notice that asks for nothing can never be
   *  settled by doing it, so this is the only thing that clears its mark. */
  markAllRead: 'סימון הכול כנקרא',
  settled: 'טופל',

  /** The empty feed, and the states the prototype has no server to produce. */
  emptyTitle: 'אין עדכונים חדשים',
  emptyBody: 'כשהמועדון ישלח הודעה, היא תופיע כאן.',
  emptyFiltered: 'אין עדכונים בקטגוריה הזו',
  loading: 'טוען עדכונים…',
  loadFailed: 'לא הצלחנו לטעון את העדכונים',
  retry: 'נסו שוב',
  loadMore: 'טעינת עדכונים קודמים',
} as const

/** `{token}` replacement — one helper, so no component builds a sentence by concatenation. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  )
}
