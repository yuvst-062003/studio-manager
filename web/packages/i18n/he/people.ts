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
  'guardian.primaryHint': 'החשבון יופנה אליו, והוראת קבע תשויך אליו. לשאר ההורים אותן הרשאות בדיוק',
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
  'landing.signInHint': 'ההתחברות שומרת את הפרטים ומאפשרת לעקוב אחרי השיעור באפליקציה',
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
  'request.matchedHint': 'נמצאה התאמה לפי טלפון או אימייל מאומת. אשרו לפני השיוך',
  'request.newFamily': 'משפחה חדשה',

  // -- add a sibling (parent 12g) ------------------------------------------------
  'sibling.title': 'הוספת ילד נוסף',
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
}
