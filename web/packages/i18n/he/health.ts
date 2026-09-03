import type { Bundle } from '../types'

/**
 * Owned by the HEALTH lane (M4). Hebrew is the reference locale.
 *
 * Artboards: parent `12c` הצהרת בריאות; dashboard `4e` מסמכים והצהרות. **M4 has no staff
 * artboard** — its staff surface is the `badge.*` and `reminder.*` keys below, rendered
 * into M5's roster through the slot registry (plan §1.3 seam 4, conflict C2).
 *
 * Three §5.5 rules are carried by the copy and none of them is optional:
 *  - **Nothing on the mat is ever blocked.** `badge.missing` warns; there is no string
 *    here that tells a coach they may not mark a student present, because there is no
 *    such rule and no `block_attendance_without_health` setting.
 *  - **Coaches see booleans, never free text.** `flag.*` are fixed labels for derived
 *    flags. No key here interpolates an answer.
 *  - **The club's own text carries the club's own responsibility.** `template.disclaimer`
 *    used to live here, saying the bundled question set was a starting point and not a
 *    compliance artefact. Template v2 is the club's own `טופס הרשמה` and its own תקנון,
 *    signed under the club's own name, so that sentence became false and was removed.
 *    What stands in its place is `clubTerms.*` — the club's real terms, which a family
 *    accepts rather than is warned about.
 */
