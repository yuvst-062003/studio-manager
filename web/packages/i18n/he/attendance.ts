import type { Bundle } from '../types'

/**
 * Owned by the ATTENDANCE lane (M5). Hebrew is the reference locale.
 *
 * Artboards: staff `1c` נוכחות בשיעור, `9f` נוכחות, `9g` סיכום מפגש, `2d` כרטיס חניך;
 * parent `2a` בית, `12a` דיווח היעדרות; dashboard `4c` נוכחות, `1e` Quick View.
 *
 * **This namespace carries the offline vocabulary for the whole product**, because M5 is
 * the only lane that owns `web/packages/core/**`. §10.1's four network states are four
 * distinct strings and not two: `network.intermittent` exists because
 * `navigator.onLine` is `true` on a captive portal that routes nowhere, and a coach who is
 * told "מחובר" while nothing syncs stops trusting the indicator entirely.
 *
 * §10.2 is why `absence.requiresConnection` exists: a parent pre-report **requires a
 * connection on purpose**, and the app says so rather than queuing into the void.
 */
export const attendance: Bundle = {
  // -- the roster (staff 1c, 9f) -------------------------------------------------
  'roster.title': 'נוכחות',
  'roster.empty': 'אין חניכים בקבוצה הזו',
  'roster.present': 'נוכח',
  'roster.absent': 'נעדר',
  'roster.absentExcused': 'נעדר בהצדקה',
  'roster.absentUnexcused': 'נעדר ללא הצדקה',
  // §5.14 — `unmarked` is a real state. A report must never treat it as absent.
  'roster.unmarked': 'לא סומן',
  'roster.unmarkedCount': 'לא סומנו {{count}} חניכים',
  'roster.markAllPresent': 'סימון כולם כנוכחים',
  'roster.tapToToggle': 'לחיצה על שורה מחליפה מצב',
  'roster.saved': 'הנוכחות נשמרה',
  'roster.editAnytime': 'אפשר לערוך את הנוכחות בכל זמן',
  'roster.markedBy': 'סומן על ידי',
  'roster.markedAt': 'סומן בשעה',
  'roster.addNote': 'הוספת הערה',

  // -- where a mark came from (§10.5's conflict rules live on this) --------------
  'source.coach': 'המאמן',
  'source.parent': 'ההורה',
  'source.bulk': 'סימון קבוצתי',
  'source.system': 'המערכת',
  // §5.7 — 'הודיעו מראש' comes from the parent, and §10.5 protects it from a bulk action.
  'source.preReported': 'הודיעו מראש',
  'source.preReportedHint': 'ההורה דיווח מראש. סימון קבוצתי לא ידרוס את הדיווח',

  // -- parent absence reporting (parent 12a) -------------------------------------
  'absence.title': 'דיווח היעדרות',
  'absence.subtitle': 'עד תחילת השיעור',
  'absence.chooseSession': 'בחירת שיעור',
  'absence.reason': 'סיבה',
  'absence.reasonOptional': 'סיבה — לא חובה',
  'absence.submit': 'שליחת הדיווח',
  'absence.submitted': 'הדיווח נשלח',
  'absence.tooLate': 'השיעור כבר התחיל',
  'absence.alreadyReported': 'כבר דיווחתם על השיעור הזה',
  'absence.cancel': 'ביטול הדיווח',
  // §10.2 — requires a connection ON PURPOSE, and says so.
  'absence.requiresConnection': 'דיווח היעדרות דורש חיבור לאינטרנט',
  'absence.requiresConnectionHint': 'הדיווח לא יישמר במצב לא מקוון. נסו שוב כשיש חיבור',

  // -- §10.1's four network states, not two --------------------------------------
  'network.online': 'מחובר',
  'network.offline': 'לא מקוון',
  // The state navigator.onLine cannot see: a captive portal that routes nowhere.
  'network.intermittent': 'חיבור לא יציב',
  'network.slow': 'חיבור איטי',
  'network.offlineHint': 'הסימונים נשמרים במכשיר ויסונכרנו כשהחיבור יחזור',
  'network.intermittentHint': 'יש רשת אבל אין תשובה מהשרת. הסימונים נשמרים במכשיר',

  // -- the sync queue -------------------------------------------------------------
  'sync.pending': 'ממתין לסנכרון',
  'sync.pendingCount': '{{count}} סימונים ממתינים לסנכרון',
  'sync.syncing': 'מסנכרן…',
  'sync.synced': 'הכול מסונכרן',
  'sync.syncedAt': 'סונכרן לאחרונה בשעה',
  'sync.retry': 'ניסיון סנכרון חוזר',
  'sync.failed': 'הסנכרון נכשל',
  // §6.5/§12 — iOS cannot guarantee the eviction exemption, so a stale queue BLOCKS.
  'sync.staleWarning': 'יש סימונים שלא סונכרנו יותר מיום',
  'sync.staleBody': 'התחברו לאינטרנט כדי לשמור את הסימונים לפני שהם יאבדו',
  'sync.staleAction': 'סנכרון עכשיו',
  // §10.4's staleness banner.
  'stale.title': 'המידע אינו עדכני',
  'stale.body': 'המידע נטען לאחרונה בשעה {{time}}',

  // -- offline priming (§6.1 — first launch BLOCKS on this) ----------------------
  'priming.title': 'מכינים את האפליקציה',
  'priming.body': 'טוענים את השיעורים של היום ומחר כדי שיעבדו גם בלי רשת',
  'priming.failed': 'ההכנה נכשלה',
  'priming.retry': 'ניסיון חוזר',

  // -- §10.5's cross-actor conflicts ---------------------------------------------
  'conflict.title': 'התנגשות בסימון',
  'conflict.sessionCancelled': 'השיעור בוטל בזמן שסימנתם',
  'conflict.sessionCancelledBody': 'הסימונים נשמרו ולא הוחלו. מנהל צריך להחליט',
  'conflict.otherCoach': 'מאמן אחר סימן את השיעור הזה',
  'conflict.differentPerson': 'התחברתם עם משתמש אחר',
  'conflict.differentPersonBody': 'יש סימונים שלא סונכרנו מהמשתמש הקודם',
  'conflict.keepMine': 'שמירת הסימונים שלי',
  'conflict.keepTheirs': 'שמירת הסימונים הקיימים',
  'conflict.review': 'בדיקת ההתנגשות',

  // -- the manager view (dashboard 4c) --------------------------------------------
  'report.title': 'נוכחות',
  'report.unmarkedSessions': 'שיעורים שלא סומנו',
  'report.consecutiveAbsences': 'נעדרים ברצף',
  'report.attendanceRate': 'אחוז נוכחות',
  'report.sessionsHeld': 'שיעורים שהתקיימו',
  'report.sessionsPlanned': 'שיעורים שתוכננו',
  'report.empty': 'אין נתוני נוכחות לתקופה הזו',
  'report.export': 'ייצוא',
}
