import type { Bundle } from '../types'

/**
 * Owned by the SCHEDULE lane (M2). Hebrew is the reference locale — `en` and `ru` mirror
 * these keys and `web/scripts/i18n-parity.mjs schedule` fails on a gap in `en`.
 *
 * Artboards: staff `9a` היום, `9b` בחירת תאריך, `1d`; dashboard `3a` לוח שבועי,
 * `6a` עמוד קבוצה, `4b` קבוצות ומחזורים; parent `12b` לוח הילד.
 *
 * §5.6 shapes two families of string here and both matter:
 *  - **Closures are proposals the manager ticks, never automatic.** `closure.preset.*`
 *    is phrased as an offer ("הצע חגים"), never as a statement that the club is closed.
 *  - **A rule change rewrites only future sessions.** The `impact.*` keys exist so the
 *    dialog can say what is *protected* and why, not merely how many rows change.
 */
export const schedule: Bundle = {
  // -- the day / week views (staff 9a, 1d; dashboard 3a) ------------------------
  'today.title': 'היום',
  'today.empty': 'אין שיעורים היום',
  'today.emptyHint': 'ימי פעילות נקבעים בלו״ז השבועי של הקבוצה',
  'today.allCoaches': 'כל המאמנים',
  'today.filterByCoach': 'סינון לפי מאמן',
  'week.title': 'לוח שבועי',
  'week.today': 'היום',
  'week.previous': 'שבוע קודם',
  'week.next': 'שבוע הבא',
  'view.day': 'יום',
  'view.week': 'שבוע',
  'view.month': 'חודש',

  // -- date picking (staff 9b) --------------------------------------------------
  'datePicker.title': 'בחירת תאריך',
  'datePicker.jumpToToday': 'קפיצה להיום',
  'datePicker.range': 'טווח תאריכים',
  'datePicker.from': 'מתאריך',
  'datePicker.to': 'עד תאריך',
  'datePicker.apply': 'החל',
  'datePicker.clear': 'נקה',

  // -- a session block ----------------------------------------------------------
  'session.title': 'שיעור',
  'session.at': 'בשעה',
  'session.location': 'מיקום',
  'session.noLocation': 'לא נקבע מיקום',
  'session.coach': 'מאמן',
  'session.substitute': 'ממלא מקום',
  // D5 — a session block surfaces coverage and completion, not registration counts.
  'session.noCoach': 'לא שובץ מאמן',
  'session.attendanceTaken': 'נוכחות נרשמה',
  'session.attendanceMissing': 'נוכחות טרם נרשמה',
  'session.status.scheduled': 'מתוכנן',
  'session.status.cancelled': 'בוטל',
  'session.status.completed': 'הסתיים',
  'session.manuallyEdited': 'נערך ידנית',
  'session.manuallyEditedHint': 'שינוי בלו״ז לא ידרוס שיעור שנערך ידנית',
  'session.adHoc': 'שיעור חד־פעמי',
  'session.cancel': 'ביטול שיעור',
  'session.cancelReason': 'סיבת הביטול',
  'session.cancelReasonRequired': 'יש לציין סיבה לביטול',
  'session.cancelled': 'השיעור בוטל',
  'session.addAdHoc': 'הוספת שיעור חד־פעמי',

  // -- session notes (staff 9g) -------------------------------------------------
  'note.title': 'סיכום מפגש',
  'note.placeholder': 'מה קרה בשיעור?',
  'note.add': 'הוספת סיכום',
  'note.saved': 'הסיכום נשמר',
  'note.empty': 'אין סיכומים לשיעור הזה',

  // -- the weekly rules (dashboard 6a) ------------------------------------------
  'rules.title': 'לו״ז שבועי',
  'rules.add': 'הוספת מועד',
  'rules.remove': 'הסרת מועד',
  'rules.weekday': 'יום בשבוע',
  'rules.startTime': 'שעת התחלה',
  'rules.endTime': 'שעת סיום',
  'rules.effectiveFrom': 'בתוקף מתאריך',
  'rules.empty': 'לא נקבע לו״ז שבועי לקבוצה',
  'rules.endBeforeStart': 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
  'weekday.0': 'ראשון',
  'weekday.1': 'שני',
  'weekday.2': 'שלישי',
  'weekday.3': 'רביעי',
  'weekday.4': 'חמישי',
  'weekday.5': 'שישי',
  'weekday.6': 'שבת',

  // -- the impact preview (§5.6, E2E-5) -----------------------------------------
  'impact.title': 'מה ישתנה',
  'impact.subtitle': 'השינוי יחול על שיעורים עתידיים בלבד',
  'impact.toCreate': 'שיעורים חדשים',
  'impact.toUpdate': 'שיעורים שיעודכנו',
  'impact.toCancel': 'שיעורים שיבוטלו',
  'impact.protectedPast': 'שיעורים שכבר היו — לא ישתנו',
  'impact.protectedManual': 'שיעורים שנערכו ידנית — לא ישתנו',
  'impact.protectedAdHoc': 'שיעורים חד־פעמיים — לא ישתנו',
  'impact.firstAffected': 'השינוי הראשון בתאריך',
  'impact.nothingChanges': 'אין שינוי בשיעורים',
  'impact.confirm': 'אישור ועדכון הלו״ז',
  'impact.cancel': 'ביטול',

  // -- training years (§5.15) ---------------------------------------------------
  'year.title': 'שנת פעילות',
  'year.plural': 'שנות פעילות',
  'year.add': 'שנת פעילות חדשה',
  'year.name': 'שם השנה',
  'year.startsOn': 'תאריך פתיחה',
  'year.endsOn': 'תאריך סיום',
  'year.status.draft': 'טיוטה',
  'year.status.active': 'פעילה',
  'year.status.closed': 'סגורה',
  'year.activate': 'הפעלת השנה',
  // §5.15 — nothing is visible to guardians until the year is activated.
  'year.draftHint': 'שנה בטיוטה אינה מוצגת להורים',
  'year.endBeforeStart': 'תאריך הסיום חייב להיות אחרי תאריך הפתיחה',
  'year.generateSessions': 'יצירת כל השיעורים לשנה',
  'year.generated': 'נוצרו {{count}} שיעורים',

  // -- closures (§5.6) ----------------------------------------------------------
  'closure.title': 'ימי סגירה',
  'closure.add': 'הוספת סגירה',
  'closure.dateFrom': 'מתאריך',
  'closure.dateTo': 'עד תאריך',
  'closure.reason': 'סיבה',
  'closure.empty': 'לא הוגדרו ימי סגירה',
  'closure.source.manual': 'הוגדר ידנית',
  'closure.source.holidayPreset': 'מתוך רשימת החגים',
  // §5.6 — presets are OFFERED. The copy never states the club is closed.
  'closure.preset.title': 'חגים ומועדים',
  'closure.preset.subtitle': 'סמנו את הימים שבהם המועדון סגור',
  'closure.preset.apply': 'הוספת הימים המסומנים',
  'closure.preset.none': 'לא נבחרו ימים',

  // -- the impact preview, continued: C12 ---------------------------------------
  // C12 — a change that empties a student's pattern takes them off the roster and stops
  // counting them absent, which looks exactly like the feature working. The ⚠ is NOT in
  // the string: it is the Alert primitive's icon, which carries an accessible name. A
  // glyph inside a translated sentence is invisible to a screen reader.
  'impact.studentsUnscheduled': '{{count}} תלמידים לא רשומים לאף יום אחרי השינוי',
  'impact.studentsUnscheduledOne': 'תלמיד אחד לא רשום לאף יום אחרי השינוי',
  'impact.studentsUnscheduledHint':
    'תלמיד שאינו רשום לאף יום יורד מרשימת הנוכחות ואינו נספר כנעדר',
  'impact.studentsUnscheduledIcon': 'אזהרה',
  'impact.protectedManualList': 'השיעורים שנערכו ידנית',
  'impact.close': 'סגירה',

  // -- what the server cancelled, and why (D-M2-3) --------------------------------
  'session.cancelReason.scheduleChange': 'שינוי בלו״ז השבועי',
  'session.cancelReason.closure': 'המועדון סגור',
  'session.editTime': 'שינוי שעה',
  'session.save': 'שמירה',
  'session.saved': 'השיעור עודכן',
  'session.adHocStart': 'שעת התחלה',
  'session.adHocEnd': 'שעת סיום',
  'session.adHocDate': 'תאריך',

  // -- holiday presets, by key (D-M2-4) -------------------------------------------
  'closure.preset.rosh_hashanah': 'ראש השנה',
  'closure.preset.yom_kippur': 'יום כיפור',
  'closure.preset.sukkot': 'סוכות',
  'closure.preset.pesach': 'פסח',
  'closure.preset.yom_haatzmaut': 'יום העצמאות',
  'closure.preset.shavuot': 'שבועות',
  'closure.preset.summer_break': 'חופש גדול',
  'closure.cancelled': 'בוטלו {{count}} שיעורים',
  'closure.endBeforeStart': 'תאריך הסיום אינו יכול להקדים את תאריך ההתחלה',

  // -- the parent's month (12b) ----------------------------------------------------
  'calendar.title': 'לוח הילד',
  'calendar.previousMonth': 'חודש קודם',
  'calendar.nextMonth': 'חודש הבא',
  'calendar.upcoming': 'שיעורים קרובים',
  'calendar.past': 'שיעורים שהיו',
  'calendar.empty': 'אין שיעורים בחודש הזה',
  'calendar.emptyHint': 'לוח השיעורים נקבע על ידי המועדון',
  'calendar.attendanceComesLater': 'הנוכחות שהייתה תוצג בהמשך',

  // -- groups and cycles (4b) ------------------------------------------------------
  'groups.title': 'קבוצות ומחזורים',
  'groups.weeklySchedule': 'לו״ז שבועי',
  'groups.nextSession': 'השיעור הבא',
  'groups.noNextSession': 'אין שיעור מתוכנן',
  'groups.unscheduledStudents': 'תלמידים ללא יום',
  'groups.beltRangeComesLater': 'טווח החגורות יוצג עם מערכת החגורות',
  'groups.capacityComesLater': 'תפוסה תוצג עם רשימת החניכים',
  'groups.empty': 'לא הוגדרו קבוצות',
  'groups.caption': 'קבוצות המועדון והלו״ז שלהן',

  // -- the group page (6a) ---------------------------------------------------------
  'group.scheduleTitle': 'לו״ז הקבוצה',
  'group.sessions': 'שיעורים',
  'group.changeFrom': 'השינוי בתוקף מתאריך',
  'group.reviewChange': 'בדיקת השינוי',
  'group.noActiveYear': 'לא הוגדרה שנת פעילות פעילה',
  'group.noActiveYearHint': 'שנת פעילות פעילה נדרשת לפני קביעת לו״ז',
}
