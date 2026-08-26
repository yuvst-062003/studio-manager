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
 *  - **D11's caveat is a visible string, not a footnote.** `template.disclaimer` is
 *    rendered where a manager edits the questions: the bundled set is a starting point
 *    and is explicitly not a compliance artefact.
 */
export const health: Bundle = {
  // -- the parent declaration flow (parent 12c) ---------------------------------
  'declaration.title': 'הצהרת בריאות',
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
  // D11's caveat, verbatim in intent. This string is not optional.
  'template.disclaimer':
    'השאלון המצורף הוא נקודת פתיחה בלבד ואינו מסמך עמידה ברגולציה. באחריות המועדון להתאים אותו לדרישות הביטוח והחוק',

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
  // `is_bundled_default` on the row is what picks between these two. A studio that has
  // reworded every question is no longer editing ours, and saying otherwise is the opposite
  // of D11's caveat.
  'template.editingBundled': 'זהו השאלון המצורף למערכת',
  'template.editingYours': 'זהו השאלון של המועדון',
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
}
