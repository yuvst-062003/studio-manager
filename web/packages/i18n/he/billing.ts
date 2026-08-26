import type { Bundle } from '../types'

/**
 * Owned by the MONEY lane (M6). Hebrew is the reference locale — `en` and `ru` mirror
 * these keys and `web/scripts/i18n-parity.mjs billing` fails on a gap in `en`.
 *
 * Artboards: parent `12f` תשלומים (**D9.3**), `1b` תשלומים, `12e` הזמנת פריטים;
 * staff `11a` מסירת פריטים; dashboard `3e` תשלומים וגבייה, `5a` מחירים ומסלולים,
 * `5e` אשף · שלב 4.
 *
 * Four families of string here carry a rule that the copy itself has to hold:
 *  - **D9.3 — the screen is `תשלומים`, not `קבלות ותשלומים`.** §5.10 issues a tax document
 *    for card payments only, so `receipt.cardOnly` exists to say that out loud on the rows
 *    that have no receipt, rather than a screen title that promises one for cash.
 *  - **All three payment routes are always visible** (§5.10). Nothing here hides a route,
 *    and `standingOrder.activeWarning` is a *warning*, never a block — the parent decides.
 *  - **A charge is settled by allocation, never mutated.** `charge.status.*` names a derived
 *    cache; no string here invites a manager to "mark as paid" on the charge itself.
 *  - **A reconciliation suggestion is never auto-applied** (§5.10 step 5).
 *    `reconciliation.neverAuto` is the screen saying so, because a wrong automatic match
 *    sends the wrong parent a debt reminder.
 */
