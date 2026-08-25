import type { Bundle } from '../types'

/**
 * Owned by the REPORTS lane (M9). Hebrew is the reference locale — `en` and `ru` mirror
 * these keys and `web/scripts/i18n-parity.mjs reports` fails on a gap in `en`.
 *
 * Artboards: dashboard `4g` דוחות — ללא גרפים צבעוניים.
 *
 * **Privacy strings live here under `privacy.*`.** `web/packages/i18n/types.ts` lists
 * exactly nine namespaces and `index.ts` is authored once, so there is no `privacy.ts` to
 * add and a lane can never add one. §11's kit and §5.14's reports ship in the same
 * milestone, which makes one namespace the honest shape rather than a workaround.
 *
 * Three things the copy has to hold, each from a specific line of the spec:
 *  - **`unmarked` is never counted as absent** (§5.14). `operational.sessionsHeld` and
 *    `attendance.unmarkedExcluded` exist so the screen states that, because a rate
 *    computed the other way is wrong in the direction that blames a coach.
 *  - **At-risk students are a notification, not a row in a report nobody opens** (§5.14).
 *    `atRisk.contactParent` is that one tap.
 *  - **Anonymization is not deletion** (§11.4). Israeli tax law requires roughly seven
 *    years of financial records, so the copy never promises erasure it cannot perform.
 */
