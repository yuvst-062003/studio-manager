// The shapes פרופיל's ported components take.
//
// This is the tab §4 moved the MONEY into — "balance, payment method, history" — on top of
// what it already held. Every section below has a real read behind it:
//
//   preferences      ThemeProvider + LOCALES, already in the app
//   contact          GET /me/studio            name, address, phone
//   billing          GET /me/balance           + GET /me/payment-promises for the method
//   attendance       GET /me/attendance        one row per (session, student), with status
//   purchases        GET /me/charges           the `manual` ones — a shop order becomes these
//   trainee cards    GET /me/students          belt, attendance %, health status
//   dojo branch      GET /me/studio            the same read as contact
//
// THREE THINGS THE PROTOTYPE DOES THAT THIS MUST NOT.
//
//  1. IT COLLECTS CARD DETAILS. Its "update payment method" modal has card number, expiry,
//     CVV and a national id, behind a reassuring padlock. This product never sees a card:
//     uPay hosts the form, and §5.10's whole payment path exists so those digits never
//     reach our origin. The row is kept and it opens the real payment setup.
//  2. IT PRINTS A NATIONAL ID on a child's card. The wizard's own port removed the same
//     thing. A ת.ז. is not an identifier a parent needs on a summary card.
//  3. IT INVENTS A SEASON ("עונת תשפ״ה"). There is no training-year label in the API; the
//     header renders the family and nothing else, as בית's does.

/** One child, as the trainee cards and the attendance selector need them. */
export type ProfileChild = {
  id: string
  firstName: string
  /** Kept as its own field, not split back out of `displayName` — a two-part surname
   *  ("בן ארי") makes that split wrong, and the header's household test depends on it. */
  lastName: string
  displayName: string
  /** `current_belt_name` — `null` before a first grading. */
  beltName: string | null
  /** `current_belt_color_hex` — `null` before a first belt, drawn as absent. */
  beltColorHex: string | null
  groupNames: readonly string[]
  /** The server's own `attendance_percent`, or `null` when it has not computed one. */
  attendancePercent: number | null
  /** Does this child still owe the club a declaration? Computed with the SAME predicate
   *  §6.1's gate uses — two spellings of it is how a card disagrees with the gate. */
  needsDeclaration: boolean
}

/** What the family owes, and how they pay. */
export type ProfileBilling = {
  /** Outstanding, in integer agorot. `0` is settled; never a float. */
  balanceAgorot: number
  chargedAgorot: number
  paidAgorot: number
  openChargeCount: number
  /** The method already resolved to a label by the caller, or `null` when none is on file. */
  methodLabel: string | null
}

/** One month of attendance for one child. */
export type AttendanceSummary = {
  studentId: string
  attended: number
  /** Every session that has been marked, attended or not. The percentage's denominator —
   *  an UNMARKED session is not an absence and must never be counted as one. */
  marked: number
  percent: number
}

/** A shop order, as `/me/charges` returns it. */
export type PurchaseRow = {
  id: string
  label: string
  amountAgorot: number
  /** `YYYY-MM-DD`. */
  dueDate: string
  status: string
}

/** The club's own details — one read, two sections. */
export type ClubDetails = {
  name: string
  address: string | null
  phone: string | null
}
