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
}