export const reports: Bundle = {
  // -- the reports screen (dashboard 4g) -----------------------------------------
  'title': 'דוחות',
  'empty': 'אין נתונים לתקופה שנבחרה',
  'period': 'תקופה',
  'period.thisMonth': 'החודש',
  'period.lastMonth': 'החודש שעבר',
  'period.last12Months': '12 החודשים האחרונים',
  'period.custom': 'טווח מותאם',
  'export': 'ייצוא',
  'export.csv': 'ייצוא ל-CSV',
  'export.xlsx': 'ייצוא ל-Excel',
  'export.ready': 'הקובץ מוכן',

  // -- studio overview (§5.14) -----------------------------------------------------
  'overview.title': 'מבט על',
  'overview.activeStudents': 'חניכים פעילים',
  'overview.activeGroups': 'קבוצות פעילות',
  'overview.sessionsThisWeek': 'שיעורים השבוע',
  'overview.attendanceToday': 'נוכחות היום',
  'overview.openRegistrations': 'בקשות הרשמה פתוחות',
  'overview.outstandingDebt': 'חוב פתוח',

  // -- financial (§5.14) ------------------------------------------------------------
  'financial.title': 'דוח כספי',
  'financial.collectedVsExpected': 'נגבה מול צפוי',
  'financial.collected': 'נגבה',
  'financial.expected': 'צפוי',
  'financial.trend12m': 'מגמה — 12 חודשים',
  'financial.debtByPayer': 'חוב לפי משלם',
  'financial.byMethod': 'תשלומים לפי אמצעי',
  'financial.chargesCreated': 'חיובים שנוצרו',
  'financial.chargesSettled': 'חיובים ששולמו',
  'financial.chargesVoided': 'חיובים שבוטלו',
  'financial.chargesWrittenOff': 'חיובים שנמחקו',
  'financial.unreconciled': 'תשלומים ללא שיוך',
  'financial.pendingOrders': 'הזמנות ממתינות מעל 24 שעות',

  // -- funnel (§5.14, from student_status_history) -----------------------------------
  'funnel.title': 'משפך הרשמה',
  'funnel.enquiries': 'פניות',
  'funnel.trialsBooked': 'שיעורי ניסיון שנקבעו',
  'funnel.trialsAttended': 'הגיעו לניסיון',
  'funnel.converted': 'נרשמו',
  'funnel.conversionRate': 'שיעור המרה',
  'funnel.daysToConvert': 'ימים ממוצעים עד הרשמה',
  'funnel.bySource': 'לפי מקור',
  'funnel.trialsThisWeek': 'ניסיונות השבוע',
  'funnel.notFollowedUp': 'טרם נוצר קשר',

  // -- operational (§5.14) ------------------------------------------------------------
  'operational.title': 'דוח תפעולי',
  'operational.attendanceRate': 'אחוז נוכחות',
  'operational.byGroup': 'לפי קבוצה',
  'operational.byStudent': 'לפי חניך',
  'operational.sessionsHeld': 'שיעורים שהתקיימו מול מתוכננים',
  // §5.14 — a session nobody marked is not a session nobody attended. Computing the rate
  // the other way blames a coach for paperwork.
  'attendance.unmarkedExcluded': 'שיעורים שלא סומנו אינם נספרים כהיעדרות',
  'operational.newEnrollments': 'הרשמות חדשות',
  'operational.dropouts': 'עזיבות',
  'operational.netChange': 'שינוי נטו',
  'operational.missingHealth': 'חסרה הצהרת בריאות',
  'operational.coachSessionCounts': 'שיעורים לפי מאמן',

  // -- at risk (§5.14 — a notification, not a row nobody reads) -----------------------
  'atRisk.title': 'חניכים בסיכון',
  'atRisk.subtitle': 'שלוש היעדרויות רצופות ומעלה',
  'atRisk.consecutiveAbsences': '{{count}} היעדרויות רצופות',
  'atRisk.contactParent': 'צור קשר עם ההורה',
  'atRisk.empty': 'אין חניכים בסיכון',
  'atRisk.contacted': 'נוצר קשר',

  // -- §11.3's data export ------------------------------------------------------------
  'privacy.title': 'פרטיות ומידע אישי',
  'privacy.export.title': 'בקשת ייצוא מידע',
  'privacy.export.description': 'כל המידע השמור על הילדים שלכם, בקובץ אחד',
  'privacy.export.request': 'בקשת ייצוא',
  'privacy.export.requested': 'הבקשה התקבלה',
  'privacy.export.status.pending': 'ממתין',
  'privacy.export.status.running': 'בהכנה',
  'privacy.export.status.completed': 'מוכן להורדה',
  'privacy.export.status.failed': 'ההכנה נכשלה',
  'privacy.export.status.expired': 'פג תוקף הקישור',
  'privacy.export.download': 'הורדת הקובץ',
  // §11.3 — a time-limited link, and the copy says so before the parent is surprised.
  'privacy.export.linkExpires': 'הקישור זמין לזמן מוגבל',
  'privacy.export.requestAgain': 'בקשה חדשה',
  'privacy.export.preparingHint': 'ההכנה עשויה להימשך מספר דקות',

  // -- §11.4's anonymization -----------------------------------------------------------
  'privacy.anonymize.title': 'מחיקת פרטים אישיים',
  'privacy.anonymize.action': 'מחיקת פרטים',
  'privacy.anonymize.confirm': 'אישור המחיקה',
  'privacy.anonymize.done': 'הפרטים נמחקו',
  // §11.4 — hard deletion is impossible; tax law requires ~7 years of financial records.
  // The copy never promises erasure the product cannot perform.
  'privacy.anonymize.whatHappens': 'שם, תאריך לידה, טלפון, דוא״ל ותמונה יימחקו. הצהרות בריאות והחתימות יושמדו',
  'privacy.anonymize.whatRemains': 'רישומי חיובים ותשלומים נשמרים כנדרש בחוק, ללא שם',
  'privacy.anonymize.irreversible': 'הפעולה אינה הפיכה',

  // -- §11.5's retention ----------------------------------------------------------------
  'privacy.retention.title': 'שמירת מידע',
  'privacy.retention.setting': 'מחיקה אוטומטית לאחר',
  'privacy.retention.months': '{{count}} חודשים',
  'privacy.retention.preview': 'מה יימחק בהרצה הבאה',
  'privacy.retention.previewCount': '{{count}} חניכים שעזבו',
  'privacy.retention.exempt': 'החרגה מהמחיקה',
  'privacy.retention.exempted': 'הוחרג',
  'privacy.retention.empty': 'אין רשומות למחיקה',

  // -- §11.6's consent -------------------------------------------------------------------
  'privacy.consent.title': 'הסכמות',
  'privacy.consent.version': 'גרסה',
  'privacy.consent.givenAt': 'ניתנה בתאריך',
  'privacy.consent.revoke': 'ביטול ההסכמה',
  // §11.6 — a revocation is recorded, never deleted.
  'privacy.consent.revokedRecorded': 'ביטול ההסכמה נרשם',
  'privacy.consent.type.terms': 'תנאי שימוש',
  'privacy.consent.type.privacy_policy': 'מדיניות פרטיות',
  'privacy.consent.type.photo': 'פרסום תמונות',
  'privacy.consent.type.medical_flags': 'שיתוף סימוני בריאות עם המאמנים',
  'privacy.consent.type.event': 'השתתפות באירוע',
  // §11.6 — the most realistic complaint this club will face, so it is a ✓/✕ on the card.
  'privacy.photo.allowed': 'מותר לפרסם תמונות',
  'privacy.photo.notAllowed': 'אין לפרסם תמונות',
  'privacy.photo.notRecorded': 'לא נרשמה הסכמה',
}
