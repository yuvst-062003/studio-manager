// פרופיל's strings, pre-i18n and temporary — build-order step 6 moves them into
// `web/packages/i18n/he/people.ts` (and `billing.ts` for the money block) and writes the en
// and ru mirrors.

export const PROFILE = {
  /** Header. The club's name is the studio's, never a constant, and there is no season
   *  line: the API has no training-year label and the greeting will not invent one. */
  familyTitle: 'משפחת {name}',
  familyTitleUnknown: 'הפרופיל שלי',
  familySubtitle: 'הגדרות, תשלומים והמתאמנים שלכם',

  /** Personal details — the guardian's own record. Not in the prototype at all: that
   *  design shows a family's children and never the parent. Owner review, 2026-09-06. */
  personalTitle: 'פרטים אישיים',
  personalEdit: 'עריכה',
  personalName: 'שם',
  personalFirstName: 'שם פרטי',
  personalLastName: 'שם משפחה',
  personalEmail: 'דוא״ל',
  personalPhone: 'טלפון',
  personalNotSet: 'לא הוזן',
  personalSheetTitle: 'עריכת פרטים אישיים',
  personalSave: 'שמירה',
  personalSaving: 'שומר…',
  personalCancel: 'ביטול',
  personalSaveFailed: 'השמירה נכשלה. נסו שוב.',

  /** App preferences. */
  preferencesTitle: 'שפה ותצוגה',
  languageLabel: 'שפת האפליקציה',
  themeLabel: 'מצב תצוגה',
  themeLight: 'בהיר',
  themeDark: 'כהה',
  themeAuto: 'אוטומטי',

  /** Contact. */
  contactCta: 'יצירת קשר עם המועדון',
  contactSub: 'ווטסאפ, טלפון או דוא״ל',
  contactTitle: 'יצירת קשר',
  contactWhatsApp: 'ווטסאפ',
  contactCall: 'שיחה',
  contactEmail: 'דוא״ל',
  /** Nothing to contact them WITH — no phone and no email on file. */
  contactNone: 'המועדון עדיין לא הגדיר פרטי יצירת קשר',
  close: 'סגירה',

  /** Billing — §4's "money moves into Profile". */
  billingTitle: 'תשלומים',
  balanceOwed: 'יתרה לתשלום',
  balanceSettled: 'אין יתרה פתוחה ✓',
  /** `{count}` open charges behind the balance. */
  openCharges: '{count} חיובים פתוחים',
  openChargeOne: 'חיוב פתוח אחד',
  chargedTotal: 'סך החיובים',
  paidTotal: 'שולם',
  payNow: 'לתשלום',
  paymentMethod: 'אמצעי תשלום',
  paymentMethodNone: 'לא הוגדר',
  paymentMethodUpdate: 'עדכון',
  /** Said out loud, because the prototype's own modal asks for card digits and this one
   *  cannot: the card form is uPay's, on uPay's origin. */
  paymentMethodHint: 'פרטי האשראי נמסרים בעמוד המאובטח של חברת הסליקה — האפליקציה לא רואה אותם ולא שומרת אותם.',
  paymentHistory: 'היסטוריית תשלומים',

  /** Attendance summary. */
  attendanceTitle: 'סיכום נוכחות',
  attendanceSub: '30 הימים האחרונים',
  /** `{attended}` of `{marked}` marked sessions. */
  attendanceCount: '{attended} מתוך {marked} אימונים',
  attendanceNone: 'עדיין אין נוכחות רשומה',
  /** Why the denominator is what it is. An unmarked register is not an absence. */
  attendanceHint: 'הנתון מחושב מתוך אימונים שסומנו בלבד.',

  /** Purchases. */
  purchasesTitle: 'היסטוריית רכישות',
  purchasesEmpty: 'עדיין לא נרכשו פריטים',
  purchasesAll: 'לכל התשלומים',

  /** Trainee cards. */
  traineesTitle: 'המתאמנים שלי',
  traineesSub: 'לחיצה על מתאמן פותחת את הכרטיס המלא',
  traineeCard: 'כרטיס מתאמן',
  attendanceLabel: 'נוכחות',
  beltUnset: 'טרם נקבעה חגורה',
  needsDeclaration: 'חסרה הצהרת בריאות',
  addChild: 'הוספת מתאמן',

  /** The dojo. */
  dojoTitle: 'הדוג׳ו',
  dojoNoAddress: 'המועדון לא הגדיר כתובת',
  directions: 'הוראות הגעה',

  /** Quick links. */
  linksTitle: 'עוד',
  privacy: 'פרטיות והנתונים שלי',
  calendarFeed: 'סנכרון יומן',

  /** States. */
  loading: 'טוען…',
  loadFailed: 'לא הצלחנו לטעון את הפרופיל',
  retry: 'נסו שוב',
} as const

/** `{token}` replacement — one helper, so no component builds a sentence by concatenation. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  )
}
