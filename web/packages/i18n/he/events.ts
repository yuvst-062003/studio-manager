import type { Bundle } from '../types'

/**
 * Owned by the EVENTS lane (M7). Hebrew is the reference locale — `en` and `ru` mirror
 * these keys and `web/scripts/i18n-parity.mjs events` fails on a gap in `en`.
 *
 * Artboards: dashboard `7a` אירועים ותחרויות, `7b` יצירת אירוע, `7c` עמוד אירוע (**D9.2**),
 * `4d` מבחן חגורה — זכאות וקידום, `6b` מבחני חגורה, `5b` מערכת חגורות, `5d` אשף · שלב 2;
 * staff `9d` מבחן חגורה, `9i` אירועים בצוות; parent `7d` הזמנה לאירוע, `12h` אירועים,
 * `12d` התקדמות חגורה.
 *
 * **Belt strings live here under `belt.*`, and that is deliberate.**
 * `web/packages/i18n/types.ts` lists exactly nine namespaces and `index.ts` is authored
 * once — a lane never edits it. §4.3 puts `belt_rank`/`student_belt` and `event` in the
 * same milestone (M7) and §5.9 makes a belt exam *an event with `type='belt_exam'`*, so
 * one namespace holding both is the shape the domain already has, not a workaround.
 *
 * Two rules the copy itself has to hold:
 *  - **D9.2 — there are no `משקל`/`קטגוריה` strings.** §2.2 defers weight categories to v2
 *    and they imply `student` fields §4.3 does not carry. Adding the key is how the cut
 *    quietly comes back.
 *  - **`draft` is invisible to guardians** (§4.3). `status.draftHint` says so on the screen,
 *    because an event built up over days is only safe if that is stated.
 */
