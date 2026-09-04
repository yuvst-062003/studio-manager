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
  // B2.3 — the selection column's accessible name. Visually hidden: the column is a
  // bare checkbox, and its old header (`bulk.move`) wrongly named ONE of the two bulk
  // actions the selection enables, not the column itself.
  'student.selectColumn': 'בחירה',
  'student.one': 'חניך',
  'student.plural': 'חניכים',
  'student.add': 'הוספת חניך',
  // B2.1 — `PageHeader`'s subtitle, once `הוספת חניך` moves into the actions slot.
  'student.countSubtitle': '{{count}} חניכים',
  'student.search': 'חיפוש חניך',
  'student.empty': 'אין חניכים להצגה',
  'student.emptyFiltered': 'אין חניכים שמתאימים לסינון',
  'student.firstName': 'שם פרטי',
  'student.lastName': 'שם משפחה',
  'student.birthdate': 'תאריך לידה',
  'student.age': 'גיל',
  'student.phone': 'טלפון',
  'student.email': 'אימייל',
  // -- dashboard 3c, decision 20 — student-first, three fields ------------------
  'student.fullName': 'שם מלא',
  'student.isAdult': '18 ומעלה?',
  // Decision 12 — this question survives ONLY here, because the form below has no
  // birthdate to derive an age from. Do not delete it to match the parent wizard.
  'student.isAdultHint': 'החניך/ה יהיו האחראים על עצמם, והאימייל למטה הוא שלהם',
  'student.guardianEmail': 'אימייל ההורה',
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
  'status.any': 'כל הסטטוסים',
  'status.history': 'היסטוריית סטטוס',
  'status.changedOn': 'שונה בתאריך',
  'status.reason': 'סיבה',
  // The same rows, headed for the family they happened to. "היסטוריית סטטוס" is the word
  // a manager uses about a record; a parent asking when their child was frozen is asking
  // about their membership. There is deliberately no parent-side `status.reason`: the
  // manager's note is not in the shape the parent app reads.
  'status.membershipHistory': 'היסטוריית החברות',
  // -- 4a's attendance section (dashboard) ---------------------------------------
  'student.attendance': 'היסטוריית נוכחות',
  'student.attendanceEmpty': 'עדיין לא נרשמה נוכחות',
  'student.attendanceMarkedOn': 'סומן בתאריך',

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
  // Decision 20 — the 3-field add-student form takes a guardian email and no name, so
  // the parent's own name is missing until they finish the wizard. The card shows the
  // email instead of a blank row, with this hint beside it.
  'guardian.notRegisteredYet': 'טרם נרשם/ה',
  // Neither a name nor an email — a fallback that is still true, never a blank row.
  'guardian.noContactInfo': 'אין פרטי קשר',

  // -- the public landing page (parent 13a–13c) ---------------------------------
  'import.title': 'ייבוא תלמידים מקובץ',
  'import.hint': 'קובץ CSV — שורה לכל ילד. אחים חולקים שורה לכל אחד עם אותו אימייל הורה, והשרת מאחד אותם לאותו חשבון.',
  'import.template': 'הורדת קובץ לדוגמה',
  'import.pickFile': 'בחירת קובץ',
  'import.badHeader': 'שורת הכותרות לא תואמת את הקובץ לדוגמה — הורידו אותו והתחילו ממנו',
  'import.emptyFile': 'הקובץ ריק',
  'import.state': 'מצב',
  'import.run': 'ייבוא כולם',
  'import.row.pending': 'ממתין',
  'import.row.sending': 'נשלח…',
  'import.row.created': 'נוצר',
  'import.row.failed': 'נכשל',
  'invite.linkHint': 'שלחו להורה את הקישור — הוא נכנס עם חשבון Google ומחובר ישירות לילד:',
  // -- decision 21's visible half — the email half must never be silent ---------
  'invite.emailSent': 'ההזמנה נשלחה גם במייל',
  'invite.emailNotConfigured':
    'שליחת מייל אינה מוגדרת בסביבה הזו — יש להעביר את הקישור להורה בעצמכם',
  'invite.emailNotSent': 'ההזמנה לא נשלחה במייל — יש להעביר את הקישור להורה בעצמכם',
  'landing.title': 'שיעור ניסיון חינם',
  'landing.subtitle': 'בחרו קבוצה ומועד, ואנחנו נחזור אליכם',
  'landing.chooseGroup': 'בחירת קבוצה',
  'landing.chooseSlot': 'בחירת מועד',
  'landing.noSlots': 'אין מועדים פנויים בקבוצה הזו',
  'landing.noSlotsHint': 'נסו קבוצה אחרת או חזרו בשבוע הבא',
  'landing.signInFirst': 'התחברות והמשך',
  'landing.youHint':
    'כדי שנוכל לאשר את השיעור ולחזור אליכם. אפשר להירשם לאפליקציה אחר כך, עם אותו אימייל',
  'landing.signInInstead': 'כבר יש לכם חשבון? התחברות',
  // §5.4 — sign-in-first, so the copy explains why before the sign-in wall.
  'landing.signInHint':
    'ההתחברות שומרת את הפרטים ומאפשרת לעקוב אחרי השיעור באפליקציה',
  'landing.submit': 'שריון מקום לשיעור',
  'landing.submitting': 'שולח…',
  'landing.ageRange': 'גילאים',
  'landing.weeklySchedule': 'מתאמנים בימים',

  // -- after submitting (parent 13b) --------------------------------------------
  'submitted.title': 'נרשמתם לשיעור ניסיון',
  'submitted.titleNamed': 'נשמר מקום ל{{names}}',
  'submitted.healthSigned': 'הצהרת הבריאות נחתמה',
  'submitted.changeTime': 'צריכים לשנות את המועד? שלחו לנו הודעה',
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

  // `sibling.title` is the nav label for "+ הוסף ילד" (#/add-child); `sibling.pendingHint`
  // and `sibling.duplicate` (below) are read by the doors that replaced the old
  // add-a-sibling screen (12g). The rest of that screen's copy went with it.
  'sibling.title': 'הוספת ילד נוסף',
  'join.title': 'הצטרפות למועדון — הרשמת משפחה',
  'join.welcome.heading': 'לפני שנתחיל',
  'join.welcome.subtitle':
    'כדי שנוכל לשמור מידע על הילדים שלכם, אנחנו צריכים את ההסכמה שלכם לשלושה מסמכים.',
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
  'join.yourDetails': 'הפרטים שלכם',
  'join.yourDetailsSolo': 'הפרטים שלך',
  'join.fromSignIn': 'מהכניסה',
  'join.verifiedEmail': 'מאומת',
  'join.iAm': 'אני',
  'join.age18Question': 'בן/בת 18 ומעלה?',
  'join.relation.mother': 'האם',
  'join.relation.father': 'האב',
  'join.relation.other': 'קרוב אחר',
  'join.oneParentEnough': 'די בהורה אחד.',
  'join.pickupTitle': 'מורשי איסוף',
  'join.pickupHint': 'אנשים נוספים (חוץ מההורים) שרשאים לאסוף מהחוג',
  'join.pickupAppliesAll': 'תקף לכל הילדים.',
  'join.studentsTitle': 'התלמידים שלכם',
  'join.studentGroup': 'קבוצה',
  'join.selfStudentAlso': 'אני מתאמנ/ת גם',
  'join.selfStudentHint': 'שם, ת.ז. וכתובת — כבר למעלה.',
  // -- wave E, Door D: "member or trial" is a control inside the student panel --------
  'join.memberOrTrial': 'סוג ההצטרפות',
  'join.memberChoice': 'הצטרפות למועדון',
  'join.trialChoice': 'שיעור ניסיון חינם',
  'join.duplicateTitle': 'נראה שהילד/ה כבר במערכת',
  'join.slotTitle': 'בחירת מועד',
  'join.noSlotsForGroup': 'אין מועדים פנויים בקבוצה הזו כרגע',
  'join.emergencyPhoneNote': 'טלפון חירום ייבדק בהצהרת הבריאות שבהמשך.',
  'join.trialStudentsTitle': 'מי מגיע לשיעור?',
  'join.iTrain': 'אני מתאמן/ת',
  'join.contactDetails': 'פרטי יצירת קשר',
  'join.selfChip': 'נרשם לעצמו',
  'join.soloNote':
    'פרטי הורים, מורשי איסוף וכיתה אינם נדרשים כשאין ילדים ברשימה.',
  'join.optional': 'לא חובה',
  'join.fullName': 'שם מלא',
  'join.nationalId': 'ת.ז.',
  'join.address': 'כתובת',
  'join.city': 'יישוב',
  'join.phoneHome': 'טלפון בבית',
  'join.aliyahYear': 'שנת עליה',
  'join.grade': 'כיתה/גן',
  // C2 -- F6's per-student panel (list vs. one open panel), F7's per-student
  // second-parent/pickup default, and decision 14's plan picker.
  'join.addStudent': 'הוספת תלמיד',
  'join.editStudent': 'עריכה',
  'join.saveStudent': 'שמירה',
  'join.sameAsPrevious': 'אותם פרטים כמו הקודם',
  'join.planTitle': 'מסלול',
  'join.noCoveringPlan': 'אין מסלול מתאים למספר האימונים שנבחר',
  'join.required': 'יש למלא את כל שדות החובה',
  'join.nationalIdInvalid': 'מספר ת.ז. אינו תקין',
  'join.submit': 'שליחה',
  // B2: step 4's own final button (§4, §2 decision 2) -- the ONE write, carrying
  // everything typed in steps 1-3 together, fires from here.
  'join.confirmAndPay': 'אישור ומעבר לתשלום',
  'join.done': 'נרשמתם! נשאר רק להשלים את הצהרת הבריאות באפליקציה.',
  'join.toApp': 'כניסה לאפליקציה',
  'join.done.title': 'כל הילדים רשומים',
  'join.done.nothingOwed': 'אין תשלום פתוח כרגע.',
  'join.done.handMoment': 'יש למסור למאמן בתחילת האימון הקרוב',
  'join.done.standingPending': 'המועדון יאשר את ההוראה לאחר שתיקלט',
  'join.done.flushFailed': 'לא הצלחנו לשמור את הצהרות הבריאות. נסו שוב.',
  'join.card.title': 'קישור הצטרפות למועדון',
  'join.card.active': 'פעיל · יפוג {{date}}',
  'join.card.inactive': 'אין קישור פעיל',
  'join.card.registered': 'משפחות נרשמו',
  'join.card.new': 'קישור חדש',
  'join.card.revoke': 'ביטול',
  'join.card.copy': 'העתקה',
  'join.card.copied': 'הועתק',
  // Kept: the staff app still shows it on the moment-of-creation card.
  'join.card.onceNote': 'הקישור מוצג פעם אחת — העתיקו ושתפו עכשיו.',
  // The permanent link (2026-08-31). No countdown, because there is nothing to count.
  'join.card.permanent': 'פעיל · קישור קבוע',
  'join.card.legacyNote': 'הקישור פעיל אך נוצר לפני העדכון ולכן אינו ניתן להצגה. צרו קישור חדש כדי לקבל קישור קבוע שאפשר להעתיק בכל עת.',
  'landing.card.title': 'דף הנחיתה של המועדון',
  'landing.card.hint': 'לשיתוף עם משפחות חדשות — הרשמה לשיעור ניסיון.',
  // §5.4 — enrollment is always a manager decision, so this promises review, not a place.
  'sibling.pendingHint': 'הילד נוסף. נותר לחתום על הצהרת בריאות ולבחור אמצעי תשלום.',

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
  // Stitch adjudication 2026-08-30 — the sticky header, the hero's second CTA and the
  // week-grid schedule heading. Chrome, not club copy.
  'landing.scheduleTitle': 'מערכת אימונים שבועית',
  'landing.joinNow': 'הצטרפו עכשיו',
  'landing.learnMore': 'למידה נוספת',
  'landing.freeTrial': 'אימון ניסיון חינם',
  'landing.siteNav': 'ניווט בעמוד',
  'landing.stepsTitle': 'איך נראה שיעור ניסיון',
  'landing.beltCaption': 'מסלול החגורות במועדון',
  'landing.navigate': 'ניווט',
  'landing.whatsapp': 'וואטסאפ',
  'landing.footerOffer': 'שיעור הניסיון הראשון חינם',
  'landing.whereTitle': 'איפה מתאמנים',
  'landing.groupsTitle': 'הקבוצות שלנו',
  'landing.noGroups': 'המועדון עדיין לא פרסם קבוצות',
  'landing.scheduleComeLater': 'לוח השיעורים עדיין נבנה. נסו שוב בקרוב',
  'landing.notFound': 'לא מצאנו את המועדון הזה',
  'landing.step.you': 'הפרטים שלכם',
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
  'landing.noCommitment': 'ללא התחייבות · ההרשמה אורכת דקה',
  'landing.bookTrial': 'קביעת שיעור ניסיון',
  'landing.closeBooking': 'סגירה',
  'landing.mapTitle': 'מפת הגעה למועדון',

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
  // Two different waits, and until now one string served both. `waitingForClub` says
  // *after the lesson*, which is true only once a lesson has happened; it was the only
  // thing the no-booking branch could say, so a family whose lesson was never booked read
  // a promise about an event that did not exist. §5.4a lets a manager log a phone enquiry
  // with no slot chosen, so that family is real and reaches this screen.
  'trialHome.waitingForClub': 'המועדון יחזור אליכם אחרי השיעור',
  'trialHome.noLessonBooked': 'עדיין לא נקבע שיעור ניסיון. המועדון ייצור אתכם קשר לתיאום',

  // -- the containers (parent 2c, dashboard 6c) ---------------------------------
  'card.title': 'כרטיס חניך',
  'card.details': 'פרטים',
  'card.enrollments': 'קבוצות',
  // 2c's ledger row labels (2026-09-01). Short, because they are a COLUMN — every value on
  // the card lines up against them, so a label that wraps moves every row beside it.
  'card.membership': 'חברות',
  'card.plan': 'מסלול',
  // 12j's "what happens next" line. Asked for by FirstRegistration since it was
  // written and translated nowhere, so a parent who had just registered read the key
  // itself on the screen that told them they were done (2026-08-31).
  'card.sectionsComeLater':
    'שאר המסכים — לוח השיעורים, הנוכחות והתשלומים — נפתחים באפליקציה אחרי חתימה על הצהרת הבריאות.',
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
  'document.missingCount': '{n} חסר',
  'document.trialSigned': 'הצהרת ניסיון',
  'document.signed': 'הצהרה מלאה',

  // -- errors and empty states ---------------------------------------------------
  'error.scheduleUnavailable': 'לוח השיעורים של המועדון עדיין לא נבנה',
  'error.notFound': 'לא נמצא',
  'error.forbidden': 'אין לכם הרשאה לפעולה הזו',
  'error.generic': 'משהו השתבש. נסו שוב',
  'search.placeholder': 'חיפוש לפי שם חניך או הורה',
  // B2.2 — the filter bar's own result count, on its inline-end edge, so a filtered
  // view says how much it is hiding.
  'filter.resultCount': '{{count}} מתוך {{total}}',
  'tabs.allStudents': 'כל החניכים',
  'tabs.myClasses': 'הכיתות שלי · {{count}}',
  'tabs.allClasses': 'כל הכיתות · {{count}}',
  'health.missingCount': '{{count}} חניכים עם הצהרת בריאות חסרה',
  'tenure.months': '{{count}} חודשים',
  'table.results': '{n} תוצאות',
  'table.loadMore': 'טעינת עוד',

  // -- trial to member: the join a "איך היה?" finally leads to (2026-08-30) -------
  // §5.4a ④ asked this family how their lesson went on days 1, 3 and 7 and gave them
  // nothing to press, then wrote them off as `lost` on day 21. `joinClub.*` is that
  // destination. Separate from `join.*` above, which is §5.4b's whole-family link.
  'joinClub.cta': 'הצטרפות למועדון',
  'joinClub.title': 'הצטרפות למועדון',
  'joinClub.subtitle': 'בוחרים קבוצות, חותמים על הצהרת בריאות ומסדירים תשלום.',
  'joinClub.chooseGroups': 'באילו קבוצות להתאמן',
  'joinClub.trialledHere': 'התאמנתם כאן',
  'joinClub.priceHint': 'המחיר נקבע לפי מספר האימונים בשבוע, ומופיע במסך התשלומים.',
  'joinClub.steps.title': 'מה קורה עכשיו',
  'joinClub.steps.groups': 'מצטרפים לקבוצות שבחרתם',
  'joinClub.steps.declaration': 'חותמים על הצהרת בריאות מלאה',
  'joinClub.steps.payment': 'בוחרים אמצעי תשלום',
  'joinClub.submit': 'מצטרפים',
  'joinClub.back': 'חזרה',
  'joinClub.noGroups': 'לא הצלחנו לטעון את רשימת הקבוצות. אפשר לנסות שוב.',
  'joinClub.retryGroups': 'טעינה מחדש',
  'joinClub.error': 'לא הצלחנו להשלים את ההצטרפות. נסו שוב.',
  'joinClub.forWhom': 'מצטרפים בשביל',
  // `SelfServeJoinFlow`'s duplicate-child refusal, kept name-agnostic per §11.1: naming a
  // child this caller is not a guardian of would disclose that they train here.
  'sibling.duplicate': 'נראה שהילד/ה כבר רשומים במועדון. פנו למועדון כדי לוודא.',

  // -- screen 8: the guardian's own settings -------------------------------------
  //
  // The profile tab shipped titled `student.plural`, listing children, with the only
  // per-child control being the destructive one. These are the keys that make it a screen
  // about the PARENT: their own record, the app's settings, and the ways onward.
  'profile.title': 'פרופיל',
  'profile.account': 'החשבון שלי',
  'profile.app': 'האפליקציה',
  'profile.family': 'המשפחה',
  'profile.club': 'המועדון',
  'profile.privacy': 'פרטיות',
  'profile.name': 'שם',
  'profile.email': 'אימייל',
  'profile.phone': 'טלפון',
  'profile.notSet': 'לא הוגדר',
  'profile.edit': 'עריכה',
  'profile.save': 'שמירה',
  'profile.saveFailed': 'לא הצלחנו לשמור את הפרטים. נסו שוב.',
  'profile.language': 'שפה',
  'profile.theme': 'ערכת נושא',
  'profile.notifications': 'התראות',
  'profile.notifications.hint': 'עדכונים על ביטולי שיעורים',
  'profile.notifications.on': 'פעילות',
  'profile.notifications.off': 'כבויות',
  'profile.paymentMethod': 'אמצעי התשלום שלי',
  'profile.children': 'הילדים שלי',
  'profile.leaveHint': 'עזיבת המועדון נעשית מתוך כרטיס החניך',
  'profile.address': 'כתובת',

}
