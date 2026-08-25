import type { Bundle } from '../types'

/**
 * Owned by the COMMS lane (M8). Hebrew is the reference locale — `en` and `ru` mirror
 * these keys and `web/scripts/i18n-parity.mjs comms` fails on a gap in `en`.
 *
 * Artboards: parent `2b` עדכוני מועדון (**D9.1**); dashboard `4f` הודעות — קהל יעד
 * ותצוגה מקדימה.
 *
 * **D9.1 — there are no chat strings here, and that is checked.** §2.3 puts in-app
 * two-way chat out of scope and §5.11 permits exactly two levels: push, and a one-way
 * inbox. The canvas edit cut `שיחה עם המשרד` from `2b`. A `reply.*` or `chat.*` key is
 * how that decision gets reversed by someone who thought they were adding a small thing.
 *
 * Two families of string carry §5.11's silent-failure work, and they are the reason this
 * namespace is larger than a one-way inbox would suggest:
 *  - `delivery.*` is the report a manager reads after a cancellation. It names *why* a
 *    family did not get the message, because "5 didn't receive it" is not actionable and
 *    "5 never installed the app" is.
 *  - `pushDisabled.*` is the persistent, non-dismissible banner for a user with push
 *    turned off. §5.11 expects it to convert a meaningful share of denials, which it only
 *    does if it says what is actually being missed.
 */
export const comms: Bundle = {
  // -- the parent inbox (parent 2b ▲ D9.1 — inbox only) --------------------------
  'inbox.title': 'עדכוני מועדון',
  'inbox.empty': 'אין עדכונים',
  'inbox.emptyHint': 'הודעות מהמועדון יופיעו כאן',
  'inbox.unread': 'לא נקראו',
  'inbox.markRead': 'סימון כנקרא',
  'inbox.markAllRead': 'סימון הכל כנקרא',
  'inbox.new': 'חדש',
  'inbox.older': 'קודמות',

  // -- publishing (dashboard 4f) --------------------------------------------------
  'announcement.title': 'הודעות',
  'announcement.create': 'הודעה חדשה',
  'announcement.subject': 'כותרת',
  'announcement.body': 'תוכן ההודעה',
  'announcement.empty': 'טרם נשלחו הודעות',
  'announcement.publish': 'שליחה',
  'announcement.published': 'ההודעה נשלחה',
  'announcement.schedule': 'תזמון שליחה',
  'announcement.scheduledFor': 'תישלח בתאריך',
  'announcement.draft': 'טיוטה',
  'announcement.cancelSchedule': 'ביטול התזמון',
  'announcement.delete': 'מחיקת ההודעה',

  // -- who it goes to -------------------------------------------------------------
  'audience.title': 'קהל יעד',
  'audience.studio': 'כל המועדון',
  'audience.class': 'חוג',
  'audience.group': 'קבוצה',
  'audience.recipients': 'יגיע ל-{{count}} משפחות',
  'audience.none': 'לא נבחר קהל יעד',
  // §3.2 — a lead coach publishes to their own groups and nowhere else.
  'audience.limitedToOwnGroups': 'ניתן לשלוח לקבוצות שאתם מאמנים',

  'preview.title': 'תצוגה מקדימה',
  'preview.asParent': 'כפי שההורה יראה',
  'preview.pushLine': 'כך תיראה ההתראה בנעילת המסך',

  // -- §5.11's delivery report ------------------------------------------------------
  'delivery.title': 'דוח מסירה',
  'delivery.sent': 'נשלח ל-{{count}} משפחות',
  'delivery.received': '{{count}} קיבלו',
  'delivery.missed': '{{count}} לא קיבלו',
  'delivery.inFlight': 'ההודעה עדיין נשלחת',
  'delivery.allReceived': 'כל המשפחות קיבלו את ההודעה',
  // The three reasons a message did not land, in the manager's terms. Merging them is
  // what turns this screen back into a number nobody can act on.
  'delivery.reason.no_token': 'האפליקציה לא הותקנה',
  'delivery.reason.denied': 'התראות כבויות',
  'delivery.reason.failed': 'השליחה נכשלה',
  'delivery.copyNumbers': 'העתקת המספרים',
  'delivery.numbersCopied': 'המספרים הועתקו',
  'delivery.resend': 'שליחה חוזרת',
  // §5.11 — no WhatsApp API, no cost: the share sheet, and the manager picks the group.
  'delivery.shareToWhatsapp': 'שליחה גם בוואטסאפ',

  // -- the push-disabled banner (§5.11) ---------------------------------------------
  'pushDisabled.title': 'התראות כבויות',
  'pushDisabled.body': 'לא תקבלו עדכונים על ביטולי שיעורים',
  'pushDisabled.openSettings': 'פתיחת ההגדרות',
  // §6.5 — on iOS there is no way to prompt; Web Push exists only for an installed app.
  'pushDisabled.iosNeedsInstall': 'באייפון יש להוסיף את האפליקציה למסך הבית כדי לקבל התראות',
  'pushEnabled.confirmation': 'התראות פעילות',
  'push.enable': 'הפעלת התראות',

  // -- notification preferences (§5.11) ---------------------------------------------
  'preferences.title': 'הגדרות התראות',
  'preferences.subtitle': 'אפשר לכבות כל סוג התראה בנפרד',
  'preferences.on': 'פעיל',
  'preferences.off': 'כבוי',
  // §5.11 — health-declaration and payment-failure notices are transactional and are not
  // individually mutable. The screen says so instead of showing a switch that does nothing.
  'preferences.alwaysOn': 'התראה זו נשלחת תמיד',
  'preferences.kind.session_cancelled': 'ביטול או שינוי שיעור',
  'preferences.kind.coach_substituted': 'החלפת מאמן',
  'preferences.kind.announcement': 'הודעות מהמועדון',
  'preferences.kind.event': 'אירועים ותחרויות',
  'preferences.kind.payment': 'תשלומים וחיובים',
  'preferences.kind.belt': 'חגורות ומבחנים',
  'preferences.kind.attendance': 'נוכחות',
  'preferences.kind.health': 'הצהרות בריאות',

  // -- §5.12's calendar feed ---------------------------------------------------------
  'calendar.title': 'סנכרון ליומן',
  'calendar.subtitle': 'השיעורים והאירועים יופיעו ביומן שלכם',
  'calendar.addGoogle': 'הוספה ליומן Google',
  'calendar.addApple': 'הוספה ליומן Apple',
  'calendar.copyLink': 'העתקת הקישור',
  'calendar.linkCopied': 'הקישור הועתק',
  'calendar.rotate': 'החלפת הקישור',
  'calendar.rotated': 'הקישור הוחלף — הקישור הקודם כבר אינו פעיל',
  'calendar.rotateWarning': 'החלפת הקישור מנתקת כל יומן שכבר סונכרן',
  'calendar.lastRotated': 'הוחלף לאחרונה',
  // §5.12 — Google refreshes a subscribed calendar slowly. The feed answers "where do I
  // need to be next Tuesday", never "tonight is cancelled", and saying so here is what
  // keeps a parent from relying on it for the urgent case.
  'calendar.refreshDelay': 'יומן Google מתעדכן באיחור של עד יממה. ביטולים נשלחים תמיד בהתראה',
  'calendar.addSingleEvent': 'הוספת האירוע ליומן',
}
