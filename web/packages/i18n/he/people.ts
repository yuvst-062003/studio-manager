import type { Bundle } from '../types'

/**
 * Owned by the PEOPLE lane (M3). Hebrew is the reference locale.
 *
 * Artboards: parent `13a`–`13c` דף נחיתה, `12j` הרשמה ראשונה, `12g` הוספת ילד,
 * `12i` פרופיל ועזיבה, `2c` כרטיס חניך; staff `11b` שיעור ניסיון, `9c`, `9h`;
 * dashboard `3b` חניכים, `3c` הוספת חניך, `4a` כרטיס חניך, `6c` מרכז התראות.
 *
 * Two §5.4 invariants shape the copy and neither is negotiable:
 *  - **Enrollment is always a manager decision.** The public link's only job is a first
 *    lesson, so nothing here promises a place — `trial.*` says שיעור ניסיון, never הרשמה.
 *  - **All guardians are equal** (§5.3). `is_primary` decides bill addressing and הוראת
 *    קבע matching only, so `guardian.primaryHint` explains exactly that and no more.
 *
 * Parent `12i` states the leaving rule plainly, and `leave.debtNotice` carries it: the
 * monthly charge stays the parent's responsibility.
 */
export const people: Bundle = {
  // -- students (dashboard 3b, staff 9h) ----------------------------------------
  'card.open': 'כרטיס חניך',
  'student.payment': 'תשלום',
  'student.payment.overdue': 'חוב',
  'student.payment.open': 'פתוח',
  'student.payment.settled': 'שולם',
  'bulk.selected': '{n} נבחרו',
  'bulk.move': 'העברת קבוצה',
  'bulk.moveConfirm': 'להעביר את החניכים שנבחרו לקבוצה זו?',
  'bulk.leave': 'סימון כעוזבים',
  'bulk.leaveConfirm': 'לסמן את החניכים שנבחרו כעוזבים? ההרשמות הפעילות שלהם ייסגרו.',
  'bulk.applied': '{n} עודכנו',
  'bulk.refused.no_enrollment': 'ללא שיבוץ פעיל',
  'bulk.refused.multiple_enrollments': 'יותר משיבוץ אחד — טפלו בנפרד',
  'bulk.refused.destination_retired': 'קבוצת היעד בארכיון',
  'bulk.refused.already_in_destination': 'כבר בקבוצת היעד',
  'bulk.refused.not_found': 'לא נמצא',
  'bulk.refused.failed': 'נכשל — נסו שוב',
  'student.one': 'חניך',
  'student.plural': 'חניכים',
  'student.add': 'הוספת חניך',
  'student.search': 'חיפוש חניך',
  'student.empty': 'אין חניכים להצגה',
  'student.emptyFiltered': 'אין חניכים שמתאימים לסינון',
  'student.firstName': 'שם פרטי',
  'student.lastName': 'שם משפחה',
  'student.birthdate': 'תאריך לידה',
  'student.age': 'גיל',
  'student.phone': 'טלפון',
  'student.email': 'אימייל',
  'student.joinedOn': 'הצטרף בתאריך',
  'student.leftOn': 'עזב בתאריך',
  'student.group': 'קבוצה',
  'student.groups': 'קבוצות',
  'student.noGroup': 'לא משויך לקבוצה',
  'student.saved': 'החניך נשמר',

  // §4.3's funnel. `lost` is a real outcome, not an absence of one.
  'status.lead': 'ליד',
  'status.trial': 'שיעור ניסיון',
  'status.pending_approval': 'ממתין לאישור',
  'status.active': 'פעיל',
  'status.frozen': 'מוקפא',
  'status.left': 'עזב',
  'status.lost': 'לא הצטרף',
  'status.label': 'סטטוס',
  'status.history': 'היסטוריית סטטוס',
  'status.changedOn': 'שונה בתאריך',
  'status.reason': 'סיבה',

  // -- guardians (§5.3) ----------------------------------------------------------
  'guardian.one': 'הורה',
  'guardian.plural': 'הורים',
  'guardian.add': 'הוספת הורה',
  'guardian.remove': 'הסרת הורה',
  'guardian.relation': 'קרבה',
  'guardian.relation.parent': 'הורה',
  'guardian.relation.grandparent': 'סב/סבתא',
  'guardian.relation.other': 'אחר',
  'guardian.primary': 'הורה ראשי',
  'guardian.setPrimary': 'הגדרה כהורה ראשי',
  // §5.3 — is_primary means exactly two things. The copy says both and stops.
  'guardian.primaryHint':
    'החשבון יופנה אליו, והוראת קבע תשויך אליו. לשאר ההורים אותן הרשאות בדיוק',
  'guardian.empty': 'לא משויכים הורים',
  'guardian.contact': 'יצירת קשר',
  'guardian.call': 'חיוג',
  'guardian.message': 'שליחת הודעה',

  // -- the public landing page (parent 13a–13c) ---------------------------------
  'landing.title': 'שיעור ניסיון חינם',
  'landing.subtitle': 'בחרו קבוצה ומועד, ואנחנו נחזור אליכם',
  'landing.chooseGroup': 'בחירת קבוצה',
  'landing.chooseSlot': 'בחירת מועד',
  'landing.noSlots': 'אין מועדים פנויים בקבוצה הזו',
  'landing.noSlotsHint': 'נסו קבוצה אחרת או חזרו בשבוע הבא',
  'landing.signInFirst': 'התחברות והמשך',
  // §5.4 — sign-in-first, so the copy explains why before the sign-in wall.
  'landing.signInHint':
    'ההתחברות שומרת את הפרטים ומאפשרת לעקוב אחרי השיעור באפליקציה',
  'landing.submit': 'שריון מקום לשיעור',
  'landing.submitting': 'שולח…',
  'landing.ageRange': 'גילאים',
  'landing.weeklySchedule': 'מתאמנים בימים',

  // -- after submitting (parent 13b) --------------------------------------------
  'submitted.title': 'נרשמתם לשיעור ניסיון',
  'submitted.subtitle': 'נשלח אליכם תזכורת לפני השיעור',
  'submitted.whatNext': 'מה עכשיו?',
  'submitted.bringHint': 'הגיעו עשר דקות לפני, בבגדים נוחים',
  'submitted.installApp': 'התקנת האפליקציה',
  'submitted.done': 'סיום',

  // -- trials (staff 11b) --------------------------------------------------------
  'trial.one': 'שיעור ניסיון',
  'trial.plural': 'שיעורי ניסיון',
  'trial.bookedFor': 'נקבע לתאריך',
  'trial.attended': 'הגיע',
  'trial.didNotAttend': 'לא הגיע',
  // Three states — `pending` is "the lesson has not happened yet", not "no answer".
  'trial.pending': 'טרם התקיים',
  'trial.outcome.pending': 'ממתין להחלטה',
  'trial.outcome.converted': 'הצטרף',
  'trial.outcome.lost': 'לא הצטרף',
  'trial.coachNote': 'הערת המאמן',
  'trial.addDuringClass': 'הוספת חניך לשיעור',
  // §5.4 — a manager granting a SECOND free trial is deliberate and visible.
  'trial.override': 'אישור שיעור ניסיון נוסף',
  'trial.overrideHint': 'החניך כבר מימש שיעור ניסיון. אישור נוסף יירשם על שמכם',
  'trial.convert': 'צירוף למועדון',

  // -- enrollment ----------------------------------------------------------------
  'enrollment.one': 'רישום לקבוצה',
  'enrollment.plural': 'רישומים',
  'enrollment.add': 'רישום לקבוצה',
  'enrollment.startedOn': 'מתאריך',
  'enrollment.endedOn': 'עד תאריך',
  'enrollment.status.pending': 'ממתין',
  'enrollment.status.active': 'פעיל',
  'enrollment.status.frozen': 'מוקפא',
  'enrollment.status.ended': 'הסתיים',
  'enrollment.moveGroup': 'מעבר קבוצה',
  'enrollment.group': 'קבוצה',
  'enrollment.noGroupYet': 'עדיין לא',
  'enrollment.empty': 'אין רישומים',

  // -- the approval queue (dashboard 6c) ----------------------------------------
  'request.title': 'בקשות הצטרפות',
  'request.plural': 'בקשות',
  'request.empty': 'אין בקשות ממתינות',
  'request.submittedAt': 'הוגש בתאריך',
  'request.source.public_link': 'מהאתר',
  'request.source.parent_app': 'מאפליקציית ההורים',
  'request.source.manager': 'הוזן במשרד',
  'request.approve': 'אישור',
  'request.reject': 'דחייה',
  'request.approveInGroup': 'אישור ושיוך לקבוצה',
  'request.rejectReason': 'סיבת הדחייה',
  'request.approved': 'הבקשה אושרה',
  'request.rejected': 'הבקשה נדחתה',
  // §5.4 — matching is on VERIFIED email or phone, so the copy never claims certainty.
  'request.matchedPerson': 'ייתכן שזה אותו הורה',
  'request.matchedHint':
    'נמצאה התאמה לפי טלפון או אימייל מאומת. אשרו לפני השיוך',
  'request.newFamily': 'משפחה חדשה',

  // -- add a sibling (parent 12g) ------------------------------------------------
  'sibling.title': 'הוספת ילד נוסף',
  'join.title': 'הצטרפות למועדון — הרשמת משפחה',
  'directions.title': 'הוראות הגעה',
  'directions.openMaps': 'פתיחה במפות',
  'directions.call': 'התקשרות למועדון',
  'directions.noAddress': 'המועדון עדיין לא הזין כתובת — התקשרו לברר.',
  'join.chip': 'נרשמו דרך הקישור',
  'join.expired': 'הקישור פג תוקף',
  'join.expiredHint': 'בקשו מהמועדון קישור חדש.',
  'join.parentDetails': 'פרטי הורה',
  'join.firstName': 'שם פרטי',
  'join.lastName': 'שם משפחה',
  'join.phone': 'טלפון',
  'join.email': 'אימייל (מהחשבון המחובר)',
  'join.child': 'ילד/ה',
  'join.addChild': 'הוספת ילד נוסף',
  'join.removeChild': 'הסרה',
  'join.groups': 'קבוצות',
  'join.selfStudent': 'אני התלמיד/ה',
  'join.birthdate': 'תאריך לידה',
  'join.submit': 'שליחה',
  'join.done': 'נרשמתם! נשאר רק להשלים את הצהרת הבריאות באפליקציה.',
  'join.toApp': 'כניסה לאפליקציה',
  'join.card.title': 'קישור הצטרפות למועדון',
  'join.card.active': 'פעיל · יפוג {{date}}',
  'join.card.inactive': 'אין קישור פעיל',
  'join.card.registered': 'משפחות נרשמו',
  'join.card.new': 'קישור חדש',
  'join.card.revoke': 'ביטול',
  'join.card.copy': 'העתקה',
  'join.card.copied': 'הועתק',
  'join.card.onceNote': 'הקישור מוצג פעם אחת — העתיקו ושתפו עכשיו.',
  'landing.card.title': 'דף הנחיתה של המועדון',
  'landing.card.hint': 'לשיתוף עם משפחות חדשות — הרשמה לשיעור ניסיון.',
  'sibling.subtitle': 'הילד יתווסף לאותו חשבון',
  'sibling.submit': 'שליחת בקשה',
  // §5.4 — enrollment is always a manager decision, so this promises review, not a place.
  'sibling.pendingHint': 'הבקשה תיבדק במשרד המועדון',

  // -- freeze and leave (parent 12i) --------------------------------------------
  'freeze.title': 'הקפאת חברות',
  'freeze.from': 'מתאריך',
  'freeze.to': 'עד תאריך',
  'freeze.openEnded': 'ללא תאריך סיום',
  'freeze.reason': 'סיבה',
  'freeze.submit': 'הקפאה',
  'freeze.active': 'החברות מוקפאת',
  'leave.title': 'עזיבת המועדון',
  'leave.date': 'תאריך עזיבה',
  'leave.reason': 'סיבה',
  'leave.submit': 'אישור עזיבה',
  // Parent `12i`, verbatim in intent: leaving is not a refund.
  'leave.debtNotice': 'החיוב החודשי נשאר באחריות ההורה',
  'leave.confirm': 'לעזוב את המועדון?',

  // -- the funnel report ---------------------------------------------------------
  'funnel.title': 'משפך הצטרפות',
  'funnel.leads': 'לידים',
  'funnel.trials': 'שיעורי ניסיון',
  'funnel.converted': 'הצטרפו',
  'funnel.lost': 'לא הצטרפו',
  'funnel.conversionRate': 'שיעור המרה',

  // -- the landing page's remaining copy (parent 13a, 13c) -----------------------
  'landing.aboutTitle': 'על המועדון',
  'landing.whereTitle': 'איפה מתאמנים',
  'landing.groupsTitle': 'הקבוצות שלנו',
  'landing.noGroups': 'המועדון עדיין לא פרסם קבוצות',
  'landing.scheduleComeLater': 'לוח השיעורים עדיין נבנה. נסו שוב בקרוב',
  'landing.notFound': 'לא מצאנו את המועדון הזה',
  'landing.step.signIn': 'התחברות',
  'landing.step.children': 'פרטי הילדים',
  'landing.step.health': 'הצהרת בריאות',
  'landing.step.slot': 'בחירת שיעור',
  'landing.step.done': 'אישור',
  'landing.addChild': 'הוספת ילד נוסף',
  'landing.removeChild': 'הסרה',
  'landing.slotUnavailable': 'השיעור בוטל',
  'landing.tooYoung': 'הקבוצה מיועדת לגילאים אחרים',
  'landing.error': 'לא הצלחנו לשמור את הבקשה. נסו שוב',
  'landing.rateLimited': 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות',
  'landing.alreadyUsed': 'כבר מימשתם שיעור ניסיון. פנו למועדון',
  'landing.back': 'חזרה',
  'landing.next': 'המשך',

  // §5.4a step 3 — the SHORT trial form, against the seeded kind='trial' template.
  'trialHealth.title': 'הצהרת בריאות לשיעור ניסיון',
  'trialHealth.subtitle':
    'שאלות קצרות. את הטופס המלא תמלאו באפליקציה אחרי השיעור',
  'trialHealth.confirm': 'אני מאשר/ת שהפרטים נכונים',
  'trialHealth.required': 'יש לאשר כדי להמשיך',

  // -- §6.3's reduced trial home -------------------------------------------------
  'trialHome.title': 'השיעור הראשון',
  'trialHome.countdown': 'עוד {n} ימים',
  'trialHome.tomorrow': 'מחר',
  'trialHome.today': 'היום',
  'trialHome.addToCalendar': 'הוספה ליומן',
  'trialHome.directions': 'איך מגיעים',
  'trialHome.whatToBring': 'מה להביא',
  'trialHome.whatToBringHint': 'בגדים נוחים ובקבוק מים. הגיעו עשר דקות לפני',
  'trialHome.howWasIt': 'איך היה?',
  'trialHome.waitingForClub': 'המועדון יחזור אליכם אחרי השיעור',

  // -- the containers (parent 2c, dashboard 6c) ---------------------------------
  'card.title': 'כרטיס חניך',
  'card.details': 'פרטים',
  'card.enrollments': 'קבוצות',
  'alerts.title': 'מרכז התראות',
  'alerts.empty': 'אין התראות שדורשות טיפול',
  'alerts.pendingRequests': 'בקשות הצטרפות ממתינות',
  'alerts.upcomingTrials': 'שיעורי ניסיון קרובים',
  'alerts.trialsAwaitingDecision': 'שיעורי ניסיון שממתינים להחלטה',
  'alerts.viewAll': 'הצגת הכול',

  // -- C12's day checkboxes ------------------------------------------------------
  'weekdays.title': 'באילו ימים מגיע/ה?',
  'weekdays.hint': 'סמנו את הימים שבהם החניך מתאמן. ברירת המחדל היא כל הימים',
  'weekdays.allDays': 'כל הימים',
  'weekdays.noSchedule': 'לקבוצה הזו עדיין אין לוח שיעורים',
  'weekdays.0': 'ראשון',
  'weekdays.1': 'שני',
  'weekdays.2': 'שלישי',
  'weekdays.3': 'רביעי',
  'weekdays.4': 'חמישי',
  'weekdays.5': 'שישי',
  'weekdays.6': 'שבת',

  // -- conversion (staff 11b, dashboard 4a). L2 — an id, never an amount.
  'convert.title': 'צירוף למועדון',
  'convert.group': 'קבוצה',
  'convert.startedOn': 'מתאריך',
  'convert.pricePlan': 'מסלול מחיר',
  'convert.pricePlanHint': 'המסלולים ייבחרו במסך המחירים',
  'convert.weeklyVolume': 'אימונים בשבוע',
  'convert.submit': 'צירוף',
  'convert.markLost': 'סימון כלא הצטרף',
  'convert.markLostReason': 'למה לא הצטרפו?',
  'convert.moveGroupLeadOnly': 'רק המאמן הראשי יכול להעביר כיתה',

  // -- documents column (dashboard 3b). In `people` and not `health` — that namespace
  // belongs to M4, and a lane borrowing another's serializes both.
  'document.missing': 'חסרה הצהרה',
  'document.trialSigned': 'הצהרת ניסיון',
  'document.signed': 'הצהרה מלאה',

  // -- errors and empty states ---------------------------------------------------
  'error.scheduleUnavailable': 'לוח השיעורים של המועדון עדיין לא נבנה',
  'error.notFound': 'לא נמצא',
  'error.forbidden': 'אין לכם הרשאה לפעולה הזו',
  'error.generic': 'משהו השתבש. נסו שוב',
  'search.placeholder': 'שם החניך',
  'table.results': '{n} תוצאות',
  'table.loadMore': 'טעינת עוד',
}