export const events: Bundle = {
  // -- the events list (dashboard 7a, staff 9i, parent 12h) ----------------------
  'title': 'אירועים ותחרויות',
  'list.empty': 'אין אירועים מתוכננים',
  'list.upcoming': 'קרובים',
  'list.past': 'שהיו',
  'list.mine': 'האירועים שלי',
  'create': 'אירוע חדש',

  // -- an event's type and status ------------------------------------------------
  'type.competition': 'תחרות',
  'type.belt_exam': 'מבחן חגורה',
  'type.seminar': 'סמינר',
  'type.joint_training': 'אימון משותף',
  'type.trip': 'טיול',
  'type.other': 'אחר',
  'status.draft': 'טיוטה',
  'status.published': 'פורסם',
  'status.cancelled': 'בוטל',
  'status.completed': 'הסתיים',
  // §4.3 — nothing is visible to a guardian while the event is a draft.
  'status.draftHint': 'אירוע בטיוטה אינו מוצג להורים',
  'publish': 'פרסום האירוע',
  'published': 'האירוע פורסם',
  'cancel': 'ביטול האירוע',
  'cancelReason': 'סיבת הביטול',

  // -- creating an event (dashboard 7b) ------------------------------------------
  'form.title': 'יצירת אירוע',
  'form.name': 'שם האירוע',
  'form.description': 'תיאור',
  'form.type': 'סוג האירוע',
  'form.startsAt': 'מתחיל',
  'form.endsAt': 'מסתיים',
  'form.endBeforeStart': 'מועד הסיום חייב להיות אחרי מועד ההתחלה',
  'form.location': 'מיקום',
  'form.locationExternal': 'מקום חיצוני',
  // §5.8 — a competition in another city is not one of the studio's own locations.
  'form.locationExternalHint': 'לאולם או מקום שאינו אחד ממיקומי המועדון',
  'form.rsvpDeadline': 'הרשמה עד',
  'form.save': 'שמירה',
  'form.saveDraft': 'שמירה כטיוטה',

  // -- who it is for (§5.8's targeting) ------------------------------------------
  'target.title': 'קהל יעד',
  'target.studio': 'כל המועדון',
  'target.class': 'חוג',
  'target.group': 'קבוצה',
  'target.student': 'חניכים נבחרים',
  'target.add': 'הוספת קהל יעד',
  'target.empty': 'לא נבחר קהל יעד',
  'target.composeHint': 'אפשר לצרף כמה קהלים יחד',

  // -- the fee (§5.8 — the event's price is a setting; a charge is what a family owes)
  'fee.label': 'עלות',
  'fee.free': 'ללא עלות',
  'fee.perStudent': 'לחניך',
  'fee.chargeOnConfirm': 'אישור השתתפות יוצר חיוב להורה המשלם',

  // -- consent (§5.8) -------------------------------------------------------------
  'consent.required': 'דרוש אישור הורה',
  'consent.text': 'נוסח האישור',
  'consent.textRequired': 'אירוע הדורש אישור חייב לכלול נוסח',
  'consent.sign': 'אישור וחתימה',
  'consent.signed': 'האישור נחתם',
  'consent.pending': 'ממתין לאישור הורה',
  // §5.8 — the RSVP does not count as confirmed until the consent is signed.
  'consent.blocksConfirmation': 'ההשתתפות תיחשב מאושרת רק לאחר חתימת ההורה',

  // -- RSVP (parent 7d, dashboard 7c) ---------------------------------------------
  'rsvp.title': 'אישור השתתפות',
  'rsvp.yes': 'מגיע',
  'rsvp.no': 'לא מגיע',
  // §4.3 — `pending` is a real state: nobody answered, which is not the same as declining.
  'rsvp.pending': 'טרם ענו',
  'rsvp.answered': 'התשובה נשמרה',
  'rsvp.deadlinePassed': 'מועד ההרשמה חלף',
  'rsvp.change': 'שינוי התשובה',

  // -- the event page's counters (dashboard 7c ▲ D9.2 — no weight/category column) --
  'counts.registered': 'נרשמו',
  'counts.pending': 'טרם ענו',
  'counts.declined': 'לא מגיע',
  'counts.paid': 'שולם',
  'remindNonResponders': 'תזכורת למי שלא ענה',
  'reminderSent': 'התזכורת נשלחה',
  'roster.empty': 'אף חניך לא שויך לאירוע',

  'addToCalendar': 'הוסף ליומן',
  'attendance.take': 'סימון נוכחות באירוע',

  // -- belt exams (§5.9 — an exam is an event; staff 9d, dashboard 4d, 6b) ---------
  'exam.title': 'מבחן חגורה',
  'exam.plural': 'מבחני חגורה',
  'exam.candidates': 'מועמדים',
  'exam.nominate': 'שיבוץ מועמדים',
  'exam.eligibility': 'זכאות',
  'exam.eligibleHint': 'הזכאות מחושבת לפי הדרגה הנוכחית והוותק בה',
  'exam.notEligible': 'טרם זכאי',
  'exam.result.pass': 'עבר',
  'exam.result.fail': 'לא עבר',
  'exam.result.pending': 'טרם נבחן',
  'exam.note': 'הערת הבוחן',
  'exam.record': 'רישום תוצאות',
  'exam.recorded': 'התוצאות נרשמו',
  // §5.9 step 3 — pass writes the result, the belt row and the cache in one transaction.
  'exam.passPromotesHint': 'תוצאת ״עבר״ מעניקה את הדרגה הבאה ומעדכנת את כרטיס החניך',
  'exam.empty': 'לא נקבעו מבחני חגורה',

  // -- the belt system (dashboard 5b, wizard 5d) ----------------------------------
  'belt.title': 'מערכת חגורות',
  'belt.rank': 'דרגה',
  'belt.rankPlural': 'דרגות',
  'belt.add': 'דרגה חדשה',
  'belt.name': 'שם הדרגה',
  'belt.kyu': 'קיו',
  'belt.kyuOptional': 'לא כל מועדון משתמש בקיו',
  'belt.order': 'סדר',
  'belt.orderHint': 'הסדר קובע מהי הדרגה הבאה',
  'belt.color': 'צבע',
  'belt.secondaryColor': 'צבע משני',
  'belt.biColor': 'חגורה דו־צבעית',
  'belt.perClassHint': 'מערכת החגורות מוגדרת לכל חוג בנפרד',
  'belt.empty': 'לא הוגדרה מערכת חגורות',
  'belt.seedDefault': 'טעינת מערכת חגורות ברירת מחדל',

  // -- a student's belt (parent 12d, dashboard 4d) --------------------------------
  'belt.current': 'הדרגה הנוכחית',
  'belt.next': 'הדרגה הבאה',
  'belt.none': 'טרם הוענקה דרגה',
  'belt.progress': 'התקדמות חגורה',
  'belt.history': 'היסטוריית דרגות',
  'belt.awardedOn': 'הוענקה בתאריך',
  'belt.awardedBy': 'הוענקה על ידי',
  'belt.awardNote': 'הערה',
  'belt.award': 'הענקת דרגה',
  'belt.awarded': 'הדרגה הוענקה',
  // §5.9 — a promotion outside a formal exam is a real thing in a children's club.
  'belt.awardOutsideExam': 'הענקה ללא מבחן',
  'belt.groupPromote': 'קידום קבוצתי',
  'belt.groupPromoteHint': 'קידום כל המועמדים שעברו, בפעולה אחת',

  // -- 7a / 9i / 12h — list chrome the audits found missing ------------------------
  'list.loading': 'טוען…',
  'list.subtitle': 'אירועים חד-פעמיים — לא חלק מהלו״ז השבועי',
  'list.filterAll': 'הכל',
  'list.needsAttention': 'דורשים תשומת לב',
  // 7a finding 1 — `status.draftHint` says a draft is hidden from parents; this says why
  // the manager is still looking at it. 6b's draft copy is better than 7a's and this is it.
  'status.draftWhy': 'טיוטה — טרם הושלמה',

  // -- 7c / 9i — aggregates. The rsvp.* keys above are per-student and singular -------
  'counts.confirmed': 'אישרו',
  'counts.awaitingConsent': 'ללא אישור הורה',
  'counts.attended': 'הגיעו',

  // -- 7c — the participants table (D9.2 — six columns, none of them משקל) -----------
  'roster.title': 'רשימת משתתפים',
  'roster.columnConsent': 'אישור הורה חתום',
  'roster.columnPayment': 'תשלום',
  // The em dash on a cell that does not apply — a consent or a payment is meaningless
  // until someone has said yes. It needs a label, not a bare glyph.
  'roster.notApplicable': 'לא רלוונטי',
  'roster.sendConsentForm': 'שליחת טופס',

  // -- 7b findings 2 and 8 — a required field with no input, on a form that never errors
  'form.required': 'שדה חובה',
  'form.blank': 'אירוע חדש',
  'form.errorTitle': 'לא ניתן לשמור',
  'form.saved': 'האירוע נשמר',
  'form.edit': 'עריכת האירוע',

  // -- 7d / 12h finding 7 — the parent's screen speaks in the second person -----------
  'rsvp.awaitingYourAnswer': 'ממתין לתשובתכם',
  'rsvp.youConfirmed': 'אישרתם השתתפות',
  'rsvp.youDeclined': 'סימנתם שלא תגיעו',

  // -- 9d / 4d / 6b — the exam --------------------------------------------------------
  'exam.new': 'מבחן חגורה חדש',
  'exam.save': 'שמירת התוצאות',
  'exam.tenureAtRank': 'ותק בדרגה',
  'exam.readiness': 'מוכנות',
  // Deliberately impersonal. 4d finding 7: `מוכן`/`מוכנה` inflects per student and is the
  // first gendered STATUS value in the product. A neutral phrasing is the one thing this
  // lane can ship that is correct for every child.
  'exam.ready': 'עומד/ת בתנאים',
  'exam.confirmPromotion': 'אישור קידום',
  'exam.promoted': 'הדרגות הוענקו',

  // -- 5b / 5d — the belt system ------------------------------------------------------
  'form.cancel': 'ביטול',
  'belt.delete': 'מחיקת דרגה',
  'belt.edit': 'עריכת דרגה',
  'belt.save': 'שמירת דרגה',
  'belt.preview': 'תצוגה מקדימה',
  // 5b reorders by drag and there is no drag primitive and no shared drag utility, so the
  // rows move with buttons over `order_index` — the column that exists.
  'belt.moveUp': 'העלאה בסדר',
  'belt.moveDown': 'הורדה בסדר',
  // 5b finding 7 — the row already shows how many students hold the rank, so the refusal
  // has its reason on screen. `student_belt.belt_rank_id` is ON DELETE RESTRICT.
  'belt.deleteHeld': 'לא ניתן למחוק דרגה שהוענקה לחניכים',
  'belt.holders': 'חניכים בדרגה',
  'belt.noClassYet': 'מערכת החגורות תוגדר אחרי יצירת החוגים',
  'belt.presetTitle': 'איזו מערכת חגורות נהוגה אצלכם?',
  'belt.presetScratch': 'הגדרה ידנית',
  'belt.presetRankCount': 'דרגות בערכה',

  // -- 12d ------------------------------------------------------------------------------
  // 12d finding 7 — the artboard spells both ordinals as Hebrew words, which no
  // interpolation produces. Digits instead, rather than adding a Hebrew ordinal formatter
  // to `core`, which is not this lane's package.
  'belt.ordinalOfTotal': 'דרגה מתוך',
  'belt.progressCaption': 'הדרגות שהוענקו עד היום',
}
