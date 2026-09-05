// The absence sheet's strings. Split from `content.ts` only because that file is the
// screen's and this is one modal's; both move to `web/packages/i18n/he/attendance.ts` at
// build-order step 6.
//
// Several of these already exist in @studio/i18n under `attendance.absence.*` —
// `absence.title` is the same 'דיווח היעדרות', and `absence.tooLate` / `absence.alreadyReported`
// are the same two refusals `12a`'s screen already renders. They are repeated here rather
// than imported ONLY so that step 6 reconciles one module instead of a screen that half
// imports and half does not; the reconciliation note is this paragraph.

export const ABSENCE = {
  title: 'דיווח היעדרות מאימון',
  subtitle: 'עדכון מהיר לצוות המאמנים',
  close: 'סגירה',
  reasonLegend: 'סיבת ההיעדרות:',
  reasonHint: 'יש לבחור סיבה אחת',
  noteLabel: 'הערה למאמן (אופציונלי):',
  noteRecommended: "מומלץ אם נבחר 'אחר'",
  notePlaceholder: 'פרטים נוספים לצוות האימון...',
  submit: 'אישור ושליחת דיווח',
  submitting: 'שולח…',
  cancel: 'ביטול',

  /** Every way the write can be refused. The prototype has none of these because it has no
   *  server; each one here is a state a parent can actually reach.
   *
   *  `offline` is not a network error message but a rule: §10.2 says a pre-report requires
   *  a connection ON PURPOSE, because it is time-critical and worthless if it lands after
   *  the lesson. Saying so is the designed behaviour, not a fallback. */
  failure: {
    too_late: 'השיעור כבר התחיל, ולא ניתן לדווח עליו מראש. אפשר לעדכן את המאמן ישירות.',
    already_marked: 'כבר דיווחתם על השיעור הזה.',
    offline: 'דיווח היעדרות דורש חיבור לאינטרנט. הדיווח לא יישמר במצב לא מקוון — נסו שוב כשיש חיבור.',
    unknown: 'הדיווח לא נשלח. נסו שוב.',
  },
} as const

/** The six reasons the prototype offers, with its own icons and tints. `label` is what is
 *  actually stored and what a coach reads on the mat, so it has to be a sentence and not a
 *  key — `POST /absence-reports` has one free-text `reason` column and no enum. */
export const ABSENCE_REASONS = [
  { key: 'sick', icon: '🤒', label: 'מחלה', sub: 'לא מרגיש טוב / חום', bg: 'bg-amber-50 dark:bg-amber-400/15' },
  { key: 'family', icon: '🎉', label: 'אירוע משפחתי', sub: 'שמחה משפחתית', bg: 'bg-purple-50 dark:bg-purple-400/15' },
  { key: 'school', icon: '📚', label: 'עומס לימודי', sub: 'מבחנים / לימודים', bg: 'bg-sky-50 dark:bg-sky-400/15' },
  { key: 'injury', icon: '🩹', label: 'פציעה / כאבים', sub: 'התאוששות ומנוחה', bg: 'bg-rose-50 dark:bg-rose-400/15' },
  { key: 'vacation', icon: '✈️', label: 'נסיעה / חופשה', sub: 'חופשה מחוץ לבית', bg: 'bg-emerald-50 dark:bg-emerald-400/15' },
  { key: 'other', icon: '💬', label: 'אחר', sub: 'פירוט חופשי בהערה', bg: 'bg-slate-100 dark:bg-slate-700' },
] as const
