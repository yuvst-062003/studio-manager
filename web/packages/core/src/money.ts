/**
 * G2 / SPEC §8.3 — money is **always** an integer count of agorot. Never a float.
 *
 * **Nothing in this module ever produces a float.** Not `parseFloat`, not `* 100`, not
 * `/ 100`, not `toFixed`. That is not stylistic caution: `parseFloat('8.11') * 100` is
 * `810.9999999999999`, which truncates to 810 — one agora short on a real price. The float
 * route is right by luck for most values and wrong for a whole family of them, and the
 * ones it gets wrong are ordinary shekel-and-agora prices.
 *
 * So parsing splits the string on the decimal point and does integer arithmetic on the two
 * halves, and formatting uses `divmod` rather than division. The backend does exactly the
 * same thing in `app/integrations/upay/form.py` and `ipn.py`, for the same reason.
 *
 * The rendered symbol is `₪` suffixed rather than `Intl.NumberFormat('he-IL', {currency})`,
 * which produces `‏320.00 ₪` with a directional mark and a forced decimal. §5.10's screens
 * show `320₪` and `1,280₪`, and every charge in this product is whole shekels.
 */

/** No call site writes `100`. */
export const AGOROT_PER_SHEKEL = 100

const SHEKEL_SIGN = '₪'

export class MoneyFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyFormatError'
  }
}

/** Thousands separators, for the `1,280₪` in §5.10's total row. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Agorot → the string a screen shows.
 *
 * Whole shekels render with no decimal part (`32000 → '320₪'`) because that is what
 * §5.10's payments screen shows and it is the overwhelmingly common case. An amount
 * carrying agorot renders both digits (`32050 → '320.50₪'`).
 *
 * Throws on a non-integer rather than rounding. A float arriving here means money was
 * computed as a float somewhere upstream; rounding would hide that bug at the exact place
 * best positioned to reveal it.
 */
export function formatAgorot(agorot: number): string {
  if (!Number.isInteger(agorot)) {
    throw new MoneyFormatError(
      `formatAgorot(${agorot}): money is an integer count of agorot (G2). ` +
        'A non-integer here means a float was used somewhere upstream.',
    )
  }

  const negative = agorot < 0
  const absolute = Math.abs(agorot)
  // divmod, not `/ 100` — see the module docstring.
  const whole = Math.trunc(absolute / AGOROT_PER_SHEKEL)
  const remainder = absolute % AGOROT_PER_SHEKEL

  const body =
    remainder === 0
      ? groupThousands(String(whole))
      : `${groupThousands(String(whole))}.${String(remainder).padStart(2, '0')}`

  return `${negative ? '-' : ''}${body}${SHEKEL_SIGN}`
}

/**
 * A shekel string → agorot, exactly.
 *
 * Accepts every rendering of the same money: `'1'`, `'1.0'` and `'1.00'` are all one
 * shekel. That matters beyond tidiness — uPay's inbound IPN sends `amount=1` for a ₪1
 * payment while our own outbound form sends `1.00` (upay-integration.md, round two). A
 * parser that treated those as different amounts would flag every correct whole-shekel
 * payment as tampering, and §5.10 escalates that to a manager as suspected fraud.
 *
 * Tolerates the thousands separator and the ₪ sign so a value can be round-tripped
 * through `formatAgorot`, and so a manager pasting `1,280₪` into a field is understood.
 *
 * Throws rather than returning `0` or `NaN`. Returning `0` for unparseable text would
 * silently record a free month.
 */
export function parseShekels(text: string): number {
  const cleaned = text.trim().replace(/[,\s₪]/g, '')
  if (cleaned === '') {
    throw new MoneyFormatError('parseShekels(""): empty amount')
  }

  const match = /^(-|\+)?(\d+)(?:\.(\d+))?$/.exec(cleaned)
  if (!match) {
    throw new MoneyFormatError(
      `parseShekels(${JSON.stringify(text)}): not a decimal amount`,
    )
  }

  const [, sign, whole, fraction = ''] = match
  if (fraction.length > 2) {
    throw new MoneyFormatError(
      `parseShekels(${JSON.stringify(text)}): more precision than an agora. ` +
        'There is no half-agora, and rounding it away would make the ledger disagree ' +
        'with what the parent was shown.',
    )
  }

  // Integer arithmetic on the two halves. No float is constructed at any point.
  const agorot = Number(whole) * AGOROT_PER_SHEKEL + Number(fraction.padEnd(2, '0') || '0')
  return sign === '-' ? -agorot : agorot
}

/**
 * The LENIENT shekels → agorot parse, for form inputs (moved home from the dashboard's
 * billing lane, 2026-08-30 — its header said this was owed back to core).
 *
 * `parseShekels` above THROWS, which is right for wire data and wrong for a half-typed
 * box: a manager mid-keystroke is not an error. This one answers 0 for anything unusable
 * and accepts a decimal comma. `Math.round` on the product, not on the input: 3.2 * 100
 * is 320.00000000000006 in binary floating point, and truncating it would charge a
 * family one agora less.
 */
export function agorotFromShekels(input: string | number): number {
  const value = typeof input === 'number' ? input : Number(input.trim().replace(',', '.'))
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}
