import type { Bundle } from '../types'

/**
 * Owned by the staff app's five-tab redesign (2026-09-06). `title`/`empty` were added by
 * checkpoint 1; every other key below lands with checkpoint 8, the tasks tab itself —
 * §4.4 of docs/superpowers/specs/2026-09-06-staff-app-redesign.md.
 *
 * Five task kinds, one namespace: `closeSession` and `healthForm` are the two coach rows
 * that disappear on their own, `callParent` is the one that carries a tick because
 * nothing else can tell the app the call happened, and `cash`/`healthReview` are the two
 * manager rows. `{{name}}` and `{{count}}` are interpolated the same way every other
 * namespace already does it — `t(...).replace('{{name}}', ...)` or `plural(...)`.
 *
 * `birthday.*` (2026-09-06, decision reversed — see `deriveBirthdays.ts`) is a sixth,
 * separate vocabulary: birthdays are not a task kind (nothing about one is "completed"),
 * so these keys carry no `scope`/`badgeText` pair the way the five above do.
 */
export const tasks: Bundle = {
  'title': 'משימות לטיפול',
  'empty': 'אין משימות פתוחות',
  'emptyHint': 'הרשימה מתעדכנת אוטומטית לפי מה שקורה במועדון',

  'openCount': '{{count}} משימות פתוחות',
  'openCount.one': 'משימה אחת פתוחה',

  'filter.groupLabel': 'סינון משימות',
  'filter.all': 'הכל',
  'filter.urgent': 'דחוף',
  'filter.followUp': 'מעקב',

  'closeSession.scope': 'האימון שלי',
  'closeSession.badge': 'דחוף',
  'closeSession.title': 'סגירת אימון פתוח',
  'closeSession.alert':
    'האימון הסתיים ועדיין לא נרשמה נוכחות. יש לפתוח את הנוכחות ולסמן את כל החניכים.',
  'closeSession.action': 'פתח נוכחות',

  'healthForm.badge': 'הצהרת בריאות',
  'healthForm.subtitle': 'הצהרת בריאות חסרה',
  'healthForm.alert':
    'לא התקבלה הצהרת בריאות עבור החניך/ה. יש ליצור קשר עם ההורים ולבקש להשלים אותה.',
  'healthForm.action': 'צור קשר עם ההורה',
  'healthForm.message':
    'שלום, זוהי תזכורת ממועדון הג׳ודו להשלמת הצהרת הבריאות עבור {{name}} לפני האימון הבא. תודה!',

  'callParent.scope': 'מעקב חניכים',
  'callParent.badge': 'שיחת מעקב',
  'callParent.title': 'התקשרות להורה — {{name}}',
  'callParent.missedCount': '{{count}} היעדרויות רצופות',
  'callParent.missedCount.one': 'היעדרות אחת ברצף',
  'callParent.alert':
    'החניך/ה נעדר/ה משלושה אימונים ברצף. מומלץ ליצור קשר חם עם ההורים ולבדוק מה קורה.',
  'callParent.action': 'יצירת קשר',
  'callParent.message':
    'שלום, שמנו לב ש{{name}} לא הגיע/ה לכמה אימונים ברצף. רצינו לוודא שהכול בסדר ולשמוע מכם.',
  'callParent.tick': 'סימון כטופל',

  // -- להביא לאימון (2026-09-07). A sixth kind. The parent app promises a family that a
  // coach hands their order over at the start of training; nothing told the coach, and
  // the sheet they eventually opened raised a SECOND charge for it. Derived from the
  // lesson's own waiting orders, like every other row here, and gone once handed over.
  'bringItem.scope': 'חנות המועדון',
  'bringItem.badge': 'להביא',
  'bringItem.title': '{{name}} — {{item}}',
  'bringItem.subtitle': 'הוזמן ושולם, ממתין למסירה',
  'bringItem.alert': 'המשפחה הזמינה את הפריט בחנות המועדון ושילמה עליו. יש להביא אותו לאימון ולמסור — המסירה אינה יוצרת חיוב חדש.',
  'bringItem.action': 'פתיחת מסירה',
  'cash.scope': 'ניהול כספים',
  'cash.badge': 'ממתין לאישור',
  'cash.title': 'תשלומים במזומן ממתינים לאישור',
  'cash.count': '{{count}} תשלומים ממתינים',
  'cash.count.one': 'תשלום אחד ממתין',
  'cash.alert':
    'התקבלו הבטחות תשלום במזומן או בצ׳ק שטרם אושרו. יש לעבור על הרשימה ולאשר או לדחות כל אחת.',
  'cash.action': 'לרשימת התשלומים',

  'healthReview.scope': 'אישור מנהל',
  'healthReview.badge': 'ממתין לבדיקה',
  'healthReview.action': 'פתח כרטיס חניך',

  // The birthday section (2026-09-06 — decision reversed, see `deriveBirthdays.ts`'s own
  // header for why). Not a task kind: no badge/scope pair above, its own small vocabulary
  // instead.
  'birthday.sectionTitle': 'חוגגים יום הולדת השבוע',
  'birthday.sectionHint': 'תזכורת לחזק את הקשר האישי ולברך על המזרן',
  'birthday.countBadge': '{{count}} חניכים',
  'birthday.countBadge.one': 'חניך אחד',
  'birthday.noGroup': 'ללא קבוצה',
  'birthday.turningAge': 'חוגג/ת {{age}}',
  'birthday.today': 'היום!',
  'birthday.inDays': 'בעוד {{count}} ימים',
  'birthday.inDays.one': 'מחר',
  'birthday.greetAction': 'ברך בוואטסאפ',
  'birthday.greetAgain': 'ברך שוב',
  // Never "נשלח"/"sent" — §4.9's rule 2 (`ContactFamiliesButton`'s own header): opening
  // WhatsApp is not proof anything was sent. This is an honest, smaller claim: the coach
  // marked THIS as done, not that a message reached anyone.
  'birthday.tickLabel': 'סמן שבירכת את {{name}}',
  'birthday.tickLabelUndo': 'בטל סימון ברכה ל{{name}}',
  'birthday.greetedHint': 'סימנת שבירכת',
  'birthday.greetingMessage':
    'היי {{name}} היקר/ה! מזל טוב ליום הולדתך ה־{{age}}! מאחלים לך שנה מצוינת של איפונים, התמדה ובריאות על המזרן. גאים בך!',
}
