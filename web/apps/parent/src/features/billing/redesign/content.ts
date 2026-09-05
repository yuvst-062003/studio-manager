// חנות המועדון's strings, pre-i18n and temporary — build-order step 6 moves them into
// `web/packages/i18n/he/billing.ts` and writes the en and ru mirrors.

export const SHOP = {
  title: 'חנות המועדון',
  subtitle: 'מזמינים באפליקציה, מקבלים ישירות מהמאמן באימון',
  standardBadge: 'ציוד תקני',

  /** The product grid. */
  choose: 'בחירה',
  /** The tile where the prototype puts a photograph. Named so a screen reader does not
   *  announce a decorative panel, and so the absence is legible rather than a broken image. */
  noPhoto: 'אין תמונה לפריט',
  deliveryNote: 'מסירה אישית ובטוחה ישירות מהמאמן בתחילת האימון לאחר וידוא מידה.',

  /** The customiser sheet. */
  customiseTitle: 'בחירת פריט ומאפיינים',
  sizeLegend: 'מידה',
  sizeRequired: 'יש לבחור מידה',
  quantityLabel: 'כמות',
  noteLabel: 'הערה למאמן (אופציונלי)',
  notePlaceholder: 'למשל: רקמת שם על הגי',
  addToCart: 'הוספה לסל',

  /** The basket. */
  cartBarItems: '{count} פריטים בסל',
  cartBarOneItem: 'פריט אחד בסל',
  cartOpen: 'לסל ותשלום',
  cartTitle: 'סל הקניות',
  cartEmpty: 'הסל ריק',
  cartRemove: 'הסרה',
  cartQuantity: 'כמות',
  cartTotal: 'סה״כ',
  checkout: 'שליחת ההזמנה',
  checkoutSending: 'שולח…',

  /** After the order. The club charges for it; nothing is paid here. */
  placedTitle: 'ההזמנה נשלחה למועדון',
  /** `{count}` lines, `{total}` already formatted. */
  placedBody: 'נוצרו {count} חיובים על סך {total}. המאמן יימסור את הפריטים באימון הקרוב.',
  placedPay: 'מעבר לתשלומים',
  placedClose: 'סגירה',
  checkoutFailed: 'ההזמנה לא נשלחה. נסו שוב.',

  /** The catalogue itself. */
  loading: 'טוען את החנות…',
  loadFailed: 'לא הצלחנו לטעון את החנות',
  retry: 'נסו שוב',
  empty: 'אין כרגע פריטים למכירה',
  emptyBody: 'כשהמועדון יוסיף ציוד, הוא יופיע כאן.',
  close: 'סגירה',
} as const

/** `{token}` replacement — one helper, so no component builds a sentence by concatenation. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  )
}