export const billing: Bundle = {
  // -- the parent payments screen (parent 12f ▲ D9.3, 1b) -----------------------
  'title': 'תשלומים',
  'openDebts.title': 'חובות פתוחים',
  'openDebts.empty': 'אין חובות פתוחים',
  'openDebts.total': 'סה״כ חוב',
  'openDebts.forStudent': 'עבור {{name}}',
  'howToPay.title': 'איך תרצה לשלם?',

  // §5.10 — the three routes, always all three, never one hidden.
  'method.card': 'כרטיס אשראי',
  'method.standingOrder': 'הוראת קבע',
  'method.cash': 'מזומן',
  'method.bankTransfer': 'העברה בנקאית',
  'method.creditAdjustment': 'זיכוי',

  'card.selectMonths': 'בחר חודשים',
  'card.installments': 'תשלומים בכרטיס',
  'card.total': 'סה״כ',
  'card.pay': 'לתשלום',
  'card.coveredElsewhere': 'החיוב כלול בתשלום שכבר נפתח',
  'card.nothingSelectable': 'אין חיובים זמינים לתשלום בכרטיס',
  'card.oldestFirst': 'נבחרים החיובים הוותיקים ביותר, לכל הילדים שאתם משלמים עבורם',

  'standingOrder.link': 'קישור להקמת הוראת קבע',
  'standingOrder.instructions': 'הקמת ההוראה מתבצעת באתר חברת הסליקה',
  'standingOrder.activeWarning': 'רשומה הוראת קבע פעילה — ודא שאינך משלם פעמיים',
  'standingOrder.notConfirmable': 'תשלום בהוראת קבע נרשם על ידי המועדון לאחר קבלתו',

  'cash.instructions': 'שלמו למאמן בתחילת החודש',

  // D9.3 — the email affordance is card rows only, and the reason is on the screen.
  'receipt.email': 'שליחת קבלה במייל',
  'receipt.cardOnly': 'קבלה ממוחשבת מונפקת לתשלומי כרטיס אשראי בלבד',
  'receipt.externalNumber': 'מספר קבלה חיצוני',
  'history.title': 'תשלומים שבוצעו',
  'history.empty': 'עדיין לא נרשמו תשלומים',

  // -- a charge -----------------------------------------------------------------
  'charge.kind.tuition': 'שכר לימוד',
  'charge.kind.registration': 'דמי הרשמה',
  'charge.kind.event': 'אירוע',
  'charge.kind.manual': 'חיוב ידני',
  'charge.status.open': 'פתוח',
  'charge.status.settled': 'שולם',
  'charge.status.void': 'בוטל',
  'charge.status.written_off': 'נמחק כחוב אבוד',
  'charge.period': 'תקופה',
  'charge.dueDate': 'לתשלום עד',
  'charge.amount': 'סכום',
  'charge.overdue': 'באיחור',
  // §5.10 step 2 — so a prorated first month reads as an explanation, not a cheaper price.
  'charge.proration': 'בגין {{covered}} מתוך {{total}} שיעורים',
  'charge.originalAmount': 'מחיר מלא',
  'charge.credit': 'זיכוי',
  'charge.addManual': 'חיוב או זיכוי ידני',
  'charge.reason': 'סיבה',
  'charge.reasonRequired': 'חיוב ידני מחייב ציון סיבה',
  'charge.negativeHint': 'סכום שלילי הוא זיכוי או הנחה',
  'charge.writeOff': 'מחיקת חוב',

  // -- recording a payment (dashboard 3e) ---------------------------------------
  'payment.record': 'רישום תשלום',
  'payment.date': 'תאריך התשלום',
  'payment.amount': 'סכום שהתקבל',
  'payment.note': 'הערה',
  'payment.saved': 'התשלום נרשם',
  'payment.allocatedOldestFirst': 'התשלום שויך לחיובים הוותיקים ביותר',
  'payment.unallocated': 'יתרה לא משויכת',

  // -- the monthly billing run (§5.10) ------------------------------------------
  'run.title': 'הרצת חיוב חודשית',
  'run.period': 'חודש החיוב',
  'run.runNow': 'הרצה עכשיו',
  'run.status.running': 'רצה',
  'run.status.completed': 'הסתיימה',
  'run.status.failed': 'נכשלה',
  'run.chargesCreated': 'נוצרו {{count}} חיובים',
  'run.frozenSkipped': 'חניכים בהקפאה לא חויבו',
  // §5.10 step 5 — invariant 5 in words, on the button the manager is about to press.
  'run.idempotentHint': 'הרצה חוזרת לאותו חודש לא תיצור חיובים כפולים',
  'run.lastRun': 'הרצה אחרונה',
  'run.never': 'טרם בוצעה הרצה',

  // -- collection and the debt ladder (dashboard 3e) ----------------------------
  'debt.title': 'תשלומים וגבייה',
  'debt.byHousehold': 'חוב לפי משק בית',
  'debt.empty': 'אין חובות פתוחים במועדון',
  'debt.total': 'סה״כ חוב פתוח',
  'debt.aging.title': 'גיל החוב',
  'debt.aging.0_30': '0–30 ימים',
  'debt.aging.31_60': '31–60 ימים',
  'debt.aging.60_plus': 'מעל 60 ימים',
  'debt.sendReminder': 'שליחת תזכורת',
  'debt.reminderSent': 'התזכורת נשלחה',
  'debt.escalation.day3': 'תזכורת ראשונה',
  'debt.escalation.day7': 'תזכורת שנייה',
  'debt.escalation.day14': 'התראה אחרונה',
  'debt.escalation.none': 'טרם נשלחה תזכורת',

  // -- uPay orders --------------------------------------------------------------
  'order.status.pending': 'ממתין לאישור',
  'order.status.paid': 'שולם',
  'order.status.failed': 'נכשל',
  'order.status.amount_mismatch': 'סכום לא תואם',
  'order.status.expired': 'פג תוקף',
  // §5.10 — the return page is never the source of truth; a closed tab still pays.
  'order.verifying': 'התקבל, מאמת תשלום…',
  'order.verifyingHint': 'אפשר לסגור את החלון — האישור יגיע גם אם תצאו מהעמוד',
  'order.mismatchAlert': 'התקבל תשלום בסכום שונה מהמצופה — נדרשת בדיקה',
  'order.mismatchHint': 'התשלום נרשם במלואו ולא שויך לחיובים',
  'order.stale': 'ממתין מעל 24 שעות — יש לוודא מול דוחות חברת הסליקה',

  // -- הוראת קבע reconciliation (§5.10) ------------------------------------------
  'reconciliation.title': 'התאמת תשלומים',
  'reconciliation.unmatched': 'תשלומים ללא שיוך',
  'reconciliation.expected': 'משלמים צפויים החודש',
  'reconciliation.cardOwner': 'שם בעל הכרטיס',
  'reconciliation.last4': '4 ספרות אחרונות',
  'reconciliation.suggestion': 'שיוך מוצע',
  'reconciliation.confidence': 'רמת ודאות',
  'reconciliation.confirm': 'אישור השיוך',
  'reconciliation.ignore': 'התעלמות',
  'reconciliation.matched': 'השיוך נרשם',
  'reconciliation.empty': 'אין תשלומים הממתינים לשיוך',
  // §5.10 step 5 — a wrong automatic match sends the wrong parent a debt reminder.
  'reconciliation.neverAuto': 'שיוך נרשם רק לאחר אישור אנושי',
  'reconciliation.overpayment': 'תשלום עודף',
  'reconciliation.carryForward': 'זקיפה לחודש הבא',

  // -- who the manager knows is on הוראת קבע -------------------------------------
  'subscription.title': 'הוראות קבע',
  'subscription.status.active': 'פעילה',
  'subscription.status.cancelled': 'בוטלה',
  'subscription.add': 'רישום הוראת קבע',
  'subscription.amount': 'סכום חודשי',
  'subscription.managerRecordHint': 'רישום של המועדון בלבד — ההורה אינו מגדיר אותו',

  // -- prices and plans (dashboard 5a, wizard 5e) --------------------------------
  'plan.title': 'מחירים ומסלולים',
  'plan.add': 'מסלול חדש',
  'plan.name': 'שם המסלול',
  'plan.monthlyAmount': 'מחיר חודשי',
  'plan.registrationFee': 'דמי הרשמה',
  'plan.activeFrom': 'בתוקף מתאריך',
  'plan.activeTo': 'בתוקף עד',
  'plan.appliesTo': 'חל על',
  'plan.empty': 'לא הוגדרו מסלולים',
  // §5.10 — plans are versioned, never edited in place, so history stays explicable.
  'plan.versionedHint': 'שינוי מחיר סוגר את המסלול הקיים ופותח חדש. חיובים קודמים נשמרים',
  'plan.closeCurrent': 'סגירת המסלול הנוכחי',

  // -- the product catalog and handing an item over (12e, 11a) -------------------
  'product.title': 'פריטים למכירה',
  'product.add': 'פריט חדש',
  'product.name': 'שם הפריט',
  'product.price': 'מחיר',
  'product.empty': 'לא הוגדרו פריטים',
  'product.handOut': 'מסירת פריט',
  'product.handedOut': 'הפריט נמסר ונוצר חיוב',
  'product.order': 'הזמנת פריטים',
  // §5.10 — 'no stock counts, no inventory. That is a different product.'
  'product.noStockHint': 'אין ניהול מלאי — בחירת פריט יוצרת חיוב בלבד',

  // -- added by M6's screens (1b, 12e, 12f, 11a, 3e, 5a) ------------------------
  'card.splitSingle': 'תשלום אחד',
  'card.splitEqual': '{{count}} תשלומים שווים',
  'charge.overdueDays': '{{count}} ימי פיגור',
  'filter.all': 'הכל',
  'debt.balance': 'יתרה',
  'debt.monthsInDebt': 'חודשים בחוב',
  'debt.sortBy': 'מיון',
  'debt.collectedThisMonth': 'נגבה החודש',
  'debt.collectedShare': '{{percent}}% מהצפוי',
  'debt.sendReminderToCount': 'שליחת תזכורת ל־{{count}} משקי בית',
  'debt.household': 'משק בית',
  'run.confirm': 'אישור הפקת חיובים',
  'export.forAccountant': 'ייצוא לרו״ח',
  'payment.recordCash': 'רישום תשלום מזומן',
  'history.paidThisYear': 'שולם השנה',
  'history.openBalance': 'יתרה פתוחה',
  'product.forWhom': 'למי',
  'product.size': 'מידה',
  'product.colour': 'צבע',
  'product.handOutPolicy': 'מחיר הפריט אינו מוצג למאמן',
  'dialog.cancel': 'ביטול',
}
