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
  'period.nextMonth': 'החודש הבא',
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
  'financial.notYetDue': 'טרם הגיע מועד החיוב',
  'financial.studentsBilled': 'חניכים שחויבו',
  'financial.collectionRate': 'אחוז גבייה',
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

  // ==================================================================================
  // §6.1 step 5 -- `5  אישורים  →  terms of service + privacy policy`, the BLOCKING gate.
  //
  // **THE TEXT BELOW IS AN UNREVIEWED DRAFT.** No lawyer has read a word of it. It was
  // written against what the code actually does -- tenancy-isolated records, health
  // declarations encrypted with `EncryptedJSON`/`EncryptedBytes` and keys held outside the
  // database, uPay as the payment processor, an append-only audit log, Google/Apple as the
  // sign-in providers -- and against the disclosure list Israel's Privacy Protection Law
  // has required since Amendment 13 came into force on 14 August 2025: whether the data is
  // mandatory or voluntary, the purpose, the retention period, every third party and why,
  // the controller's identity, the consequences of refusing, and the rights of access and
  // correction.
  //
  // Two rules the copy holds to, because a policy that overstates is worse than none:
  //  - **It never claims a practice the code does not implement.** §11.5's automatic
  //    retention run does not exist (there is no `app/workers/retention.py`), so
  //    `policy.s7.body` says deletion happens on request and not on a timer.
  //  - **`privacy.draft.notice` is rendered on screen**, not left in a comment. Every
  //    acceptance of this wording is recorded at `consent_record.version = 0`
  //    (`app/services/privacy/policy.py`), so the draft-era grants stay findable after a
  //    lawyer rewrites this.
  // ==================================================================================
  'privacy.draft.badge': 'טיוטה',
  'privacy.draft.notice':
    'הנוסח שלהלן נכתב על ידי צוות הפיתוח ולא נבדק על ידי עורך דין. הוא מתאר נאמנה את מה שהמערכת עושה בפועל, אך אינו ייעוץ משפטי והוא צפוי להשתנות. הסכמות שנרשמו לנוסח זה מסומנות בגרסה הנוכחית וניתן לאתר אותן מחדש.',
  'privacy.doc.version': 'גרסת נוסח',

  // -- תנאי שימוש -------------------------------------------------------------------
  'privacy.terms.title': 'תנאי שימוש',
  'privacy.terms.s1.title': 'מהו השירות',
  'privacy.terms.s1.body':
    'האפליקציה מופעלת עבור המועדון שבו רשומים ילדיכם, ומשמשת להרשמה, למערכת השעות, לנוכחות, לתשלומים, להצהרות בריאות ולהודעות מהמועדון.',
  'privacy.terms.s2.title': 'מי רשאי להשתמש',
  'privacy.terms.s2.body':
    'החשבון נועד לאפוטרופוס של חניך רשום, או לחניך בגיר. ההתחברות נעשית באמצעות חשבון Google או Apple; איננו יוצרים סיסמה ואיננו שומרים אחת.',
  'privacy.terms.s3.title': 'האחריות שלכם',
  'privacy.terms.s3.body':
    'המידע שאתם מוסרים — ובמיוחד הצהרת הבריאות — חייב להיות נכון ומעודכן. המאמן על המזרן רואה סימוני בריאות בלבד, והם נגזרים מהתשובות שמסרתם. תשובה חסרה או שגויה היא סיכון בטיחותי לילד.',
  'privacy.terms.s4.title': 'תשלומים',
  'privacy.terms.s4.body':
    'המועדון קובע את המחירים ואת מדיניות ההחזרים. תשלומי אשראי מעובדים על ידי ספק הסליקה uPay ואיננו שומרים פרטי כרטיס. הוראת קבע אינה נפתחת דרך האפליקציה, ותשלום שהתקבל בה מסומן ידנית על ידי המועדון.',
  'privacy.terms.s5.title': 'שימוש הוגן',
  'privacy.terms.s5.body':
    'אין להשתמש בחשבון של אדם אחר, לנסות להגיע למידע שאינו שלכם, או להעתיק מידע על חניכים אחרים או על משפחותיהם.',
  'privacy.terms.s6.title': 'זמינות ושינויים',
  'privacy.terms.s6.body':
    'השירות ניתן כמות שהוא וללא התחייבות לזמינות רציפה. שינוי מהותי בתנאים יציג אותם שוב ויבקש את אישורכם מחדש — הסכמה לגרסה אחת אינה הסכמה לגרסה הבאה.',
  'privacy.terms.s7.title': 'סגירת חשבון',
  'privacy.terms.s7.body':
    'ניתן לבקש את סגירת החשבון ומחיקת הפרטים בכל עת ממסך זה. רשומות שהדין מחייב לשמור — בעיקר רשומות כספיות — יישמרו גם לאחר מכן, ללא שם.',
  'privacy.terms.s8.title': 'הדין החל',
  'privacy.terms.s8.body': 'על תנאים אלה חל הדין הישראלי.',

  // -- מדיניות פרטיות ----------------------------------------------------------------
  'privacy.policy.title': 'מדיניות פרטיות',
  'privacy.policy.s1.title': 'מי אחראי למידע',
  'privacy.policy.s1.body':
    'המועדון שבו רשומים ילדיכם הוא בעל המידע והאחראי עליו. פרטי הקשר של המועדון מופיעים במסך הפרופיל, וכל פנייה בנושא פרטיות מופנית אליו.',
  'privacy.policy.s2.title': 'איזה מידע נאסף',
  'privacy.policy.s2.body':
    'פרטי החניך והאפוטרופוס — שם, תאריך לידה, טלפון ודוא״ל; שיוך לקבוצה ולמערכת השעות; רישומי נוכחות והיעדרות; חיובים ותשלומים; הצהרת הבריאות והחתימה עליה; ההודעות שנשלחו אליכם; ורישום טכני של פעולות שנעשו במערכת.',
  'privacy.policy.s3.title': 'חובה או רשות',
  'privacy.policy.s3.body':
    'מסירת פרטי החניך והאפוטרופוס ומילוי הצהרת הבריאות הם תנאי להשתתפות באימונים: בלעדיהם המועדון אינו יכול לרשום את הילד ואינו יכול לשמור עליו על המזרן. הסכמה לפרסום תמונות היא רשות מלאה — סירוב אינו משפיע על ההשתתפות ואינו נרשם כהסכמה.',
  'privacy.policy.s4.title': 'למה המידע משמש',
  'privacy.policy.s4.body':
    'ניהול ההרשמה והנוכחות, גבייה, בטיחות באימון, תקשורת מהמועדון אליכם, והפקת דוחות תפעוליים למועדון עצמו. איננו מוכרים מידע ואיננו משתמשים בו לפרסום.',
  'privacy.policy.s5.title': 'מידע רפואי',
  'privacy.policy.s5.body':
    'הצהרת הבריאות היא מידע רגיש בחוק, ולכן היא נאספת רק בהסכמה מפורשת של האפוטרופוס. התשובות והחתימה מוצפנות במסד הנתונים ומפתחות ההצפנה נשמרים מחוץ אליו. מנהל בלבד רשאי לפתוח את ההצהרה המלאה, וכל פתיחה כזו נרשמת ביומן שלא ניתן לשנות. מאמן רואה סימונים בלבד — למשל אסתמה או אלרגיה — ולעולם לא את נוסח התשובות.',
  'privacy.policy.s6.title': 'עם מי המידע משותף',
  'privacy.policy.s6.body':
    'ספק הסליקה uPay, לצורך ביצוע תשלום בלבד; ספק התשתית והאחסון שעליו פועל השירות; וספק ההתחברות שבחרתם, Google או Apple, המאמת את זהותכם. המידע של מועדון אחד אינו נגיש למועדון אחר. איננו מעבירים מידע לגורם נוסף אלא בהסכמתכם או כשהדין מחייב.',
  'privacy.policy.s7.title': 'כמה זמן המידע נשמר',
  'privacy.policy.s7.body':
    'כל עוד החניך רשום במועדון, ולאחר מכן ככל שנדרש לניהולו. רשומות כספיות נשמרות כשבע שנים כנדרש בדיני המס, ולכן בקשת מחיקה מוחקת את הפרטים המזהים ומשאירה את הרשומה הכספית ללא שם. מחיקה אוטומטית לאחר תקופת אי-פעילות מתוכננת ואינה פעילה כיום — עד שתופעל, מידע נמחק רק לפי בקשה.',
  'privacy.policy.s8.title': 'הזכויות שלכם',
  'privacy.policy.s8.body':
    'עיון במידע השמור עליכם ועל ילדיכם; תיקון פרט שגוי; מחיקה בנסיבות שהדין מכיר בהן; התנגדות לעיבוד והגבלתו; ביטול הסכמה בכל עת; וקבלת המידע בקובץ מובנה הניתן לקריאה במחשב. מסך זה פותח את הבקשה, והמועדון הוא שמשיב עליה.',
  'privacy.policy.s9.title': 'ביטול הסכמה',
  'privacy.policy.s9.body':
    'ביטול נרשם כרשומה חדשה ואינו מוחק את ההסכמה שקדמה לו — כך נשמר תיעוד של מה שהוסכם ומתי. ביטול ההסכמה למדיניות זו יחזיר את מסך האישורים ויעצור את השימוש באפליקציה, משום שבלעדיה אין בסיס להמשיך ולעבד את המידע.',
  'privacy.policy.s10.title': 'אבטחת המידע',
  'privacy.policy.s10.body':
    'הפרדה מלאה בין מועדונים ברמת מסד הנתונים; הרשאות לפי תפקיד; הצפנה של התשובות הרפואיות ושל החתימות; יומן פעולות שהמערכת יכולה להוסיף אליו בלבד ולא לשנות או למחוק ממנו; ותיעוד של כל פתיחה של הצהרה רפואית.',
  'privacy.policy.s11.title': 'קטינים',
  'privacy.policy.s11.body':
    'לקטין אין כשירות משפטית לתת הסכמה בעצמו, ולכן ההסכמה כאן ניתנת על ידי האפוטרופוס. אפוטרופוס רשאי לממש בשם הילד כל אחת מהזכויות שלמעלה.',
  'privacy.policy.s12.title': 'שינויים ופניות',
  'privacy.policy.s12.body':
    'שינוי בנוסח יוצג לכם ויבקש הסכמה מחדש. פנייה בנושא פרטיות מופנית תחילה למועדון; אם לא נענתם, ניתן לפנות לרשות להגנת הפרטיות במשרד המשפטים.',

  // -- §6.1 step 5's gate ------------------------------------------------------------
  'privacy.gate.title': 'אישורים',
  'privacy.gate.body':
    'לפני הכניסה לאפליקציה יש לאשר את תנאי השימוש ואת מדיניות הפרטיות. שני האישורים נדרשים, והם נשמרים עם התאריך והגרסה שאישרתם.',
  'privacy.gate.acceptTerms': 'קראתי ואני מאשר/ת את תנאי השימוש',
  'privacy.gate.acceptPrivacy': 'קראתי ואני מאשר/ת את מדיניות הפרטיות',
  'privacy.gate.submit': 'אישור והמשך',
  'privacy.gate.working': 'שומר…',
  'privacy.gate.mustAccept': 'יש לסמן את שני האישורים כדי להמשיך',
  'privacy.gate.failed': 'שמירת האישור נכשלה. נסו שוב.',
  'privacy.gate.show': 'הצגת הנוסח המלא',
  'privacy.gate.hide': 'הסתרת הנוסח',

  // -- §11.3's data export ------------------------------------------------------------
  'privacy.title': 'פרטיות ומידע אישי',
  'privacy.screen.subtitle': 'המידע השמור עליכם ועל ילדיכם, ומה ניתן לעשות איתו',
  'privacy.screen.back': 'חזרה',
  'privacy.screen.loadFailed': 'לא הצלחנו לטעון את המידע. נסו שוב.',
  'privacy.screen.documents': 'הנוסח שאישרתם',
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
  // The status the worker actually produces today. `assemble_export_bundle` and
  // `purge_subject_data` are seams that raise on purpose (HB-privacy-worker-unbuilt), so a
  // request made now ends `failed` — and the screen says so rather than showing a spinner
  // for something that is not running.
  'privacy.export.failedReason': 'סיבת הכשל',
  'privacy.export.failedHelp':
    'הכנת הקובץ אינה זמינה כרגע. הבקשה נרשמה ולא בוטלה — פנו למועדון והוא ימסור את המידע.',
  'privacy.export.none': 'לא ביקשתם ייצוא',

  // -- §11.4's erasure request, and the honest status of it ---------------------------
  'privacy.delete.title': 'בקשת מחיקת מידע',
  'privacy.delete.request': 'בקשת מחיקה',
  'privacy.delete.confirmTitle': 'למחוק את המידע?',
  'privacy.delete.confirmBody':
    'הפעולה אינה הפיכה. הפרטים המזהים יימחקו, הצהרות הבריאות והחתימות יושמדו, והגישה לאפליקציה תיפסק.',
  'privacy.delete.confirm': 'כן, למחוק',
  'privacy.delete.cancel': 'ביטול',
  'privacy.delete.requested': 'בקשת המחיקה נרשמה',
  'privacy.delete.status.pending': 'ממתין',
  'privacy.delete.status.running': 'בביצוע',
  'privacy.delete.status.completed': 'הושלם',
  'privacy.delete.status.failed': 'המחיקה נכשלה',
  // The most important line on the screen. `deletion_request` carries no constraint that
  // could catch a false success — "the data is gone" is not a column — so a screen that
  // rendered `failed` as "בטיפול" would tell a guardian their erasure was under way when
  // nothing had been deleted.
  'privacy.delete.failedHelp':
    'המחיקה לא בוצעה ולא נמחק דבר. הבקשה נרשמה ונשארת פתוחה — פנו למועדון כדי להשלים אותה.',
  'privacy.delete.none': 'לא ביקשתם מחיקה',

  // -- the request list both screens read --------------------------------------------
  'privacy.requests.title': 'הבקשות שלכם',
  'privacy.requests.operatorTitle': 'בקשות פרטיות במועדון',
  'privacy.requests.operatorSubtitle': 'ייצוא ומחיקה שהתבקשו, ומה עלה בגורלם',
  'privacy.requests.empty': 'אין בקשות',
  'privacy.requests.requestedAt': 'נרשמה בתאריך',
  'privacy.requests.subject': 'נושא הבקשה',
  'privacy.requests.kind.export': 'ייצוא מידע',
  'privacy.requests.kind.deletion': 'מחיקת מידע',
  'privacy.requests.needsAttention': 'בקשות שנכשלו',

  // -- §6.1 step 7's photo consent, off the blocking gate on purpose ------------------
  // SPEC makes it skippable and "Skipping = NO consent recorded (the safe default)", so it
  // is asked HERE and not inside the wall a parent is trying to get past.
  'privacy.photo.title': 'פרסום תמונות',
  'privacy.photo.body':
    'האם המועדון רשאי לפרסם תמונות של ילדיכם מאימונים ומתחרויות? אפשר לשנות את התשובה בכל עת, ואי-מתן תשובה נשמר כאי-הסכמה.',
  'privacy.photo.allow': 'מותר לפרסם',
  'privacy.photo.disallow': 'אין לפרסם',

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

  // Send-monthly (feature pass 2026-08-27) — emails the report, so a confirm stands
  // between the button and real inboxes.
  'send.button': 'שליחת דוח חודשי למייל',
  'send.title': 'לשלוח את הדוח החודשי?',
  'send.body': 'הדוח לתקופה {{month}} יישלח לכתובת המייל שלך.',
  'send.confirm': 'שליחה',
  'send.cancel': 'ביטול',
  'send.done': 'הדוח נשלח למייל',
}
