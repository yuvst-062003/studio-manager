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
  // -- the in-app payment overlay (2026-09-03 addendum) --------------------------
  'overlay.title': 'תשלום',
  // -- the parent payments screen (parent 12f ▲ D9.3, 1b) -----------------------
  'title': 'תשלומים',
  'openDebts.title': 'חובות פתוחים',
  'openDebts.empty': 'אין חובות פתוחים',
  'openDebts.total': 'סה״כ חוב',
  'openDebts.forStudent': 'עבור {{name}}',
  // §3.2 -- the total still counts a charge already covered by an open payment elsewhere
  // (nothing is settled yet), but three rows saying so with no relationship to the total
  // read as a contradiction. This names the gap between the two numbers.
  'openDebts.coveredElsewhereTotal': 'מתוך זה, כלול בתשלום שכבר נפתח',
  'howToPay.title': 'איך תרצה לשלם?',

  // §5.10 — the three routes, always all three, never one hidden.
  'method.card': 'כרטיס אשראי',
  'method.standingOrder': 'הוראת קבע',
  'method.standing_order': 'הוראת קבע',
  'method.cash': 'מזומן',
  'method.cheque': 'צ׳קים',
  'method.bankTransfer': 'העברה בנקאית',
  'method.creditAdjustment': 'זיכוי',

  'card.selectMonths': 'בחר חודשים',
  'card.installments': 'תשלומים בכרטיס',
  'card.total': 'סה״כ',
  'card.pay': 'לתשלום',
  // 2c's money row (2026-09-01). `owedRow` labels THIS CHILD's open charges — the
  // household total keeps `openDebts.total` and stays on 1b, where a total is labelled
  // as one. The card is titled with one child's name, so a figure on it is read as
  // theirs whatever a comment in the code says.
  'card.owedRow': 'חוב',
  'card.dueBy': 'לתשלום עד',
  'card.coveredElsewhere': 'החיוב כלול בתשלום שכבר נפתח',
  'card.nothingSelectable': 'אין חיובים זמינים לתשלום בכרטיס',
  'card.oldestFirst': 'נבחרים החיובים הוותיקים ביותר, לכל הילדים שאתם משלמים עבורם',
  'card.monthsForward': 'כולל {{count}} חודשים מראש, שיקוזזו מהחיובים הבאים',
  // F15, cause 1 — the demo studio has no live uPay form (§19.6); `orderForm` resolves to
  // the same sentinel PaymentsSection.tsx already checks, whether the reason is the demo
  // studio's own 409 or the sentinel directly. Nothing failed — the order is open
  // server-side and an IPN settles it later — so this reads as a notice, not an error.
  'card.demoOrderOpened': 'בסביבת הדגמה אין טופס תשלום חי. ההזמנה נפתחה, ואישור התשלום יגיע בנפרד.',
  // F15, cause 2 — `GET /payment-orders/{ref}/form` answers 503 `merchant_account_unconfigured`
  // when the deployment has no uPay merchant email set. Not the family's fault, and every
  // other route on this screen still works — said so here rather than a generic failure.
  'card.merchantUnconfigured': 'תשלום בכרטיס אשראי אינו זמין כרגע — המועדון עדיין לא השלים את הגדרת הסליקה. אפשר לשלם באמצעי אחר.',

  'standingOrder.link': 'קישור להקמת הוראת קבע',
  // One link per child, so the anchor text repeats — this is the accessible name that
  // tells two otherwise identical links apart (SC 2.4.4).
  'standingOrder.linkFor': 'הקמת הוראת קבע עבור {{name}}',
  'standingOrder.instructions': 'הקמת ההוראה מתבצעת באתר חברת הסליקה',
  'standingOrder.activeWarning': 'רשומה הוראת קבע פעילה — ודא שאינך משלם פעמיים',
  'standingOrder.notConfirmable': 'תשלום בהוראת קבע נרשם על ידי המועדון לאחר קבלתו',

  'cash.instructions': 'שלמו למאמן בתחילת החודש',
  'cash.request': 'אבקש לשלם במזומן',
  'cash.requested': 'הבקשה נשלחה למנהל — החיוב ייסגר כשהמזומן יתקבל.',
  'cash.pendingChip': 'מזומן בהמתנה',
  'cash.pendingTitle': 'ממתין לאישור המנהל',
  'cash.declined': 'בקשת המזומן נדחתה — אפשר לשלם בדרך אחרת או לדבר עם המנהל.',
  'cash.manager.title': 'גביית מזומן',

  // Cheques are cash with a different word on the payment, so the copy mirrors the cash
  // set key for key. Every sentence stays true with the word swapped, which is the same
  // reason the service behind them is one service and not two.
  'cheque.instructions': 'מסרו את הצ׳קים למאמן, לפקודת העמותה',
  'cheque.request': 'אביא צ׳קים',
  'cheque.requested': 'הבקשה נשלחה למנהל — החיובים ייסגרו כשהצ׳קים יתקבלו.',
  'cheque.pendingChip': 'צ׳קים בהמתנה',
  'cheque.pendingTitle': 'ממתין לאישור המנהל',
  'cheque.declined': 'בקשת התשלום בצ׳קים נדחתה — אפשר לשלם בדרך אחרת או לדבר עם המנהל.',

  // -- decision 17 (2026-09-03) — "כבר שילמתי" as a fifth, up-front answer to "איך
  // תשלמו", on par with the other four. Choosing it asks this one follow-up -- never
  // כרטיס אשראי, because a card payment made in the app already has its own record --
  // and the two chip strings below are decision 19: a claimed row must never read as
  // settled, and a not-yet-cleared הוראת קבע row must not read as though nothing is
  // left to do.
  'alreadyPaid.methodQuestion': 'איך שילמתם?',
  'chip.alreadyPaid': 'כבר שולם · {{method}} · ממתין לאישור המועדון',
  'chip.standingPending': 'הוראת קבע · המועדון יאשר לאחר קליטת ההוראה',

  // One live promise at a time, across both routes — the service refuses a second, so the
  // other card says why rather than offering a button that answers 409.
  // Prepayment -- the club collects three months of cash or twelve cheques at a time.
  // The breakdown is shown rather than one figure, because 900 ₪ with no explanation is
  // the number a parent phones the office about.
  'prepay.termMonths': 'חודשים מראש',
  'prepay.openCharges': 'חיובים פתוחים',
  'prepay.forward': 'תשלום מראש',
  'prepay.total': 'סה״כ לתשלום',
  'prepay.note': 'המועדון ירשום את התשלום כשהכסף יתקבל.',
  // Derived from the credit and the CURRENT monthly price, never stored: שולם עד תאריך X
  // הופך לשקר ברגע שהמשפחה משדרגת מסלול.
  'prepay.termsTitle': 'תשלום מראש',
  'prepay.termsHint': 'כמה חודשים מראש המועדון גובה בכל מסלול תשלום',
  'prepay.termsZeroHint': '0 מבטל את ההצעה לתשלום מראש במסלול הזה',
  'prepay.forwardMonths': 'חודשים מראש',
  'prepay.credit': 'בזכות',
  'prepay.paidAhead': 'שולם מראש',
  'prepay.coversOneMonth': 'מכסה חודש אימון אחד',
  'prepay.coversMonths': 'מכסה {{count}} חודשי אימון',
  'prepay.andPartOfNext': 'ובנוסף, מהחודש שאחריו:',

  'promise.blocked': 'קיימת בקשת תשלום שממתינה למנהל — אפשר לשלוח בקשה נוספת לאחר שיטופל בה.',

  // The manager's queue answers 'who is bringing money', not 'who is bringing cash' —
  // the method is a column in it now rather than the name of the screen.
  'promise.manager.title': 'בקשות תשלום',
  'promise.manager.empty': 'אין בקשות תשלום פתוחות.',
  'promise.manager.confirm': 'התשלום התקבל',
  'promise.manager.decline': 'לא התקבל',
  // §3.4 -- `1 חיובים` is not a word. Two forms, chosen by count, the same way
  // `card.splitSingle`/`card.splitEqual` already do a few lines below.
  'promise.manager.chargesOne': 'חיוב אחד',
  'promise.manager.charges': '{{count}} חיובים',
  'promise.manager.method': 'אמצעי תשלום',
  'promise.manager.filterAll': 'הכול',
  'promise.manager.forPlan': 'עבור מסלול',
  'promise.manager.saysPaid': 'מדווח ששילם',
  'promise.manager.saysWillPay': 'עומד לשלם',
  // -- חנות המועדון (the redesign of 2026-09-05) ---------------------------------
  //
  // This block REPLACES the five keys the old `ShopSection` used ('shop.order',
  // 'shop.ordered', 'shop.toPayment' and the two others), which went orphan when that
  // screen was deleted. 'shop.title' is the one that survived unchanged, because it is
  // the same three words on the same tab.
  'shop.title': 'חנות המועדון',
  'shop.subtitle': 'מזמינים באפליקציה, מקבלים ישירות מהמאמן באימון',
  'shop.standardBadge': 'ציוד תקני',
  // -- the product grid --
  'shop.choose': 'בחירה',
  // The tile where the prototype puts a photograph. Named, so a screen reader does not
  // announce a decorative panel and so a missing image is legible rather than broken.
  'shop.noPhoto': 'אין תמונה לפריט',
  'shop.deliveryNote': 'מסירה אישית ובטוחה ישירות מהמאמן בתחילת האימון לאחר וידוא מידה.',
  // -- the customiser sheet --
  'shop.customiseTitle': 'בחירת פריט ומאפיינים',
  'shop.sizeLegend': 'מידה',
  'shop.sizeRequired': 'יש לבחור מידה',
  'shop.quantityLabel': 'כמות',
  'shop.noteLabel': 'הערה למאמן (אופציונלי)',
  'shop.notePlaceholder': 'למשל: רקמת שם על הגי',
  'shop.addToCart': 'הוספה לסל',
  // -- the basket --
  'shop.cartBarItems': '{{count}} פריטים בסל',
  'shop.cartBarOneItem': 'פריט אחד בסל',
  'shop.cartOpen': 'לסל ותשלום',
  'shop.cartTitle': 'סל הקניות',
  'shop.cartEmpty': 'הסל ריק',
  'shop.cartRemove': 'הסרה',
  'shop.cartQuantity': 'כמות',
  'shop.cartTotal': 'סה״כ',
  'shop.checkout': 'שליחת ההזמנה',
  'shop.checkoutSending': 'שולח…',
  // -- after the order. The club charges for it; nothing is paid here --
  'shop.placedTitle': 'ההזמנה נשלחה למועדון',
  // `{{total}}` arrives already formatted — agorot are never divided at a call site.
  'shop.placedBody': 'נוצרו {{count}} חיובים על סך {{total}}. המאמן יימסור את הפריטים באימון הקרוב.',
  'shop.placedPay': 'מעבר לתשלומים',
  // The choice at the moment of purchase (owner, 2026-09-07). Both routes existed on
  // the payments screen and both take charge ids, so the shop offers them over the
  // charges it just created rather than sending the parent to another screen.
  'shop.payHow': 'איך תשלמו על ההזמנה?',
  'shop.payCard': 'כרטיס אשראי',
  'shop.payCash': 'מזומן במועדון',
  'shop.paySending': 'רגע…',
  'shop.payLater': 'אחר כך, דרך מסך התשלומים',
  'shop.cashDoneTitle': 'הודענו למנהל',
  'shop.cashDoneBody': 'רשמנו שתשלמו {{total}} במזומן. המנהל יסמן כשהכסף יגיע.',
  'shop.payFailed': 'לא הצלחנו להמשיך לתשלום. ההזמנה נשמרה — אפשר לשלם ממסך התשלומים.',
  'shop.placedClose': 'סגירה',
  'shop.checkoutFailed': 'ההזמנה לא נשלחה. נסו שוב.',
  // -- ההזמנות שלי, moved here from פרופיל on the owner's review of 2026-09-06: they are
  //    shop orders, and the prototype's own shop puts an order tracker at the top --
  'shop.ordersCta': 'ההזמנות שלי',
  'shop.ordersTitle': 'ההזמנות שלי',
  'shop.ordersSub': 'פריטים שהזמנתם מהמועדון',
  'shop.ordersEmpty': 'עדיין לא הזמנתם פריטים',
  'shop.ordersAll': 'לכל התשלומים',
  // -- the catalogue's own states --
  'shop.loading': 'טוען את החנות…',
  'shop.loadFailed': 'לא הצלחנו לטעון את החנות',
  'shop.retry': 'נסו שוב',
  'shop.empty': 'אין כרגע פריטים למכירה',
  'shop.emptyBody': 'כשהמועדון יוסיף ציוד, הוא יופיע כאן.',
  'shop.close': 'סגירה',

  // D9.3 — the email affordance is card rows only, and the reason is on the screen.
  'receipt.email': 'שליחת קבלה במייל',
  'receipt.cardOnly': 'קבלה ממוחשבת מונפקת לתשלומי כרטיס אשראי בלבד',
  'receipt.externalNumber': 'מספר קבלה חיצוני',
  'history.title': 'תשלומים שבוצעו',
  'history.back': 'חזרה לתשלומים',
  'history.filterLegend': 'סינון לפי סוג',
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
  'payment.method': 'אמצעי תשלום',
  'payment.method.cash': 'מזומן',
  'payment.method.cheque': 'צ׳ק',
  'payment.method.bank_transfer': 'העברה בנקאית',
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
  'debt.details': 'פירוט חיובים',
  'debt.detailsEmpty': 'אין חיובים פתוחים',
  'debt.byHousehold': 'חוב לפי משק בית',
  'debt.empty': 'אין חובות פתוחים במועדון',
  'debt.total': 'סה״כ חוב פתוח',
  'debt.aging.title': 'גיל החוב',
  'debt.aging.0_30': '0–30 ימים',
  'debt.aging.31_60': '31–60 ימים',
  'debt.aging.60_plus': 'מעל 60 ימים',
  // -- F7a's debt reminders ---------------------------------------------------------
  'debt.reminderRecent': 'נשלחה תזכורת ב־24 השעות האחרונות',
  'reminder.quietHours': 'אין שליחת הודעות בין 21:00 ל־08:00',
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
  // `5e`'s question. The step opened with a note about links and never said what it was for.
  'plan.wizardTitle': 'כמה עולה להתאמן אצלכם?',
  'plan.wizardHint': 'מספיק מסלול אחד כדי להתחיל. אפשר להוסיף עוד ולשנות מחירים בכל זמן.',
  'plan.later': 'אקבע מחירים אחר כך',
  // Step 4, rebuilt 2026-08-29. `plan.appliesTo` ("applies to") was a bare number box
  // bound to sessions_per_week — no unit, no example, nothing saying what a good answer
  // was. These name the same quantity as the question a club already asks itself.
  'plan.howOften': 'כמה פעמים בשבוע מתאמנים במסלול הזה?',
  'plan.perWeek': '{{count}} אימונים בשבוע',
  'plan.unlimited': 'ללא הגבלה',
  'plan.badge.noneTitle': 'לא הוגדר מסלול — החניך לא מחויב',
  'plan.badge.column': 'מסלול',
  // ── מחירים לפי חוג (2026-09-09) ──────────────────────────────────────────────
  // The screen that makes per-class pricing operable: prices could be DEFINED before this
  // and assigned to nobody. `fallbackNote` is the load-bearing string -- without it "ללא
  // מחיר מיוחד" reads as "pays nothing", which is the one wrong answer about money here.
  'classPrices.title': 'מחירים לפי חוג',
  'classPrices.hint': 'לכל חוג שהחניך מתאמן בו אפשר לקבוע מסלול נפרד. ילד שמתאמן בשני חוגים משלם על שניהם.',
  'classPrices.none': 'ללא מחיר מיוחד',
  'classPrices.fallbackNote': 'משלם לפי המסלול הכללי — {{amount}}',
  'classPrices.noFallback': 'לא הוגדר מסלול כללי — החניך לא מחויב על החוג הזה',
  'classPrices.generalPlan': 'המסלול הכללי',
  'classPrices.empty': 'החניך לא רשום לאף חוג פעיל',
  'classPrices.save': 'שמירת מחירים',
  'classPrices.saving': 'שומר…',
  'classPrices.saved': 'המחירים נשמרו',
  'classPrices.saveFailed': 'השמירה נכשלה. נסו שוב.',
  'classPrices.loadFailed': 'לא הצלחנו לטעון את המחירים',
  'classPrices.planFor': 'מסלול עבור {{class}}',
  'plan.perMonth': 'לחודש',
  'plan.class': 'שיוך לחוג',
  // A plan with no class prices the whole club, which is how every plan worked before
  // per-class pricing and what a club with one חוג still wants.
  'plan.classAll': 'כל החוגים',
  'plan.classHint': 'מחיר החוג הזה בלבד. ילד שמתאמן בשני חוגים משלם על שניהם.',
  'plan.monthlyHint': 'בשקלים. למשל 400',
  'plan.nameHint': 'לא חובה — בלי שם נשתמש בכמות האימונים',
  'plan.moreOptions': 'שם מותאם וקישור להוראת קבע',
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

  // Part A of the payment-routes spec -- the הוראת קבע link, one per plan.
  //
  // `plan.linkNeverInherited` is the sentence that protects the club's revenue: a uPay
  // link charges a FIXED amount, so a successor plan is deliberately born without one.
  // It is said on the screen because the manager is the only one who can fix it.
  'plan.standingOrderLink': 'קישור להוראת קבע',
  'plan.linkMissing': 'חסר קישור',
  'plan.linkHint': 'הקישור שנוצר באתר חברת הסליקה עבור הסכום של המסלול הזה',
  'plan.linkNeverInherited': 'מסלול חדש נפתח תמיד ללא קישור — קישור סליקה גובה סכום קבוע, והעתקתו הייתה גובה את המחיר הישן',
  'plan.linkRefused': 'הקישור נדחה — נדרשת כתובת https של חברת הסליקה',
  'plan.linkSaved': 'הקישור נשמר',
  'plan.linksTitle': 'קישורי הוראת קבע',
  'plan.linksEmpty': 'אין מסלולים פעילים',

  // -- the product catalog and handing an item over (12e, 11a) -------------------
  'product.title': 'פריטים למכירה',
  'product.add': 'פריט חדש',
  'product.name': 'שם הפריט',
  'product.price': 'מחיר',
  'product.empty': 'לא הוגדרו פריטים',
  // -- מסירת הזמנה שכבר שולמה (2026-09-07). The shop's two halves used to be
  // strangers: a parent ordered, a charge was raised, and the coach's sheet -- which
  // could not see that order -- raised a second one on hand-over. These are the strings
  // for the settle-an-order path, kept ABOVE the picker so the paid-for route is the
  // one a coach reads first.
  'product.awaitingTitle': 'הוזמן ומחכה למסירה',
  'product.awaitingHint': 'המשפחה כבר שילמה בחנות המועדון. מסירה כאן לא יוצרת חיוב חדש.',
  'product.awaitingHandOver': 'נמסר',
  'product.awaitingDone': 'הפריט נמסר',
  'product.awaitingTakenByOther': 'מישהו אחר כבר מסר את הפריט',
  'product.awaitingOrderedOn': 'הוזמן ב-{{date}}',
  'product.newChargeTitle': 'מסירה שיוצרת חיוב חדש',
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
  // §3.3 -- no `{{percent}}` here any more. The KPI card composes the number through
  // `PercentDisplay` (an isolated left-to-right run) and this string is only the trailing
  // words, so the "0₪" beside it can no longer fuse with an un-isolated "0%".
  'debt.collectedShare': 'מהצפוי',
  'debt.sendReminderToCount': 'שליחת תזכורת ל־{{count}} משקי בית',
  'debt.household': 'משק בית',
  'run.confirm': 'אישור הפקת חיובים',
  'export.forAccountant': 'ייצוא לרו״ח',
  'payment.recordCash': 'רישום תשלום — מזומן, צ׳קים או העברה',
  'history.paidThisYear': 'שולם השנה',
  'history.openBalance': 'יתרה פתוחה',
  'product.forWhom': 'למי',
  'product.size': 'מידה',
  'product.colour': 'צבע',
  // 2026-09-06 — the catalogue gained a photo per item. Absent is ORDINARY, not an error:
  // the parent app draws its default tile, which is what `photoNone` says out loud.
  'product.photo': 'תמונת הפריט',
  'product.photoAdd': 'הוספת תמונה',
  'product.photoReplace': 'החלפת תמונה',
  'product.photoRemove': 'הסרת התמונה',
  'product.photoNone': 'אין תמונה — יוצג ריבוע ברירת מחדל',
  'product.photoUnsupported': 'התמונה חייבת להיות PNG, JPEG או WebP',
  'product.photoTooLarge': 'הקובץ גדול מדי',
  'product.photoFailed': 'העלאת התמונה נכשלה',
  'product.handOutPolicy': 'מחיר הפריט אינו מוצג למאמן',
  'dialog.cancel': 'ביטול',
  'planChange.queueTitle': 'שינויי מסלול לטיפול',
  'planChange.queueEmpty': 'אין שינויי מסלול פתוחים.',
  'planChange.difference': 'הפרש חודשי',
  'planChange.effectiveOn': 'מתאריך',
  'planChange.settle': 'טופל',
  'planChange.hint': 'שני אמצעי תשלום משולמים מראש, ולכן שינוי מסלול לא נסגר מעצמו — יש לגבות את ההפרש או לעדכן את הוראת הקבע.',

  // -- פריטים למכירה — the items screen, the wizard's step 7 and the size a parent picks -----
  // §4.3's catalogue is 'גי, חגורה, כפפות, דמי ביטוח'. Two of the four are ordered in a
  // size and two are not, which is the manager's answer per item.
  'product.plural': 'פריטים',
  'product.subtitle': 'מה המועדון מוכר — גי, חגורה, כפפות',
  'product.save': 'שמירת הפריט',
  'product.saved': 'הפריט נשמר',
  'product.edit': 'עריכת פריט',
  'product.cancel': 'ביטול',
  'product.retire': 'הפסקת מכירה',
  'product.revive': 'החזרה למכירה',
  'product.retired': 'אינו נמכר',
  'product.showRetired': 'הצגת פריטים שהופסקו',
  // §11.4's shape, restated for a catalogue: a product is retired, never deleted, because
  // charges already raised for it name it.
  'product.noDeleteHint': 'פריט מופסק ממכירה ולא נמחק — חיובים שכבר נוצרו מציינים אותו',

  // The sizes. An empty list IS 'this item has no sizes' — there is no separate flag.
  'product.hasSizes': 'הפריט מגיע במידות',
  'product.hasSizesHint': 'גי כן, חגורה לא. הורה שמזמין יתבקש לבחור מידה',
  'product.sizes': 'מידות',
  'product.sizesHint': 'הסדר שתקלידו הוא הסדר שהורה יראה',
  'product.sizeAdd': 'הוספת מידה',
  'product.sizeNew': 'מידה חדשה',
  'product.sizeRemove': 'הסרת מידה',
  'product.class': 'שיוך לחוג',
  'product.classUnset': 'בחרו חוג',
  // The parent shop shows an item only to families training in its class, so an item with
  // no class is not sold to anybody. Said on the row rather than left to be discovered.
  'product.classMissing': 'לא משויך לחוג — לא מוצג להורים',
  'product.sizesNone': 'ללא מידות',
  'product.sizesRequired': 'פריט עם מידות חייב לכלול לפחות מידה אחת',
  'product.sizeDuplicate': 'המידה כבר ברשימה',
  // 12e — the parent's side.
  'product.chooseSize': 'בחירת מידה',
  'product.quantity': 'כמות',
  'product.noteLabel': 'הערה למועדון (לא חובה)',
  'product.chooseSizeFirst': 'בחרו מידה לפני ההזמנה',

  // The wizard's seventh step.
  'product.wizardTitle': 'פריטים למכירה',
  'product.wizardHint': 'אפשר לדלג — מועדון שאינו מוכר פריטים אינו צריך את השלב הזה',
  'product.wizardDone': 'סיום השלב',
  'product.required': 'שדה חובה',

  // -- the children nobody can bill (2026-08-30) --------------------------------
  // §5.10's run has appended these to `tally.unpriced` since M6; the tally lands in
  // `billing_run.log` and nothing reads it. A child nobody can bill belongs in the same
  // view as a child who has not paid.
  'unpriced.title': 'חניכים ללא מחיר',
  'unpriced.hint': 'לא משויכת להם תוכנית מחיר, ולכן החיוב החודשי מדלג עליהם.',
  'unpriced.empty': 'לכל החניכים הפעילים יש תוכנית מחיר',
  'unpriced.payer': 'משלם',
  'unpriced.noPayer': 'אין הורה משלם',
  'unpriced.since': 'הצטרפו ב־{date}',
  'unpriced.open': 'לכרטיס החניך',

  // ── תשלומים, rebuilt 2026-09-07 ──────────────────────────────────────────────
  //
  // The screen answers "do I owe money, and how do I pay it right now", and the copy is
  // built around the three rules that make it honest:
  //
  //  1. `pay.owed` labels a number that NEVER moves. Choosing a method does not change
  //     what the family owes, so the debt has its own word and the button has another.
  //  2. `pay.payCard`/`pay.payCash` carry `{{total}}`, because the button must state what
  //     it is about to charge. 'לתשלום' with the figure somewhere above it is the shape
  //     that let ₪208.33 owed sit over buttons offering ₪500, ₪750 and ₪3,000.
  //  3. When the figure jumps, a line says why — and `pay.cashTerm` names the CLUB as the
  //     one who chose three months, because it is the club's rule and not the parent's.
  'pay.title': 'תשלומים',
  'pay.owed': 'יש לשלם',
  'pay.months': '{{count}} חודשים',
  'pay.months.one': 'חודש אחד',
  'pay.clearTitle': 'אין חוב פתוח',
  'pay.clearBody': 'כל מה שנפתח עד היום שולם. אפשר גם לשלם חודשים מראש.',
  'pay.howTitle': 'איך תשלמו?',
  'pay.methodCard': 'אשראי',
  'pay.methodCash': 'מזומן',
  'pay.monthsTitle': 'כמה חודשים?',
  // The "why the number jumped" line, card side. The parent chose this one.
  'pay.forward': '{{count}} חודשים קדימה',
  'pay.forward.one': 'חודש אחד קדימה',
  // …and cash side, where the club chose it. Naming the club is the point: the screen
  // stopped presenting the club's collection rule as if it were the parent's choice.
  'pay.cashTerm': 'המועדון גובה {{count}} חודשים מראש במזומן',
  'pay.cashTerm.one': 'המועדון גובה חודש אחד מראש במזומן',
  'pay.cashNote': 'המועדון ירשום את התשלום כשהכסף יתקבל.',
  // Bug #16 — the split. The button keeps saying the whole charge; these say how it
  // is collected. `splitFirst` exists because `instalmentSplit` puts the odd agora on
  // the first payment, and '3 תשלומים של ₪69.44' would be ₪0.01 short of the total.
  'pay.instalmentsTitle': 'לכמה תשלומים?',
  'pay.instalments': '{{count}} תשלומים בכרטיס',
  'pay.instalments.one': 'תשלום אחד בכרטיס',
  'pay.splitEqual': '{{count}} תשלומים של {{each}}',
  'pay.splitFirst': 'תשלום ראשון {{first}}, ואחריו {{count}} תשלומים של {{rest}}',
  'pay.splitFirst.one': 'תשלום ראשון {{first}}, ואחריו תשלום של {{rest}}',
  'pay.payCard': 'לתשלום {{total}}',
  'pay.payCash': 'אשלם במזומן {{total}}',
  'pay.working': 'רגע…',
  'pay.nothingPayable': 'אין כרגע חיוב שאפשר לשלם.',
  'pay.covered': 'תשלום שכבר נפתח מכסה {{total}}',
  'pay.failed': 'לא הצלחנו להמשיך לתשלום. נסו שוב.',
  // Not 'something went wrong': the family HAS a payment page open, for a different
  // number of months than they have just selected. `OrderService.create` holds it for ten
  // minutes because uPay's confirmation lands about five minutes after a real payment, so
  // the honest answer names the payment they already opened and offers it back.
  'pay.orderAlreadyOpen': 'כבר נפתח עבורכם תשלום על החודשים האלה. אפשר להמשיך אותו, או לנסות לשנות את הסכום בעוד כמה דקות.',
  'pay.resumeOpenOrder': 'המשך לתשלום שכבר נפתח',
  'pay.paidAhead': 'שולם מראש',
  'pay.lastPayment': 'התשלום האחרון',
  'pay.noPayments': 'אין עדיין תשלומים',
  'pay.allPayments': 'כל התשלומים',
  // ── the receipt (owner review, 2026-09-08) ──────────────────────────────────
  // D1: a total with no list. "An item from the store plus מנוי" was one figure, and a
  // parent had no way to see which part was which. D3: the headline is now what the
  // BUTTON charges, so the two can never disagree — the debt is a line inside it.
  'pay.nowTitle': 'לתשלום עכשיו',
  'pay.receiptTotal': 'סה״כ',
  'pay.remainder': 'נותר חוב פתוח {{total}}',
  'pay.showAll': 'הצג הכל',
  'pay.forwardLine': '{{count}} חודשים מראש',
  'pay.forwardLine.one': 'חודש אחד מראש',
  // ── cash as a floor, not a block (D2) ───────────────────────────────────────
  'pay.cashMonthsTitle': 'כמה חודשים מראש?',
  'pay.cashFloor': 'המועדון גובה {{count}} חודשים לפחות',
  'pay.cashFloor.one': 'המועדון גובה חודש אחד לפחות',
  // ── the ceiling (D6) ────────────────────────────────────────────────────────
  // Said out loud rather than leaving the chips simply absent, which reads as a bug.
  'pay.ceilingReached': 'שילמתם מראש עד הסוף — אפשר לשלם חודשים נוספים כשהמנוי יתקדם.',
  'pay.noMonthlyPrice': 'למנוי עדיין לא נקבע מחיר חודשי, ולכן אפשר לשלם כאן רק את החוב הקיים. פנו למועדון כדי לשלם חודשים מראש.',
  'pay.secureNote': 'עסקה מאובטחת ע״פ תקן PCI-DSS',
}