export const health: Bundle = {
  // -- the parent declaration flow (parent 12c) ---------------------------------
  'declaration.title': 'הצהרת בריאות',
  // 2c's ledger row (2026-09-01). `card.rowLabel` is the short column label; the expiry
  // is the fact the old chip-only section could not tell a parent at all.
  'card.rowLabel': 'בריאות',
  'declaration.validUntil': 'תקפה עד',
  'declaration.subtitle': 'נדרשת לפני תחילת האימונים',
  'declaration.forChild': 'עבור',
  'declaration.intro': 'ענו על השאלות וחתמו בתחתית הטופס',
  'declaration.yes': 'כן',
  'declaration.no': 'לא',
  'declaration.details': 'פירוט',
  'declaration.detailsRequired': 'יש לפרט כשהתשובה חיובית',
  'declaration.signature': 'חתימה',
  'declaration.signatureHint': 'חתמו באצבע במסגרת',
  'declaration.signatureClear': 'ניקוי החתימה',
  'declaration.signatureRequired': 'יש לחתום כדי לשלוח',
  'declaration.submit': 'שליחת ההצהרה',
  'declaration.submitting': 'שולח…',
  'declaration.submitted': 'ההצהרה נשלחה',
  'declaration.signedOn': 'נחתמה בתאריך',
  'declaration.signedBy': 'נחתמה על ידי',
  'declaration.update': 'עדכון ההצהרה',
  'declaration.download': 'הורדת ההצהרה',
  // §5.5 — declarations do not expire. The copy says so rather than showing a blank date.
  'declaration.noExpiry': 'ההצהרה תקפה ללא הגבלת זמן',

  // -- the parent-app gate (§5.5 — a hard block in the PARENT app only) ---------
  'gate.title': 'נדרשת הצהרת בריאות',
  'gate.body': 'כדי להמשיך, מלאו את הצהרת הבריאות של הילד',
  'gate.action': 'מילוי ההצהרה',

  // -- what a coach sees (slot fill into M5's roster) ---------------------------
  'badge.missing': 'הצהרת בריאות חסרה',
  'badge.trialSigned': 'הצהרת ניסיון',
  'badge.signed': 'הצהרה תקינה',
  // §5.5 — the coach can still mark them present. The hint says so out loud, so nobody
  // reads the ⚠ as a permission error.
  'badge.missingHint': 'אפשר לסמן נוכחות. ההצהרה נדרשת מההורה',
  'reminder.send': 'שלח תזכורת להורה',
  'reminder.sent': 'התזכורת נשלחה',
  'reminder.sentOn': 'תזכורת אחרונה נשלחה בתאריך',
  'reminder.sendAll': 'שליחת תזכורת לכל החסרים',

  // -- derived flags: fixed labels, booleans only, never interpolated -----------
  'flag.title': 'שימו לב',
  'flag.asthma': 'אסתמה',
  'flag.allergy': 'אלרגיה',
  'flag.medication': 'תרופות קבועות',
  'flag.epilepsy': 'אפילפסיה',
  'flag.heart': 'מצב לבבי',
  'flag.diabetes': 'סוכרת',
  'flag.injury': 'פציעה פעילה',
  'flag.other': 'מצב רפואי נוסף',
  // The full record is manager-only and every read is audit-logged (§11.2).
  'flag.detailsRestricted': 'הפירוט המלא זמין למנהל בלבד',

  // -- the manager view (dashboard 4e) ------------------------------------------
  'documents.title': 'מסמכים והצהרות',
  'documents.backToList': 'חזרה לרשימת המסמכים',
  'documents.missing': 'חסרות',
  'documents.signed': 'הוגשו',
  'documents.empty': 'כל ההצהרות הוגשו',
  'documents.requestGroup': 'בקשה קבוצתית',
  'documents.viewFull': 'צפייה בהצהרה המלאה',
  // §11.2 — every read of a full declaration is audit-logged, and the manager is told.
  'documents.viewFullNotice': 'הצפייה בהצהרה נרשמת ביומן הביקורת',
  'documents.exportList': 'ייצוא רשימת החסרים',

  // -- the template editor (D11) -------------------------------------------------
  'template.title': 'שאלון הצהרת בריאות',
  'template.edit': 'עריכת השאלון',
  'template.addQuestion': 'הוספת שאלה',
  'template.removeQuestion': 'הסרת שאלה',
  'template.questionText': 'נוסח השאלה',
  'template.version': 'גרסה',
  'template.publish': 'פרסום הגרסה',
  'template.uploadPdf': 'העלאת טופס המועדון',

  // -- consent (§11.6) -----------------------------------------------------------
  'consent.terms': 'תנאי שימוש',
  'consent.privacy': 'מדיניות פרטיות',
  'consent.photo_video': 'צילום ווידאו',
  'consent.medical_share': 'שיתוף מידע רפואי',
  'consent.event': 'השתתפות באירוע',
  'consent.granted': 'ניתן אישור',
  'consent.revoked': 'האישור בוטל',
  'consent.revoke': 'ביטול האישור',
  'consent.grantedOn': 'אושר בתאריך',

  // -- states 12c does not draw, and one it draws wrongly -----------------------
  // 12c finding 5, the most consequential gap on that artboard: "a declaration that defaults
  // every question to no and gets signed is a health record nobody actually answered". A
  // two-position Switch cannot express a third state, so the form uses SegmentedControl with
  // neither option selected — and these are the strings that state needs.
  'declaration.unanswered': 'טרם נענתה',
  // -- the one tap that answers the questions a healthy child answers the same way --------
  // Thirteen booleans on a phone, and for most families every one of them is לא. This does
  // NOT preselect anything on load — the third state above survives untouched. It is a
  // button the parent presses, which is why the hint says what it will do before it does it.
  'declaration.markAllHealthy': 'אין בעיות בריאות ידועות',
  'declaration.markAllHealthyHint': 'כל שאלה שטרם נענתה תסומן "לא". אפשר לשנות כל אחת בנפרד.',
  'declaration.answerRequired': 'יש לענות על כל השאלות',
  'declaration.loading': 'טוען את הטופס…',
  'declaration.error': 'לא הצלחנו לטעון את הטופס. נסו שוב',
  // 12c finding 3: the paragraph the parent actually signs is an attestation, not an
  // instruction, and `declaration.intro` is the instruction. This is the attestation.
  'declaration.attestation':
    'אני מצהיר/ה שהפרטים שמסרתי נכונים ומלאים, ושאין מניעה רפואית מהשתתפות הילד/ה באימונים',

  // -- the manager view, the keys 4e found missing -------------------------------
  'documents.all': 'הכל',
  'documents.awaitingSignature': 'ממתין לחתימת הורה',
  'documents.columnType': 'סוג מסמך',
  'documents.columnValidity': 'תוקף',
  'documents.sendRequest': 'שליחת בקשה',
  'documents.summaryTotal': 'סך הכל',
  'documents.requestGroupCount': 'בקשה קבוצתית',
  'documents.filteredEmpty': 'אין תוצאות לסינון הזה',
  'documents.loading': 'טוען…',
  'documents.error': 'לא הצלחנו לטעון את הרשימה. נסו שוב',
  'documents.trialOnly': 'הצהרת ניסיון בלבד',

  // -- the template editor (D11) -------------------------------------------------
  // `editingBundled` / `editingYours` used to sit here, picked by `is_bundled_default` on
  // the row. Both are gone with the marker: the questions are the club's own now, so there
  // is no "ours vs yours" left for the editor to distinguish.
  'template.draft': 'טיוטה',
  'template.draftHint': 'השינויים נשמרים כטיוטה. ההורים ימשיכו למלא את הגרסה הקיימת עד לפרסום',
  'template.published': 'הגרסה פורסמה',
  'template.recomputed': 'הצהרות עודכנו',
  'template.flagQuestion': 'שאלה שמפיקה סימון למאמן',
  'template.flagQuestionHint': 'סימון בוליאני בלבד. תוכן התשובה לעולם אינו מוצג למאמן',
  'template.questionType.boolean': 'כן/לא',
  'template.questionType.text': 'טקסט חופשי',
  'template.questionType.phone': 'טלפון',
  'template.sectionTitle': 'שם הפרק',
  'template.save': 'שמירת טיוטה',
  'template.saved': 'הטיוטה נשמרה',

  // -- the club's own agreement (`טופס הרשמה` + `תנאי תשלום`) ------------------
  // These replace `template.disclaimer`, which said the bundled questionnaire was "a
  // starting point only and not a compliance document". That was true of a question set
  // WE wrote. This is the club's own form and its own תקנון, signed under the club's own
  // name, so the caveat would now be false -- see the design doc §11.
  'clubTerms.title': 'תקנון ותנאי תשלום',
  'clubTerms.summary':
    'איך משלמים בצ׳קים, מה קורה כשמבטלים מנוי באמצע השנה, וכיצד מחשבים החזר יחסי.',
  'clubTerms.payment.title': 'תנאי תשלום',
  'clubTerms.payment.cheques':
    'תשלום בצ\'קים יתבצע לטובת "בריין בילדינג (ע״ר)". תאריך הצ\'ק לא יאוחר מה-10 לכל חודש.',
  'clubTerms.payment.cancellation':
    'ביטול מנוי יבוצע בכתב עד ה-27 לחודש, ויהיה תקף לגבי חודשים עתידיים בלבד.',
  'clubTerms.payment.proRata':
    'בעת ביטול מנוי שנתי, התעריף החודשי יחושב בהתאם לניצול החודשים בפועל של המנוי (לדוגמה: אם המנוי ניצל שלושה חודשים, החישוב יבוצע לפי תעריף מנוי לשלושה חודשים).',
  'clubTerms.accept': 'קראתי את התקנון ותנאי התשלום ואני מאשר/ת אותם',
  'clubTerms.required': 'יש לאשר את התקנון ותנאי התשלום כדי להמשיך',
  'clubTerms.alreadyAccepted': 'אישרתם את התקנון ותנאי התשלום',
  'clubTerms.onceForFamily': 'פעם אחת, עבור כל המשפחה',

  // The club's two health clauses. ALTERNATIVES, not options: which one applies follows
  // from the answers, and the parent confirms the one that follows rather than choosing.
  'declaration.clause.none':
    'הנני מצהיר/ה כי לרשום מעלה אין מגבלות רפואיות/רגישויות כלשהן והוא מסוגל לעמוד במאמץ הדרוש לחוג אליו נרשם. יחד עם זאת, במידה ותהיה מגבלה רפואית כלשהי, הנני מתחייב/ת לדווח על כך בהקדם למאמן ו/או מנהל המועדון.',
  'declaration.clause.limited':
    'הנני מצהיר/ה כי למרות המגבלות הרפואיות המצוינות לעיל, הרשום מעלה מסוגל לעמוד במאמץ הדרוש לחוג אליו נרשם.',
  'declaration.clause.confirm': 'אני מאשר/ת את ההצהרה שלמעלה',
  'declaration.clause.required': 'יש לאשר את ההצהרה כדי לשלוח',

  // -- the registration step (`טופס הרשמה` blocks 1-4) -------------------------
  'registration.title': 'פרטי הרשמה',
  'registration.student': 'פרטי התלמיד/ה',
  'registration.parents': 'פרטי ההורים',
  'registration.pickup': 'מורשי איסוף',
  'registration.pickupHint': 'אנשים נוספים (חוץ מההורים) שרשאים לאסוף את הילד/ה מהחוג',
  'registration.pickupNone': 'לא צוינו מורשי איסוף נוספים',
  'registration.pickupAdd': 'הוספת מורשה איסוף',
  'registration.pickupRemove': 'הסרה',
  'registration.nationalId': 'ת.ז.',
  'registration.nationalIdInvalid': 'מספר ת.ז. אינו תקין',
  'registration.grade': 'כיתה/גן',
  'registration.address': 'כתובת',
  'registration.city': 'יישוב',
  'registration.phoneHome': 'טלפון בבית',
  'registration.phoneMobile': 'טלפון נייד',
  'registration.email': 'דוא"ל',
  'registration.fullName': 'שם מלא',
  'registration.motherName': 'שם האם',
  'registration.fatherName': 'שם האב',
  'registration.otherParent': 'הורה נוסף',
  'registration.aliyahYear': 'שנת עליה',
  'registration.aliyahYearHint': 'אם אחד ההורים עלה ב-10 השנים האחרונות',
  'registration.required': 'יש למלא את כל שדות החובה',
  'registration.optional': 'לא חובה',
  'agreement.step': 'שלב',
  'agreement.next': 'המשך',
  'agreement.back': 'חזרה',
  'agreement.submit': 'חתימה ושליחה',
  'onboarding.stepOf': 'שלב {current} מתוך {total}',
  'onboarding.title': 'הצטרפות למועדון',
  'onboarding.rail': 'שלבי ההצטרפות',
  'onboarding.healthQueue': 'תור הצהרות הבריאות',
  'onboarding.step.welcome': 'הצטרפות',
  'onboarding.step.consent': 'הסכמה',
  'onboarding.step.terms': 'תקנון',
  'onboarding.step.family': 'הפרטים שלכם',
  'onboarding.step.health': 'הצהרות בריאות',
  'onboarding.step.payment': 'תשלום',
  'onboarding.openingQuestion': 'יש משהו שכדאי שנדע?',
  'onboarding.openingHealthy': 'אין מגבלות ידועות',
  'onboarding.openingReporting': 'יש משהו שצריך לדעת',
  'onboarding.allMarkedHealthy': '13 שאלות סומנו "לא"',
  'onboarding.signAndContinue': 'חתימה והמשך',
}
