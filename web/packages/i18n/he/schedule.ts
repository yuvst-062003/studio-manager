import type { Bundle } from '../types'

/**
 * Owned by the SCHEDULE lane (M2). Hebrew is the reference locale — `en` and `ru` mirror
 * these keys and `web/scripts/i18n-parity.mjs schedule` fails on a gap in `en`.
 *
 * Artboards: staff `9a` היום, `1d`; dashboard `3a` לוח שבועי,
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
  'today.sessionCount': '{{count}} שיעורים',
  // Register §9 — "1 שיעורים" has no plural rule. `translatePlural` reaches for this
  // sibling only when `count === 1`; every other count keeps the template above.
  'today.sessionCount.one': 'שיעור אחד',
  'today.backToToday': 'חזרה להיום',
  'today.openRoster': 'פתיחת נוכחות',
  // Owner fix (2026-09-07) — the same link as `today.openRoster`, to the same
  // `#/attendance/<id>`, only on a `pendingClose` card: closing a session IS taking its
  // register, so the action's wording should say that rather than "open attendance" on a
  // session that has already ended. Never repurposes `today.openRoster`, which every other
  // state still uses as written.
  'today.closeSession': 'סגור אימון',
  // §6.1's offline promise, finally kept (2026-09-07). Two days of sessions were primed
  // into IndexedDB and never read back, so the app carried the data for a basement and
  // then showed "could not load" over the top of it in one.
  'today.fromCache': 'אין חיבור — זו הרשימה השמורה במכשיר. ייתכן שהיא לא מעודכנת.',
  // The day strip's own accessible name. It borrowed `datePicker.title` until 9b was
  // deleted (2026-09-07) and the rest of that block went with the screen — a strip of
  // seven days is not a date picker, and the label should say what it labels.
  'today.dayStripLabel': 'בחירת יום',
  'today.empty': 'אין שיעורים היום',
  'today.emptyHint': 'ימי פעילות נקבעים בלו״ז השבועי של הקבוצה',
  // Register §4.2 — a date outside every declared training year used to render exactly
  // like an ordinary day off, with no way to tell them apart. This is the actionable
  // sentence: no year covers this date at all, and a manager has to fix that upstream.
  'today.noTrainingYear': 'אין שנת לימודים שמכסה את התאריך הזה',
  'today.noTrainingYearHint': 'יש לפנות למנהל להוספת שנת לימודים המכסה תאריך זה',
  'today.allCoaches': 'כל המאמנים',
  'today.filterByCoach': 'סינון לפי מאמן',
  'week.title': 'לוח שבועי',
  'week.today': 'היום',
  'week.previous': 'שבוע קודם',
  'week.next': 'שבוע הבא',
  // D5 — "Three views only — day, week, month. Week is the default."
  'week.view.legend': 'תצוגה',
  'week.view.day': 'יום',
  'week.view.week': 'שבוע',
  'week.view.month': 'חודש',
  'week.view.previousDay': 'יום קודם',
  'week.view.nextDay': 'יום הבא',
  'week.view.previousMonth': 'חודש קודם',
  'week.view.nextMonth': 'חודש הבא',
  'week.view.sessions': 'שיעורים',
  // `3a`'s coverage strip — מה חסר השבוע. Counts are PARAMETERS, never joined into a
  // sentence. Derived from the week's own sessions, not fetched: SessionRow already
  // carries `staff` and `attendance_taken`.
  'week.missing.title': 'מה חסר השבוע',
  'week.missing.noCoach': 'שיעורים ללא מאמן',
  'week.missing.unmarked': 'מפגשים ללא סימון נוכחות',
  'week.missing.cancelled': 'בוטלו',
  'week.missing.none': 'לא חסר כלום השבוע',
  // `3a` item 7 + `1e`'s completed counter. The options are derived from the week on
  // screen, so a filter is never offered that would empty the board.
  'week.filter.legend': 'סינון הלוח',
  'week.filter.group': 'קבוצה',
  'week.filter.coach': 'מאמן',
  'week.filter.hall': 'אולם',
  'week.filter.all': 'הכל',
  'week.filter.clear': 'ניקוי הסינון',
  'week.filter.empty': 'אין שיעורים שמתאימים לסינון',
  'week.missing.completed': 'הושלמו',
  'view.day': 'יום',
  'view.week': 'שבוע',
  'view.month': 'חודש',

  // -- a session block ----------------------------------------------------------
  // -- F3's session popover actions ------------------------------------------------
  'session.actions': 'פעולות על השיעור',
  'session.delete': 'מחיקת שיעור',
  'session.deleteConfirm': 'למחוק את השיעור החד־פעמי? הפעולה אינה הפיכה.',
  'session.changeRoom': 'שינוי אולם',
  'session.changeCoach': 'שינוי מאמן',
  'session.title': 'שיעור',
  'session.at': 'בשעה',
  'session.location': 'מיקום',
  'session.noLocation': 'לא נקבע מיקום',
  'session.coach': 'מאמן',
  'session.substitute': 'ממלא מקום',
  // D5 — a session block surfaces coverage and completion, not registration counts.
  'session.noCoach': 'לא שובץ מאמן',
  // Moving a session by picking it up from the board (2026-08-29). The popover's date
  // fields remain the keyboard path; this is the pointer one.
  'session.move.hint': 'בחרו משבצת חדשה לשיעור',
  'session.move.cancel': 'ביטול ההעברה',
  'session.move.moved': 'השיעור הועבר',
  'session.move.failed': 'לא הצלחנו להעביר את השיעור',
  'session.move.target': 'העברה לכאן',
  'session.slot.create': 'שיעור חדש במשבצת הזו',
  'session.attendanceTaken': 'נוכחות נרשמה',
  'session.durationMinutes': '{{minutes}} דק׳',
  'session.headcount': '{{count}} חניכים',
  'session.attendanceMissing': 'נוכחות טרם נרשמה',

  // -- the restyled card's state (2026-09-06, staff redesign C2) ---------------------
  // Three facts, not the prototype's four arbitrary colours: a session already over with
  // its register still open, one happening right now, and everything still ahead — the
  // NEXT of which gets its own colour so a coach can find it at a glance, and every one
  // after it stays neutral. Read the state off the dot's colour AND this text — never
  // colour alone (SC 1.4.1), the same rule the rollover rail states above.
  'session.state.pendingClose': 'ממתין לסגירת נוכחות',
  'session.state.activeNow': 'מתקיים כעת',
  'session.state.nextUp': 'השיעור הבא',
  // -- who has answered (§4.9) — thrown away until now; every roster row already carries it --
  'session.confirmedCount': '{{confirmed}} מתוך {{total}} אישרו הגעה',
  'session.notAnsweredCount': '{{count}} משפחות טרם ענו',
  'session.notAnsweredCount.one': 'משפחה אחת טרם ענתה',
  // C4 (owner review, 2026-09-06) — this button's own label used to spell out the whole
  // fact ("{{count}} משפחות שלא ענו — יצירת קשר") because it stood alone as the card's
  // biggest control. It is now the emerald half of a two-up grid beside attendance, and
  // the prototype's own label is this short — the count in parentheses, exactly like
  // `שלח תזכורת (5)`. No `.one` sibling: a numeral in parentheses needs no plural form.
  'session.chaseButton': 'שלח תזכורת ({{count}})',
  // `{{group}}` and `{{time}}` are the session's own real data — never a hardcoded club
  // name (decision 18: this is the same reminder mechanism the session card and the task
  // card both use, and the club's name belongs to the studio record, not this string).
  'session.chaseMessage': 'תזכורת: השיעור של {{group}} מתקיים היום בשעה {{time}}. נשמח אם תאשרו הגעה באפליקציה.',
  // -- the active card's progress block, and the honest fallback when a roster is not
  //    cached (C3, 2026-09-06) — the prototype's "on the mat" wording assumes physical
  //    check-in, which this app does not have; every number here is `confirmationCounts`
  //    off the same cached roster the bottom cluster already reads, never invented.
  'session.remainingMinutes': 'נותרו {{minutes}} דק׳',
  'session.confirmedPercent': '{{percent}}% אישרו הגעה',
  'session.progressConfirmedLabel': 'אישרו הגעה',
  'session.progressNotAnsweredLabel': 'טרם ענו',
  'session.rosterUnavailable': 'נתוני האישורים לא נשמרו על המכשיר הזה',
  'session.status.scheduled': 'מתוכנן',
  'session.status.cancelled': 'בוטל',
  'session.status.completed': 'הסתיים',
  'session.manuallyEdited': 'נערך ידנית',
  'session.manuallyEditedHint': 'שינוי בלו״ז לא ידרוס שיעור שנערך ידנית',
  'session.adHoc': 'שיעור חד־פעמי',
  // §6.2 of the staff app redesign — a small marker, not the text itself: "do not render
  // the text on a list." The briefing itself lives on the attendance screen.
  'session.hasBriefing': 'יש תדריך',
  // C5 (2026-09-07) — the marker became a button, and its accessible name has to say what
  // tapping it DOES, distinct from `attendance.briefing.add`'s "there is none yet".
  'session.openBriefing': 'פתיחת התדריך למפגש',
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
  // Bug #20 (2026-09-08) — a closed date produces NO session row (§5.6 skips it in
  // `materialize_sessions`), so every calendar drew ראש השנה as an ordinary quiet day.
  // The title here; the description beside it is the closure's own `reason`, which is
  // the manager's typed text and so is never translated.
  'closure.dayClosed': 'המועדון סגור',
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
  // §4.7 של עיצוב אפליקציית הצוות מחדש — גיליון העריכה של הלוח החודשי (נקודת ביקורת C11,
  // החלטות 8/9). מאמן/ת עוזר/ת מקבל/ת את אותו הגיליון בלי אף אחת מהפקדים שמתחתיו — זה
  // המשפט שמסביר למה, במקום כפתור שפשוט חסר בלי הסבר.
  'session.editRestricted': 'רק מנהלים ומאמנים בכירים יכולים לערוך שיעור זה. הפרטים כאן לצפייה בלבד.',
  'session.save': 'שמירה',
  'session.saved': 'השיעור עודכן',
  'session.adHocStart': 'שעת התחלה',
  'session.adHocEnd': 'שעת סיום',
  'session.adHocDate': 'תאריך',
  'session.create': 'שיעור חדש',
  'session.createGroup': 'קבוצה',
  'session.createCoach': 'מאמן (לא חובה)',

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
  'calendar.legend': 'מקרא',
  'calendar.legend.present': 'נכחו',
  'calendar.legend.absent': 'לא נכחו',
  'calendar.legend.notified': 'הודעתם מראש',
  'calendar.legend.planned': 'מתוכנן',
  'calendar.legend.unmarked': 'לא סומן',
  'calendar.summaryRate': 'נוכחות',
  'calendar.summaryHeld': 'מפגשים שהיו',
  'calendar.summaryPlanned': 'מתוכננים',
  'calendar.childAll': 'כל הילדים',
  'calendar.childOf': 'הלוח של {name}',
  'calendar.title': 'לוח הילד',
  'calendar.previousMonth': 'חודש קודם',
  'calendar.nextMonth': 'חודש הבא',
  'calendar.previousWeek': 'שבוע קודם',
  'calendar.nextWeek': 'שבוע הבא',
  'calendar.previousDay': 'יום קודם',
  'calendar.nextDay': 'יום הבא',
  'calendar.today': 'היום',
  // -- the attendance popup a lesson opens (12b) ---------------------------------
  'calendar.attend.title': 'מגיעים לשיעור?',
  'calendar.attend.forChild': 'עבור {name}',
  'calendar.attend.coming': 'מגיעים',
  'calendar.attend.notComing': 'לא מגיעים',
  'calendar.attend.reason': 'סיבה (לא חובה)',
  'calendar.attend.send': 'שליחה',
  'calendar.attend.close': 'סגירה',
  'calendar.attend.comingSaved': 'רשמנו שאתם מגיעים.',
  'calendar.attend.notComingSaved': 'הודענו למועדון שלא תגיעו.',
  'calendar.attend.alreadyNotComing': 'כבר הודעתם שלא תגיעו לשיעור הזה.',
  'calendar.attend.tooLate': 'מאוחר מדי לעדכן את השיעור הזה.',
  'calendar.attend.cancelled': 'השיעור בוטל על ידי המועדון.',
  'calendar.attend.past': 'השיעור כבר היה.',
  'calendar.attend.noSessions': 'אין שיעור ביום הזה.',
  'calendar.attend.chooseChild': 'בחרו ילד',
  'calendar.upcoming': 'שיעורים קרובים',
  'calendar.upcomingCount': '{n} שיעורים קרובים',
  'calendar.past': 'שיעורים שהיו',
  'calendar.pastCount': '{n} שיעורים שהיו',
  'calendar.empty': 'אין שיעורים בחודש הזה',
  'calendar.emptyHint': 'לוח השיעורים נקבע על ידי המועדון',

  // -- groups and cycles (4b) ------------------------------------------------------
  'groups.title': 'קבוצות ומחזורים',
  'group.coaches.title': 'מאמני הקבוצה',
  'group.coaches.empty': 'לא שובץ מאמן לקבוצה',
  'group.coaches.person': 'איש צוות',
  'groups.create': 'קבוצה חדשה',
  'groups.form.name': 'שם הקבוצה',
  'groups.form.class': 'כיתה',
  'groups.form.submit': 'יצירה',
  'groups.rename': 'שינוי שם',
  'groups.renameSave': 'שמירה',
  'groups.retire': 'העברה לארכיון',
  'groups.revive': 'החזרה מהארכיון',
  'groups.archived': 'בארכיון',
  'groups.weeklySchedule': 'לו״ז שבועי',
  'groups.nextSession': 'השיעור הבא',
  'groups.noNextSession': 'אין שיעור מתוכנן',
  'groups.unscheduledStudents': 'תלמידים ללא יום',
  'groups.empty': 'לא הוגדרו קבוצות',
  'groups.caption': 'קבוצות המועדון והלו״ז שלהן',
  // B3.2/A6/B3.3/B3.5 — the redesigned table's own column headers, distinct from the
  // page title (`groups.title`) a column header must never repeat, and the stated gap
  // that replaces an empty belt-range column until `belt_rank` has rows.
  'groups.col.name': 'קבוצה',
  'groups.col.actions': 'פעולות',
  'groups.col.unscheduledShort': 'ללא יום',
  'groups.beltRangeLater': 'טווח חגורות יתווסף עם מערכת החגורות',
  // The row's `⋯` overflow control (B3.4) — its accessible name, not visible text.
  'groups.rowActions': 'פעולות עבור {{name}}',

  // -- the group page (6a) ---------------------------------------------------------
  'group.scheduleTitle': 'לו״ז הקבוצה',
  'group.sessions': 'שיעורים',
  'group.changeFrom': 'השינוי בתוקף מתאריך',
  'group.reviewChange': 'בדיקת השינוי',
  'group.noActiveYear': 'לא הוגדרה שנת פעילות פעילה',
  'group.noActiveYearHint': 'שנת פעילות פעילה נדרשת לפני קביעת לו״ז',

  // -- §5.15's rollover wizard ------------------------------------------------------
  //
  // Every string the wizard renders lives under `rollover.`, with two deliberate
  // exceptions it borrows rather than duplicates: the holiday names
  // (`closure.preset.<key>`, keyed by the server's stable key per D-M2-4) and the
  // training-year status words (`year.status.*`). A second Hebrew name for יום כיפור is
  // a second name that drifts.
  'rollover.nav': 'גלגול שנה',
  'rollover.title': 'גלגול שנת פעילות',
  'rollover.reopenStep': 'פתיחת השלב מחדש',
  'rollover.back': 'חזרה לשלב הקודם',
  'rollover.subtitle': 'שבעה שלבים לפתיחת השנה הבאה. אפשר לעצור באמצע ולחזור — ההתקדמות נשמרת.',
  'rollover.draftOnlyHint': 'כל עוד השנה בטיוטה, שום דבר כאן אינו מוצג להורים',
  'rollover.loading': 'טוען את מצב הגלגול…',
  'rollover.loadFailed': 'לא הצלחנו לטעון את מצב הגלגול',
  'rollover.progressLabel': 'שלבי הגלגול',
  'rollover.stepOf': 'שלב {{n}} מתוך {{total}}',
  'rollover.complete': 'כל השלבים נענו',
  'rollover.incomplete': 'נותרו שלבים שלא נענו',
  'rollover.summaryLabel': 'המצב הנוכחי של השנה',

  // The rail. §5.15's seven steps, in order.
  'rollover.step.year': 'שנת הפעילות',
  'rollover.step.closures': 'ימי סגירה',
  'rollover.step.groups': 'קבוצות',
  'rollover.step.students': 'חניכים',
  'rollover.step.prices': 'מחירים',
  'rollover.step.generate': 'יצירת שיעורים',
  'rollover.step.announce': 'הודעה להורים',

  // Never colour alone (SC 1.4.1) — every status on the rail is written out as a word.
  'rollover.status.pending': 'ממתין',
  'rollover.status.done': 'הושלם',
  'rollover.status.skipped': 'דולג',
  'rollover.statusLabel': 'מצב השלב',

  // The two derived steps. The server refuses a manual mark on them with a 409, so the
  // screen never offers one — this is the sentence that explains why.
  'rollover.derivedHint': 'השלב הזה נגזר מהנתונים ואינו מסומן ידנית',
  'rollover.markDone': 'סיימתי את השלב',
  'rollover.skipStep': 'דילוג על השלב',
  'rollover.continue': 'המשך',

  // Bulk outcomes, shared by the three bulk steps.
  'rollover.applied': 'עודכנו {{count}} רשומות',
  'rollover.appliedNone': 'לא נדרש שינוי',
  'rollover.refusedTitle': 'רשומות שלא עודכנו',
  'rollover.refusedCaption': 'כל רשומה שלא עודכנה, והסיבה',
  'rollover.refusedId': 'מזהה',
  'rollover.refusedReason': 'סיבה',
  'rollover.refusal.not_found': 'הרשומה לא נמצאה',
  'rollover.refusal.empty_name': 'שם ריק',
  'rollover.refusal.already_ended': 'הרישום כבר הסתיים',
  'rollover.refusal.destination_not_found': 'קבוצת היעד לא נמצאה',
  'rollover.refusal.destination_retired': 'קבוצת היעד אינה פעילה',

  'rollover.count.closures': 'ימי סגירה',
  'rollover.count.groups': 'קבוצות פעילות',
  'rollover.count.students': 'חניכים רשומים',
  'rollover.count.plans': 'מסלולים פתוחים',
  'rollover.count.sessions': 'שיעורים שנוצרו',

  // Step 1 — the year itself.
  'rollover.year.title': 'שנת הפעילות החדשה',
  'rollover.year.intro': 'השנה נפתחת כטיוטה. אפשר לשנות הכול עד שמפעילים אותה בשלב האחרון.',
  'rollover.year.name': 'שם השנה',
  'rollover.year.startsOn': 'תאריך פתיחה',
  'rollover.year.endsOn': 'תאריך סיום',
  'rollover.year.endsBeforeStart': 'תאריך הסיום חייב להיות אחרי תאריך הפתיחה',
  'rollover.year.create': 'פתיחת שנה בטיוטה',
  'rollover.year.created': 'השנה נפתחה כטיוטה',
  'rollover.year.missing': 'אין שנת פעילות בטיוטה',
  'rollover.year.missingHint': 'פתחו שנה חדשה כדי להתחיל את הגלגול',
  'rollover.year.nameRequired': 'יש להזין שם לשנה',
  'rollover.year.datesRequired': 'יש להזין תאריך פתיחה ותאריך סיום',
  'rollover.year.endBeforeStart': 'תאריך הסיום חייב להיות אחרי תאריך הפתיחה',
  'rollover.year.dates': 'מועדי השנה',
  'rollover.year.statusLabel': 'מצב השנה',
  'rollover.year.createFailed': 'לא הצלחנו לפתוח את השנה',

  // Step 2 — closures. §5.6's rule holds inside the wizard exactly as it does on 6a.
  'rollover.closures.title': 'ימי סגירה בשנה החדשה',
  'rollover.closures.intro': 'חגים ומועדים הם הצעה בלבד. שום יום אינו נסגר עד שמסמנים אותו ולוחצים על הוספה.',
  'rollover.closures.existing': 'הוגדרו {{count}} ימי סגירה לשנה הזו',
  'rollover.closures.showPresets': 'הצגת חגים ומועדים',
  'rollover.closures.presetsLegend': 'סמנו את הימים שבהם המועדון סגור',
  'rollover.closures.apply': 'הוספת הימים המסומנים',
  'rollover.closures.none': 'לא נבחרו ימים',
  'rollover.closures.manualLegend': 'טווח סגירה ידני',
  'rollover.closures.dateFrom': 'מתאריך',
  'rollover.closures.dateTo': 'עד תאריך',
  'rollover.closures.reason': 'סיבה',
  'rollover.closures.add': 'הוספת סגירה',
  'rollover.closures.reasonRequired': 'יש לציין סיבה לסגירה',
  'rollover.closures.endBeforeStart': 'תאריך הסיום אינו יכול להקדים את תאריך ההתחלה',
  'rollover.closures.added': 'הסגירה נוספה. בוטלו {{count}} שיעורים.',
  'rollover.closures.failed': 'לא הצלחנו להוסיף את הסגירה',

  // Step 3 — groups.
  'rollover.groups.title': 'קבוצות לשנה הבאה',
  'rollover.groups.intro': 'קבוצה שנשארת כמות שהיא אינה דורשת פעולה. אפשר לשנות שם, להוציא קבוצה משימוש או להוסיף חדשה.',
  'rollover.groups.caption': 'קבוצות המועדון והפעולה שנבחרה לכל אחת',
  'rollover.groups.colName': 'שם הקבוצה',
  'rollover.groups.colRename': 'שם חדש',
  'rollover.groups.colClass': 'חוג',
  'rollover.groups.colState': 'מצב',
  'rollover.groups.colAction': 'פעולה',
  'rollover.groups.nameLabel': 'שם הקבוצה {{name}}',
  'rollover.groups.active': 'פעילה',
  'rollover.groups.retired': 'הוצאה משימוש',
  'rollover.groups.retire': 'הוצאה משימוש',
  'rollover.groups.revive': 'החזרה לפעילות',
  'rollover.groups.markedRetire': 'סומנה להוצאה משימוש',
  'rollover.groups.markedRevive': 'סומנה להחזרה לפעילות',
  'rollover.groups.undo': 'ביטול הסימון',
  'rollover.groups.empty': 'לא הוגדרו קבוצות',
  'rollover.groups.createLegend': 'קבוצה חדשה',
  'rollover.groups.createClass': 'חוג',
  'rollover.groups.createName': 'שם הקבוצה',
  'rollover.groups.createDescription': 'תיאור',
  'rollover.groups.createAgeMin': 'גיל מינימלי',
  'rollover.groups.createAgeMax': 'גיל מקסימלי',
  'rollover.groups.addCreate': 'הוספה לרשימת החדשות',
  'rollover.groups.createNameRequired': 'יש להזין שם לקבוצה',
  'rollover.groups.createClassRequired': 'יש לבחור חוג',
  'rollover.groups.pendingCreates': 'קבוצות חדשות שייווצרו',
  'rollover.groups.apply': 'שמירת השינויים בקבוצות',
  'rollover.groups.nothingToApply': 'לא נבחרו שינויים',
  'rollover.groups.confirmTitle': 'הוצאת קבוצות משימוש',
  'rollover.groups.confirmBody': '{{count}} קבוצות ייצאו משימוש. השיעורים שכבר היו נשמרים, ולשנה החדשה לא ייווצרו להן שיעורים.',
  'rollover.groups.confirm': 'אישור השינויים',
  'rollover.groups.failed': 'לא הצלחנו לשמור את השינויים בקבוצות',

  // Step 4 — students. §5.15 forbids automatic age promotion in v1, and the screen says so.
  'rollover.students.title': 'חניכים לשנה הבאה',
  'rollover.students.intro': 'חניך שנשאר בקבוצה שלו ממשיך כרגיל ואינו דורש פעולה.',
  'rollover.students.noAutoPromotion': 'אין העלאת קבוצה אוטומטית לפי גיל. כל מעבר נבחר ידנית.',
  'rollover.students.caption': 'רישומי החניכים הפעילים והפעולה שנבחרה לכל אחד',
  'rollover.students.colStudent': 'חניך',
  'rollover.students.colGroup': 'קבוצה נוכחית',
  'rollover.students.colMove': 'מעבר לקבוצה',
  'rollover.students.colReturning': 'לא חוזר בשנה הבאה',
  'rollover.students.stay': 'נשאר בקבוצה',
  'rollover.students.moveLabel': 'מעבר לקבוצה עבור {{name}}',
  'rollover.students.notReturningLabel': '{{name}} אינו חוזר בשנה הבאה',
  'rollover.students.empty': 'אין רישומים פעילים',
  'rollover.students.apply': 'שמירת השינויים בחניכים',
  'rollover.students.nothingToApply': 'לא נבחרו שינויים',
  'rollover.students.confirmTitle': 'סיום רישום של חניכים',
  'rollover.students.confirmBody': 'רישום של {{count}} חניכים יסתיים. אפשר לרשום אותם מחדש בכל שלב.',
  'rollover.students.confirm': 'אישור השינויים',
  'rollover.students.failed': 'לא הצלחנו לשמור את השינויים בחניכים',

  // Step 5 — prices. The copy carries §5.15's rule: plans are CLOSED, never overwritten.
  'rollover.prices.title': 'מחירים לשנה הבאה',
  'rollover.prices.newTitle': 'פתיחת מסלול חדש',
  'rollover.prices.newHint': 'למועדון בשנתו הראשונה — פתחו כאן את המסלולים. עריכה מלאה במסך המחירים',
  'rollover.prices.newName': 'שם המסלול',
  'rollover.prices.newVolume': 'אימונים בשבוע',
  'rollover.prices.newMonthly': 'מחיר חודשי (₪)',
  'rollover.prices.newFee': 'דמי רישום (₪, לא חובה)',
  'rollover.prices.newSubmit': 'פתיחת המסלול',
  'rollover.prices.newCreated': 'המסלול נפתח',
  'rollover.prices.newFailed': 'פתיחת המסלול נכשלה. נסו שוב',
  'rollover.prices.fullScreen': 'לניהול מלא — מסך המחירים',
  'rollover.prices.intro': 'מסלול לא נערך במקומו. המסלול הקיים נסגר ביום שלפני פתיחת השנה, ומסלול ממשיך נפתח ביום הפתיחה.',
  'rollover.prices.keepsHistory': 'החיובים של השנה שעברה ממשיכים להיות מוסברים לפי המסלול שהיה בתוקף אז.',
  'rollover.prices.caption': 'המסלולים הפתוחים, המחיר הנוכחי והמחיר החדש',
  'rollover.prices.colPlan': 'מסלול',
  'rollover.prices.colCurrent': 'מחיר חודשי נוכחי',
  'rollover.prices.colNew': 'מחיר חודשי חדש',
  'rollover.prices.colFee': 'דמי רישום חדשים',
  'rollover.prices.newAmountLabel': 'מחיר חודשי חדש למסלול {{name}}',
  'rollover.prices.newFeeLabel': 'דמי רישום חדשים למסלול {{name}}',
  'rollover.prices.feeHint': 'שדה ריק — דמי הרישום נשארים כפי שהם',
  'rollover.prices.badAmount': 'סכום לא תקין',
  'rollover.prices.empty': 'אין מסלולים פתוחים',
  'rollover.prices.apply': 'עדכון המחירים',
  'rollover.prices.nothingToApply': 'לא הוזנו מחירים חדשים',
  'rollover.prices.confirmTitle': 'עדכון מחירים',
  'rollover.prices.confirmBody': '{{count}} מסלולים ייסגרו ויקבלו מסלול ממשיך במחיר החדש. המסלולים הקיימים נסגרים ואינם נדרסים.',
  'rollover.prices.confirm': 'אישור עדכון המחירים',
  'rollover.prices.failed': 'לא הצלחנו לעדכן את המחירים',

  // Step 6 — generate. Derived: it ticks itself the moment sessions exist.
  'rollover.generate.title': 'יצירת שיעורי השנה',
  'rollover.generate.intro': 'יצירת כל השיעורים לשנה החדשה לפי הלו״ז השבועי של כל קבוצה, בניכוי ימי הסגירה.',
  'rollover.generate.run': 'יצירת השיעורים',
  'rollover.generate.running': 'יוצר שיעורים…',
  'rollover.generate.result': 'נוצרו {{sessions}} שיעורים עבור {{groups}} קבוצות',
  'rollover.generate.existing': 'קיימים {{count}} שיעורים לשנה הזו',
  'rollover.generate.failed': 'לא הצלחנו ליצור את השיעורים',

  // Step 7 — announce, then activate. §5.15 makes the announcement optional in as many words.
  'rollover.announce.title': 'הודעה להורים והפעלת השנה',
  'rollover.announce.optional': 'השלב הזה אינו חובה. אפשר לדלג עליו ולהפעיל את השנה בלי לשלוח הודעה.',
  'rollover.announce.intro': 'פרסום הלו״ז החדש לכל ההורים בפעולה אחת.',
  'rollover.announce.subject': 'כותרת ההודעה',
  'rollover.announce.body': 'תוכן ההודעה',
  'rollover.announce.publish': 'פרסום לכל ההורים',
  'rollover.announce.published': 'ההודעה נשלחה ל־{{count}} משפחות',
  'rollover.announce.missing': 'יש להזין כותרת ותוכן',
  'rollover.announce.failed': 'לא הצלחנו לשלוח את ההודעה',
  'rollover.announce.activateTitle': 'הפעלת השנה',
  'rollover.announce.activateIntro': 'עד להפעלה השנה נשארת טיוטה ואינה מוצגת להורים.',
  'rollover.announce.activate': 'הפעלת השנה',
  'rollover.announce.activated': 'שנת הפעילות הופעלה',
  'rollover.announce.activateFailed': 'לא הצלחנו להפעיל את השנה',

  'rollover.dialog.cancel': 'ביטול',

  // -- training plans (2026-08-27 spec wave) -----------------------------------
  // The club sells 300 / 400 / 550 ₪. Base training is included in every plan and is
  // never marked; what a plan sells is access to the other days.
  'plan.title': 'המסלול שלי',
  'plan.monthly': 'לחודש',
  'plan.alwaysIncluded': 'תמיד כלול',
  'plan.thisWeeksExtra': 'האימון הנוסף שלי השבוע',
  'plan.remaining': 'נותרו {{count}}',
  'plan.unlimited': 'ללא הגבלה שבועית',
  'plan.chooseOne': 'אפשר לבחור אימון אחד. מתאפס בכל יום ראשון.',
  'plan.mark': 'סימון הגעה',
  'plan.release': 'ביטול הסימון',
  'plan.marked': 'סומן',
  'plan.noExtras': 'אין אימונים נוספים פתוחים לקבוצה שלכם השבוע',
  // Every refusal names its reason -- 'אי אפשר לסמן' בלי הסבר זו שיחת טלפון למנהל.
  'plan.reason.started': 'האימון כבר התחיל',
  'plan.reason.no_credits': 'האימון הנוסף השבוע כבר נוצל',
  'plan.reason.needs_unlimited': 'נדרש מסלול ללא הגבלה שבועית',
  'plan.reason.no_plan': 'לא הוגדר מסלול לחניך',
  'plan.upgrade': 'שדרוג המסלול',
  'plan.switch': 'מעבר למסלול',
  'plan.current': 'המסלול הנוכחי',
  // A plan that adds nothing is SHOWN with its reason, never hidden: הורה ששמע על 550
  // ולא מוצא אותו באפליקציה מתקשר למנהל.
  'plan.notOffered': 'המסלול הזה לא מוסיף אימונים בלו״ז הנוכחי של הקבוצה',
  'plan.scheduledChange': 'שינוי מסלול מתוכנן',
  'plan.effectiveOn': 'ייכנס לתוקף ב־{{date}}',
  'plan.cancelChange': 'ביטול השינוי',
  'plan.changeRequested': 'הבקשה נרשמה. המנהל ייצור קשר לגבי התשלום.',
  'plan.choose': 'בחירת המסלול',
  'plan.confirmTitle': 'אישור מעבר למסלול',
  'plan.howWillYouPay': 'איך תרצו לשלם?',
  'plan.alreadyPaid': 'כבר שילמתי',
  'plan.claimMethod': 'איך שולם?',
  'plan.claimHint': 'המנהל יקבל הודעה ויאשר שהתשלום התקבל.',
  'plan.claimSent': 'הבקשה נשלחה למנהל. המסלול יעודכן לאחר אישור התשלום.',
  'plan.confirmSend': 'שליחת הבקשה',
  'plan.confirmCancel': 'ביטול',
  'plan.claimPending': 'הדיווח על התשלום ממתין לאישור המנהל',
  'plan.claimDeclined': 'המנהל סימן שהתשלום לא התקבל. אפשר לפנות למועדון או לשלוח שוב.',
  // -- the 2026-09-08 redesign ------------------------------------------------
  // The screen is titled after the CHILD. It is per child, reached per child, and a family
  // with two children had two screens with identical headings.
  'plan.titleFor': 'המסלול של {{name}}',
  // The pill's label when several children are enrolled and none is selected. It names
  // no amount on purpose: summing two children's prices into one figure would be a
  // number the club does not charge, and silently showing the first child's is a lie
  // about whose plan it is.
  'plan.familyPill': 'מסלולים',
  'plan.currentHeading': 'המסלול הנוכחי',
  'plan.otherPlans': 'מסלולים אחרים',
  // The direction, said in words. `plan.upgrade` above is 'שדרוג המסלול'; a family moving
  // 550 to 300 was told they were upgrading, because the button read `is_offered` rather
  // than the price.
  'plan.downgrade': 'מעבר למסלול חסכוני',
  // What a change actually does, said BEFORE the parent commits. The upgrade line is
  // §15's open item 3 on the screen: access opens now, the price moves on the 1st, and the
  // club carries the difference deliberately.
  'plan.upgradeEffect': 'האימונים נפתחים מיד. החיוב החדש יעלה ב־1 ב{{month}} — על החודש הזה לא מגיע תשלום נוסף.',
  'plan.downgradeEffect': 'המסלול ישתנה ב־1 ב{{month}}. עד אז לא משתנה כלום, והאימונים שכבר סומנו נשמרים.',
  'plan.changeFromTo': 'מ־{{from}} ל־{{to}}',
  // The derived card's words, for a plan the landing page has no copy for.
  'plan.cadence': '{{count}} אימונים בשבוע',
  'plan.cadenceOpen': 'אימונים ללא הגבלה',
  'plan.feature.base': 'אימוני הבסיס הקבועים של הקבוצה',
  'plan.feature.baseOnly': 'ללא אימונים נוספים',
  'plan.feature.extras': 'עוד {{count}} אימון נוסף בשבוע, לבחירתכם',
  'plan.feature.unlimited': 'כל האימונים במערכת, ללא הגבלה שבועית',
  'plan.feature.private': 'אימון פרטני בשבת',
  // The extras counter, in place of a paragraph plus a dashed empty state.
  'plan.extrasCount': '{{used}} / {{total}}',
  'plan.noExtrasShort': 'אין אימונים נוספים פתוחים השבוע',
  // -- the money a plan change moves (2026-09-08) ------------------------------
  // C1: the confirm step asked "how would you like to pay?" and its default answer
  // recorded the change and said the manager would telephone. It now names the family's
  // OWN route — `student.payment_method` — and does what that route needs.
  'plan.route.heading': 'אמצעי התשלום שלכם: {{method}}',
  'plan.route.pickMethod': 'איך תשלמו על המסלול?',
  // Card. There is no proration by design, so an upgrade mid-month has nothing to charge
  // today — saying so is what stops a parent thinking the payment failed.
  'plan.route.cardNothingDue': 'אין מה לשלם כרגע. החיוב החדש יעלה ב־1 בחודש הבא.',
  'plan.route.cardPay': 'תשלום בכרטיס',
  // Cash. The club's floor is a MINIMUM and the twelve-month ceiling beats it.
  'plan.route.cashMonths': 'כמה חודשים תשלמו מראש?',
  'plan.route.cashMonthsChip': '{{count}} חודשים',
  'plan.route.cashNoHeadroom': 'שילמתם מראש עד {{month}} — אין מה לשלם קדימה כרגע.',
  'plan.route.cashSend': 'שליחת בקשה למנהל',
  // הוראת קבע — two steps, and the second is the one the club loses money on.
  'plan.route.mandateTitle': 'הוראת קבע — שני צעדים',
  'plan.route.mandateStepOne': 'חתימה על הוראת קבע חדשה',
  'plan.route.mandateStepTwo': 'ביטול ההוראה הישנה ({{amount}}) בבנק שלכם',
  'plan.route.mandateWarning': 'אחרת המועדון יגבה את שני הסכומים.',
  'plan.route.mandateLink': 'לקישור החתימה',
  'plan.route.mandateMissing': 'המועדון עדיין לא הגדיר קישור למסלול הזה. הוא ייצור אתכם קשר.',
  // Cheques buy a season for the FAMILY, not for one child.
  'plan.route.chequeSend': 'אביא צ׳קים',
  'plan.route.done': 'הבקשה נרשמה.',
  'plan.route.cancel': 'ביטול',
  'plan.group.kind': 'סוג הקבוצה',
  'plan.group.kind.base': 'אימון בסיס',
  'plan.group.kind.extra': 'אימון נוסף',
  'plan.group.kind.private': 'אימון פרטני',
  'plan.group.inviteOnly': 'הצטרפות בהזמנה בלבד',
  'plan.group.eligibility': 'קבוצות בסיס שרשאיות להשתתף',
  // -- בית, the parent app's home tab (the redesign of 2026-09-05) ---------------
  //
  // WHAT THE PROTOTYPE HARD-CODES AND THIS DOES NOT. The prototype's home is written for
  // one family: "שלום, משפחת כהן", "חוב שכר לימוד ₪320", "3" children, three named chips,
  // "עונת תשפ״ה (2025/26)". Every one of those is a value at the call site, and where the
  // API has no source for one it is ABSENT rather than invented — the season line most of
  // all: `SessionRow.training_year_id` is a uuid and nothing resolves it to a name, so the
  // greeting renders the family alone rather than a Hebrew year guessed on the client.
  'home.greeting': 'שלום',
  'home.greetingFamily': 'שלום, משפחת {{name}}',
  'home.reportAbsence': 'דיווח היעדרות',
  'home.notificationsTitle': 'התראות והודעות מהמאמן',
  'home.notificationsLabel': 'התראות מהמאמן',
  // Named for the banner it was written for; `HomeSchedule` reuses it as a plain
  // bullet between a location and a coach, which is why it outlived the banner.
  'home.urgentSeparator': ' • ',
  'home.allChildren': 'כל התלמידים',
  // -- the week strip. `weekStripLabel` names the landmark for a screen reader; the port
  //    first fell back to the day headline, which reads as a date rather than a control --
  'home.weekStripLabel': 'בחירת יום',
  'home.monthButton': 'חודש',
  'home.monthButtonTitle': 'פתיחת לוח חודשי מלא',
  'home.today': 'היום',
  // -- the day headline's count. 'פעילויות' and not the prototype's 'שיעורים': §5.12's
  //    events sit in this list too (§4), and a competition counted as a lesson is a
  //    sentence that is simply false on any day a family has one --
  'home.noSessionsPlanned': 'אין פעילויות מתוכננות',
  'home.oneSessionPlanned': 'פעילות אחת מתוכננת',
  'home.manySessionsPlanned': '{{count}} פעילויות מתוכננות',
  // -- the session card --
  'home.absentQuestion': 'נעדר/ת?',
  'home.absentReported': 'דווח ✓',
  // The badge the staff roster and the dashboard count are both built to read.
  'home.statusReported': 'הודעתם מראש ✓',
  'home.statusScheduled': 'מתוכנן',
  'home.statusCancelled': 'בוטל',
  'home.minutesShort': 'דק׳',
  'home.reminderSet': 'תזכורת ביומן 🔔',
  'home.reminderUnset': 'תזכורת ליומן',
  'home.reminderTitle': 'הגדר תזכורת אישית ביומן המכשיר',
  // -- the empty day --
  'home.emptyTitle': 'אין פעילויות מתוכננות ליום זה',
  'home.emptyBody': 'ניתן לצפות בימים אחרים או בלוח החודשי המלא',
  'home.emptyCta': 'פתיחת לוח חודשי',
  // -- the monthly calendar modal, which is where the deleted drawer's calendar went --
  'home.monthTitle': 'לוח אימונים ואירועים',
  'home.monthSubtitle': 'לוח פעילות חודשי מלא',
  'home.monthClose': 'סגירה',
  'home.monthPrev': 'חודש קודם',
  'home.monthNext': 'חודש הבא',
  'home.monthToday': 'היום',
  'home.monthGridLabel': 'בחירת תאריך',
  'home.monthAgendaEmpty': 'אין אימונים ביום זה',
  'home.monthShowOnHome': 'הצג במסך הבית',
  'home.monthDaySessions': '{{count}} אימונים מתוכננים למשפחה',
  'home.monthDayOneSession': 'אימון אחד מתוכנן למשפחה',
  // -- loading and failure, neither of which the prototype has: it has no network --
  'home.loading': 'טוען את לוח האימונים…',
  'home.loadFailed': 'לא הצלחנו לטעון את לוח האימונים',
  'home.retry': 'נסו שוב',
  // -- §5.12's events, folded into בית's session list (§4) ----------------------
  // The card is not a lesson's: an event asks for an RSVP, which is a different answer to
  // a different question. `eventPending` is what a child with no answer yet shows.
  'home.eventBadge': 'אירוע',
  'home.eventRsvpYes': 'אישרתם ✓',
  'home.eventRsvpNo': 'לא מגיעים',
  'home.eventPending': 'לאישור',
  'home.eventOpen': 'לפרטים ולאישור',
  // -- the per-session calendar reminder (the parent home redesign, 2026-09-05) ---
  //
  // The prototype carries all three languages inline in `REMINDER_OPTIONS`
  // (`labelHe`/`labelEn`/`labelRu`) and picks with a ternary at the call site. That is the
  // arrangement §Conventions exists to prevent — a second string table this module cannot
  // see — so the options live here with every other mirror.
  'reminder.title': 'תזכורת ביומן האישי',
  'reminder.close': 'סגירה',
  'reminder.legend': 'מתי להזכיר?',
  'reminder.save': 'הוספה ליומן',
  // Says what the button actually does. The prototype's modal implies the club is storing
  // the reminder; nothing of the sort happens — a file is saved to this device, and the
  // club never learns of it.
  'reminder.hint': 'התזכורת נשמרת ביומן של המכשיר הזה בלבד. המועדון לא מקבל אותה, והיא לא תעבור למכשיר אחר.',
  'reminder.lead.15min': '15 דקות לפני (התארגנות מהירה)',
  'reminder.lead.30min': '30 דקות לפני (יציאה מהבית — מומלץ)',
  'reminder.lead.1hour': 'שעה לפני (הכנת תיק ובקבוק)',
  'reminder.lead.2hours': 'שעתיים לפני',
  'reminder.lead.1day': 'יום לפני',
  // -- field labels inside the .ics description --
  'reminder.icsChild': 'חניך/ה:',
  'reminder.icsGroup': 'קבוצה:',
  'reminder.icsEvent': 'אירוע:',
  'reminder.icsCoach': 'מאמן/ת:',
  'reminder.icsWhere': 'מיקום:',

  // -- §6.1 of the staff app redesign — coach unavailability, `#/constraints` --------
  // Ported from `~/Downloads/staff-app/src/components/CoachConstraintsScreen.tsx`; see
  // that screen's own header for the three departures from it. The reason is a CODE
  // server-side (`app/models/schedule.py::COACH_CONSTRAINT_REASONS`) — `reason.*` below
  // is the client's translation of it, the same rule the cancel-reason tokens follow.
  'constraint.title': 'הגשת אילוצים וזמינות',
  'constraint.subtitle':
    'עדכנו ימים שבהם לא תוכלו לאמן, כדי שההנהלה תיערך ותשבץ מחליף מראש.',
  'constraint.back': 'חזרה לחשבון',
  'constraint.step1.title': 'בחירת תאריך או טווח ימים',
  'constraint.step1.single': 'יום בודד',
  'constraint.step1.range': 'טווח תאריכים',
  'constraint.step1.date': 'תאריך האילוץ',
  'constraint.step1.rangeStart': 'מתאריך',
  'constraint.step1.rangeEnd': 'עד תאריך',
  'constraint.step1.scopeLegend': 'היקף שעות האילוץ',
  'constraint.step1.allDay': 'כל היום',
  'constraint.step1.specificHours': 'שעות מסוימות',
  'constraint.step1.from': 'משעה',
  'constraint.step1.to': 'עד שעה',
  'constraint.step2.title': 'בחירת סיבת האילוץ',
  // The note field renders — and is required — ONLY when the reason is `other`. The
  // prototype rendered it for every reason via a tautology; this fixes that.
  'constraint.step2.noteLabel': 'פרטו את סיבת האילוץ להנהלה (שדה חובה)',
  'constraint.step2.notePlaceholder': 'למשל: טיפול רפואי בבוקר, אפשר להגיע רק מ-18:00…',
  'constraint.step3.title': 'מחליף מוצע (רשות)',
  'constraint.step3.placeholder': 'שם המאמן שיכול להחליף אתכם, אם יש',
  'constraint.step3.hint': 'זו הצעה בלבד להנהלה — לא שיבוץ. ההנהלה תבחר את המחליף בפועל.',
  'constraint.step3.notePrefix': 'מחליף מוצע: {{name}}',
  'constraint.submit': 'שליחת האילוץ להנהלה',
  'constraint.submitting': 'שולח…',
  'constraint.submitFailed': 'לא הצלחנו לשלוח את האילוץ. נסו שוב.',
  // Waiting, never settled — every constraint this screen files lands `pending`, and
  // approval happens on the dashboard (C12), not here.
  'constraint.filedToast': 'האילוץ נשלח וממתין לתשובת ההנהלה',
  'constraint.validation.rangeOrder': 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
  'constraint.validation.timeOrder': 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
  'constraint.validation.noteRequired': 'יש לפרט את סיבת האילוץ',
  'constraint.history.title': 'ההיסטוריה שלי',
  'constraint.history.empty': 'עדיין לא הגשתם אילוצים',
  'constraint.history.emptyHint': 'אילוץ שתגישו יופיע כאן, עם מצב הטיפול בו',
  'constraint.history.withdraw': 'משיכת האילוץ',
  'constraint.reason.reserve_duty': 'מילואים / צו 8',
  'constraint.reason.competition': 'תחרות / מחנה אימונים',
  'constraint.reason.studies': 'מבחנים / לימודים',
  'constraint.reason.illness': 'מחלה / פציעה',
  'constraint.reason.vacation': 'חופשה פרטית',
  'constraint.reason.family': 'אירוע משפחתי',
  'constraint.reason.other': 'אחר',
  // Never colour alone (SC 1.4.1) — the history badge's colour and this word both say it.
  'constraint.status.pending': 'ממתין לתשובת ההנהלה',
  'constraint.status.approved': 'אושר',
  'constraint.status.refused': 'נדחה',
  'constraint.status.withdrawn': 'בוטל על ידכם',
  // The account tab's own link (`features/account/AccountScreen.tsx`).
  'constraint.account.title': 'אילוצים וזמינות',
  'constraint.account.subtitle': 'הגשת ימי היעדרות למאמנים',

  // -- §4.7 של עיצוב אפליקציית הצוות מחדש — הלוח החודשי, `#/calendar` (נקודת ביקורת C11) --
  //
  // החלטה 7: לאפליקציית הטלפון יש תצוגה חודשית כי זהו המסך היחיד שיכול להראות למאמן/ת את
  // השיעורים והאירועים העתידיים שלו/ה — לא הרצועה של שבעה ימים ולא המטמון הלא־מקוון מגיעים
  // מעבר למחר. `staffCalendar.*` הוא קידומת נפרדת מ־`calendar.*` למעלה, שהוא הלוח החודשי
  // של ילד באפליקציית ההורים (12b) — מסך אחר, קהל אחר, והתנגשות שמות כאן הייתה הופכת שני
  // מושגים למפתח אחד.
  'staffCalendar.title': 'הלוח החודשי',
  'staffCalendar.subtitle': 'כל השיעורים והאירועים של החודש, במבט אחד',
  'staffCalendar.back': 'חזרה ללוח הזמנים',
  // The pill between the two month arrows. It referenced `datePicker.jumpToToday`
  // until 9b was deleted (2026-09-07) and took the whole `datePicker.*` block with
  // it, leaving the call site rendering its own key at the user.
  'staffCalendar.jumpToToday': 'היום',
  'staffCalendar.openButton': 'פתיחת הלוח החודשי',
  // כפתור הכותרת שפותח את `#/constraints` — אותו מסך שכבר מקושר מלשונית החשבון
  // (`constraint.account.*` למעלה); זהו קישור שני, לא תחליף. מנוסח כמו בפרוטוטייפ.
  'staffCalendar.fileConstraint': 'הגש אילוץ',
  // -- מקרא הלוח, מתחת לרשת הימים — תיאור, לא קישוט (SC 1.4.1: לכל תג יש תווית לצידו,
  // הצבע עצמו אינו נושא המשמעות לבדו). מתאר את הסימונים שהמסך הזה מצייר בפועל
  // (תג מונה, נקודת אילוץ, טבעת "היום") — לא את רשימת הפרוטוטייפ אם הן נבדלות.
  'staffCalendar.legend.label': 'מקרא סימוני הלוח',
  'staffCalendar.legend.count': 'שיעורים ואירועים מתוכננים',
  'staffCalendar.legend.constraint': 'אילוץ מאמן רשום',
  // שורת הסינון שהפרוטוטייפ מצייר עבורה חמישה צ׳יפים, ורק שניים מהם באמת מסננים משהו
  // (התיקון של §4.7 עצמו). ההבחנה האמיתית מתחת לפני השטח היא איזו קבוצה מתאמנת, ולכן זו
  // התווית היחידה שהמסך האמיתי צריך; 'הכל' הוא `week.filter.all`, לשימוש חוזר ולא כפילות.
  'staffCalendar.filterLegend': 'סינון לפי קבוצה',
  // השם הנגיש של תא יום (SC 1.4.1 — צבע לבדו אינו נושא משמעות, כך שהנקודה על יום עם אילוץ
  // אינה הדבר היחיד שאומר זאת; `dayConstraint` למטה מתווסף לאותו שם).
  'staffCalendar.dayItemCount': '{{count}} פעילויות ביום זה',
  'staffCalendar.dayItemCount.one': 'פעילות אחת ביום זה',
  'staffCalendar.dayEmpty': 'אין פעילויות ביום זה',
  // `{{reason}}` מגיע כבר מתורגם דרך `constraint.reason.<code>` — לעולם לא קוד גולמי
  // מהשרת שמוקרא בקורא מסך.
  'staffCalendar.dayConstraint': 'יש אילוץ מאמן: {{reason}}',
  // הקישור של לשונית החשבון (`features/account/AccountScreen.tsx`), באותה הצורה ש־
  // `constraint.account.*` למעלה כבר קבע עבור אותה לשונית.
  'staffCalendar.account.title': 'לוח חודשי',
  'staffCalendar.account.subtitle': 'כל השיעורים והאירועים של החודש',

  // -- §5/C12 of the staff app redesign — the DASHBOARD's side: the alert-centre card and
  // the resolution popup it opens. Decision 10: approve or refuse the constraint itself.
  // Decision 11: an alert opening a popup with replacements and actions. Decision 12: the
  // substitute picker shows everyone with a flag, never filtered or ranked — `unavailableTag`
  // is appended to a busy row's own label rather than disabling it, exactly so it stays
  // selectable ("sometimes you ask the busy person anyway").
  'constraint.manager.alertTitle': 'אילוצי מאמנים ממתינים לתשובה',
  'constraint.manager.pendingCount': '{{count}} אילוצים ממתינים לתשובתכם',
  'constraint.manager.pendingCount.one': 'אילוץ אחד ממתין לתשובתכם',
  'constraint.manager.open': 'פתיחה',
  'constraint.manager.openFor': 'פתיחת האילוץ של {{name}}',
  'constraint.manager.dialogTitle': 'טיפול באילוץ',
  'constraint.manager.filedBy': 'הוגש על ידי {{name}}',
  'constraint.manager.window': 'טווח האילוץ',
  'constraint.manager.reason': 'סיבה',
  'constraint.manager.note': 'הערת המאמן/ת',
  'constraint.manager.affectedSessions': 'שיעורים בטווח הזה',
  'constraint.manager.noAffectedSessions': 'אין שיעורים בטווח הזה עבור המאמן/ת',
  'constraint.manager.sessionsLoadFailed': 'לא הצלחנו לטעון את השיעורים בטווח הזה',
  'constraint.manager.currentCoach': 'מאמן/ת משובץ/ת: {{name}}',
  'constraint.manager.noCurrentCoach': 'לא שובץ מאמן/ת לשיעור',
  'constraint.manager.replaceCoachLegend': 'בחירת מחליף/ה לשיעור הזה',
  'constraint.manager.unavailableTag': 'לא זמין/ה בטווח הזה',
  'constraint.manager.noStaff': 'לא נמצא צוות לבדיקה',
  'constraint.manager.decisionTitle': 'החלטת ההנהלה על האילוץ',
  'constraint.manager.substituteLegend': 'מחליף/ה לרישום באילוץ (רשות)',
  'constraint.manager.approve': 'אישור האילוץ',
  'constraint.manager.refuse': 'דחיית האילוץ',
  'constraint.manager.refuseReasonLabel': 'סיבת הדחייה למאמן/ת',
  'constraint.manager.decidedApproved': 'האילוץ אושר. המאמן/ת קיבל/ה הודעה.',
  'constraint.manager.decidedRefused': 'האילוץ נדחה. המאמן/ת קיבל/ה הודעה.',
}
