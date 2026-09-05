// בית's strings, pre-i18n and temporary — the arrangement the wizard's `content.ts`
// records and the shell's `content.ts` repeats. Build-order step 6 of
// docs/plan/prompts/redesign-parent-app.md moves every ported screen's strings into
// `web/packages/i18n/he/*.ts` at once and writes the en and ru mirrors. Nothing here may be
// inlined into a component in the meantime.
//
// WHAT THE PROTOTYPE HARD-CODES AND THIS DOES NOT. The prototype's home is written for one
// family: "שלום, משפחת כהן", "חוב שכר לימוד ₪320", "הצהרת בריאות לנועה חסרה", "3" children,
// "יום ג׳ • 25 באוגוסט 2026", three named chips. Every one of those is a value here, and
// where this app has no source for one it is ABSENT rather than invented — §1 of the
// prompt: the code degrades visibly.
//
// The season line is the clearest case. The prototype prints "עונת תשפ״ה (2025/26)"; the
// API has no training-year label anywhere — `SessionRow.training_year_id` is a uuid and
// nothing resolves it to a name. So the greeting renders the family alone and the season is
// simply not there, rather than a Hebrew year computed on the client from a guess about
// when the season starts.

export const HOME = {
  /** Header. The club's name is `session.activeStudioName`, never a constant. */
  greeting: 'שלום',
  /** `שלום, משפחת {name}` — used only when the guardian's surname is known. */
  greetingFamily: 'שלום, משפחת {name}',
  reportAbsence: 'דיווח היעדרות',
  notificationsTitle: 'התראות והודעות מהמאמן',
  notificationsLabel: 'התראות מהמאמן',

  /** The urgent banner. Both halves are conditional and the separator only appears
   *  between two present halves. */
  urgentTitle: 'דרוש טיפול דחוף בהרשמה',
  urgentCta: 'טיפול מהיר',
  urgentSeparator: ' • ',
  /** `{amount}` is already formatted by the money formatter — agorot never divided here. */
  urgentDebt: 'חוב שכר לימוד {amount}',
  /** One child. The prototype names the child, and so does this. */
  urgentHealthOne: 'הצהרת בריאות ל{name} חסרה',
  /** Two or more, because "הצהרת בריאות לנועה, לדנה וליוסי חסרה" does not decline. */
  urgentHealthMany: 'חסרות {count} הצהרות בריאות',

  /** Chips. Each child's own chip prints their first name and their belt's name. */
  allChildren: 'כל הילדים',

  /** The week strip. `weekStripLabel` names the landmark for a screen reader — the port
   *  first fell back to the day headline, which reads as a date rather than as a control. */
  weekStripLabel: 'בחירת יום',
  monthButton: 'חודש',
  monthButtonTitle: 'פתיחת לוח חודשי מלא',
  today: 'היום',

  /** The day headline and its count. */
  noSessionsPlanned: 'אין אימונים מתוכננים',
  oneSessionPlanned: 'שיעור אחד מתוכנן',
  manySessionsPlanned: '{count} שיעורים מתוכננים',

  /** The session card. */
  absentQuestion: 'נעדר/ת?',
  absentReported: 'דווח ✓',
  /** The badge the staff roster and the dashboard count are both built to read. */
  statusReported: 'הודעתם מראש ✓',
  statusScheduled: 'מתוכנן',
  statusCancelled: 'בוטל',
  minutesShort: 'דק׳',
  reminderSet: 'תזכורת ביומן 🔔',
  reminderUnset: 'תזכורת ליומן',
  reminderTitle: 'הגדר תזכורת אישית ביומן המכשיר',

  /** The empty day. */
  emptyTitle: 'אין אימונים מתוכננים ליום זה',
  emptyBody: 'ניתן לצפות בימים אחרים או בלוח החודשי המלא',
  emptyCta: 'פתיחת לוח חודשי',

  /** The monthly calendar modal — §4's home for the deleted drawer's calendar entry. */
  monthTitle: 'לוח אימונים ואירועים',
  monthSubtitle: 'לוח פעילות חודשי מלא',
  monthClose: 'סגירה',
  monthPrev: 'חודש קודם',
  monthNext: 'חודש הבא',
  monthToday: 'היום',
  monthGridLabel: 'בחירת תאריך',
  monthAgendaEmpty: 'אין אימונים ביום זה',

  /** Loading and failure, neither of which the prototype has — it has no network. */
  loading: 'טוען את לוח האימונים…',
  loadFailed: 'לא הצלחנו לטעון את לוח האימונים',
  retry: 'נסו שוב',
} as const

/** The seven Hebrew day letters, Sunday first — indexed by `Date.getUTCDay()`. */
export const WEEKDAY_LETTER = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const

/** Hebrew month names, indexed by `getMonth()`. The headline prints "25 באוגוסט 2026". */
export const MONTH_NAME = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
] as const

/** `{token}` replacement. One helper so no component builds a sentence by concatenation —
 *  the order of a clause is not the same in en and ru, and step 6 has to be able to move
 *  these without rewriting the call sites. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  )
}
