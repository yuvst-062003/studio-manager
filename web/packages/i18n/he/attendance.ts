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
  // 2c's attendance row qualifier. The 62 is baked into the sentence rather than
  // composed, because the number leads in Hebrew and sits mid-phrase in English —
  // there is no one word order that serves all three. WINDOW_DAYS is the source of
  // truth for the QUERY; this is the sentence that describes it.
  'card.window': 'ב־62 הימים האחרונים',
  'roster.dayLabel': 'יום {{weekday}}',
  'roster.empty': 'אין חניכים בקבוצה הזו',
  'roster.present': 'נוכח',
  'roster.absent': 'נעדר',
  'roster.absentExcused': 'נעדר בהצדקה',
  'roster.absentUnexcused': 'נעדר ללא הצדקה',
  // §5.14 — `unmarked` is a real state. A report must never treat it as absent.
  'roster.unmarked': 'לא סומן',
  'roster.unmarkedCount': 'לא סומנו {{count}} חניכים',
  'roster.unmarkedCount.one': 'חניך אחד לא סומן',
  // §5.7's collapsed section — students enrolled in the group but not expected at THIS
  // session (C12). `סמן הכל נוכח` never touches it and its rows never count toward `לא סומן`.
  'roster.notExpectedToday': 'לא אמורים להגיע היום',
  'roster.notExpectedHint': 'אפשר לסמן גם אותם — ילד שהגיע ביום נוסף הוא ילד אמיתי',
  'roster.markAllPresent': 'סימון כולם כנוכחים',
  // `9f` finding 1 — the button as DRAWN overwrites every parent's advance notice, under a
  // hint row announcing those notices. This is the label that tells the truth about what the
  // server does, and `source.preReportedHint` is the sentence it is agreeing with.
  'roster.markAllPresentHint': 'לא ידרוס דיווחי הורים או סימונים קיימים',
  'roster.longPressToOverride': 'לחיצה ארוכה כדי לשנות דיווח של הורה',
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
  // `12a` finding 7 and `12i` finding 9 — the parent's word for their own children is not
  // `חניכים`. `people.student.plural` is the club's noun; this is the family's.
  'absence.chooseChild': 'מי מהילדים',
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

  // -- the two-way answer on the home screen (owner decision, 2026-09-01) ---------
  // "מגיע/ה" is a REAL answer now, not the absence of one: the club stores it, so a
  // coach's roster tells "said yes" from "has not answered". Gendered per child, which
  // is why these carry a {name} rather than a fixed noun.
  'intent.prompt': 'מה לעדכן למאמן?',
  'intent.coming': 'מגיע/ה',
  'intent.notComing': 'לא מגיע/ה',
  'intent.confirmed': 'עדכנתם שמגיע/ה',
  'intent.reported': 'עדכנתם שלא מגיע/ה',
  'intent.unanswered': 'לא עדכנתם',
  'intent.changeable': 'אפשר לשנות עד תחילת השיעור',

  // -- §10.1's four network states, not two --------------------------------------
  'network.online': 'מחובר',
  'network.offline': 'לא מקוון',
  // The state navigator.onLine cannot see: a captive portal that routes nowhere.
  'network.intermittent': 'חיבור לא יציב',
  'network.slow': 'חיבור איטי',
  // §10.1's fifth row — "API down, client online... Distinguished from offline". A coach
  // with four bars told `לא מקוון` stops trusting the indicator entirely.
  'network.apiDown': 'השרת אינו זמין',
  'network.apiDownHint': 'השרת אינו זמין, ננסה שוב. הסימונים נשמרים במכשיר',
  'network.offlineHint': 'הסימונים נשמרים במכשיר ויסונכרנו כשהחיבור יחזור',
  'network.intermittentHint': 'יש רשת אבל אין תשובה מהשרת. הסימונים נשמרים במכשיר',

  // -- the sync queue -------------------------------------------------------------
  'sync.pending': 'ממתין לסנכרון',
  'sync.pendingCount': '{{count}} סימונים ממתינים לסנכרון',
  'sync.pendingCount.one': 'סימון אחד ממתין לסנכרון',
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
  // §5.14 — 'this is why `unmarked` must be a real state'. `4c` finding 1: the rule is
  // encoded in the sequence strip and stated nowhere on the screen.
  'report.unmarkedNotAbsence': 'שיעורים שלא סומנו אינם נספרים כהיעדרות',
  'report.remindCoach': 'תזכורת למאמן',
  'report.coachReminded': 'נשלחה תזכורת למאמן',
  'report.byGroup': 'אחוז נוכחות לפי קבוצה',
  // B1.5 — Part C did not name these three; the per-group card became a real `Table`
  // (group · rate · coverage) and each column needs an accessible header. Kept in this
  // namespace rather than borrowed from `schedule.groups.col.name`, per CLAUDE.md's rule
  // that a vertical's strings live in its own file.
  'report.col.group': 'קבוצה',
  'report.col.rate': 'אחוז נוכחות',
  'report.col.coverage': 'כיסוי',
  // B1.3 — the unmarked row's `⋯` overflow control, once `סימון עכשיו` and
  // `תזכורת למאמן` move behind it. Accessible name, not visible text.
  'report.rowActions': 'פעולות עבור {{group}}',
  // -- 9g's injury report (S2): immediate, online-only, never queued -------------
  'summary.injury.title': 'דיווח פציעה',
  'summary.injury.who': 'מי נפצע?',
  'summary.injury.what': 'מה קרה?',
  'summary.injury.send': 'שליחה למנהל ולהורים',
  'summary.injury.sent': 'הדיווח נשלח למנהל ולהורים',
  'summary.injury.failed': 'השליחה נכשלה. נסו שוב.',
  'summary.injury.needsConnection': 'דיווח פציעה נשלח מיד, ולכן דורש חיבור לרשת.',
  'summary.title': 'סיכום מפגש',
  // §5.13 — 'Visible to coaches of that student's groups and to all managers. NEVER
  // visible to guardians.' `9g` finding 2: the note card is the only one of three on that
  // screen that states no audience, and a coach writing about a child should know who reads it.
  'summary.noteAudience': 'המאמנים של הקבוצה והמנהלים רואים את ההערה. הורים לא רואים אותה',
  'summary.whatNext': 'מה לעשות עכשיו',
  'summary.backToRoster': 'חזרה לרשימת הנוכחות',
  'summary.finish': 'סיום ושמירה',
  'card.recentAttendance': 'נוכחות אחרונה',
  'card.markPresent': 'סימון כנוכח',
  'card.markAbsent': 'סימון כנעדר',
  // `1e` finding 3 — the popover's × carries no handler and there is no backdrop, so
  // dismissal is undecided on the artboard. Decided here, and it needs an accessible name:
  // `common` has only `nav.closeMenu`, which is the drawer's.
  'quickView.close': 'סגירת התצוגה המהירה',
  // B1.4 — the register lives in the staff app on a hostname this app must not guess,
  // so `סימון עכשיו` opens `QuickViewRoster` in place instead. The popover's own action.
  'report.markHere': 'סימון כאן',
  'report.title': 'נוכחות',
  'report.unmarkedSessions': 'שיעורים שלא סומנו',
  // B1.2 — the unmarked row's third grid column: select · group · when · actions.
  'report.when': 'מועד',
  'report.consecutiveAbsences': 'נעדרים ברצף',
  'report.attendanceRate': 'אחוז נוכחות',
  'report.sessionsHeld': 'שיעורים שהתקיימו',
  'report.sessionsPlanned': 'שיעורים שתוכננו',
  'report.empty': 'אין נתוני נוכחות לתקופה הזו',
  'report.export': 'ייצוא',
  // -- the range `4c` never had. `9b`'s DateRangePicker takes both labels and the error --
  'report.rangeFrom': 'מתאריך',
  'report.rangeTo': 'עד תאריך',
  'report.rangeInverted': 'תאריך הסיום מוקדם מתאריך ההתחלה',
  // The same bound `GET /exports/attendance` enforces, so the table and the CSV refuse the
  // same ranges. `{{days}}` is filled by the caller — `t()` does no interpolation.
  'report.rangeTooLong': 'אפשר לבחור טווח של עד {{days}} ימים',
  // §5.14, applied to the number rather than to the list: the denominator is the registers
  // somebody actually signed, and a percentage whose denominator is unstated gets misquoted.
  'report.rateBasis': 'האחוז מחושב מתוך שיעורים שסומנו בלבד',
  'report.noRate': 'אין סימונים בטווח הזה',
  // `{{counts}}` is an ltr island the caller substitutes — bare digits in an RTL paragraph
  // reorder, and `1/9` would render `9/1`.
  'report.markedOfSessions': 'סומנו {{counts}} שיעורים',
}
