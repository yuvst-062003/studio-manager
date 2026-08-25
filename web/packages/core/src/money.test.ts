import { describe, expect, it } from 'vitest'
import { AGOROT_PER_SHEKEL, formatAgorot, parseShekels } from './money'

/**
 * G2 / SPEC §8.3 — "Money is **always** an integer count of agorot. Never a float."
 *
 * The backend has an invariant test and a lint rule enforcing this on columns. This is the
 * client half, and it is the half that actually gets it wrong: a column cannot accidentally
 * become a float, but `parseFloat('0.29') * 100` is `28.999999999999996` and every
 * developer writes that line at least once.
 */
describe('formatAgorot', () => {
  it('renders whole shekels with no decimal part', () => {
    // §5.10's screen shows 320₪, not 320.00₪. Every charge in this product is whole
    // shekels, so the decimal case is the exception and must not be the default.
    expect(formatAgorot(32000)).toBe('320₪')
  })

  it('renders agorot when there are any', () => {
    expect(formatAgorot(32050)).toBe('320.50₪')
    expect(formatAgorot(29)).toBe('0.29₪')
  })

  it('groups thousands, because §5.10 shows a 1,280₪ total', () => {
    expect(formatAgorot(128000)).toBe('1,280₪')
  })

  it('renders zero rather than an empty string', () => {
    expect(formatAgorot(0)).toBe('0₪')
  })

  it('renders a negative amount, because a credit adjustment is a negative charge', () => {
    // §5.10 — "Managers can also add a `manual` charge … **negative for a credit or
    // discount**". A formatter that could not render one would force a call site to
    // special-case the sign, which is where a lost minus sign comes from.
    expect(formatAgorot(-32000)).toBe('-320₪')
    expect(formatAgorot(-29)).toBe('-0.29₪')
  })

  it('refuses a non-integer rather than rounding it', () => {
    // A float reaching this function means money was computed as a float somewhere
    // upstream. Rounding here would hide that; throwing surfaces it at the call site
    // that introduced it.
    expect(() => formatAgorot(320.5)).toThrow(/integer/i)
    expect(() => formatAgorot(Number.NaN)).toThrow(/integer/i)
  })
})

describe('parseShekels', () => {
  it('parses whole shekels to agorot', () => {
    expect(parseShekels('320')).toBe(32000)
  })

  it('parses a decimal amount to an exact integer', () => {
    expect(parseShekels('320.50')).toBe(32050)
  })

  /**
   * **The test this module exists for.**
   *
   * `Math.round(parseFloat('0.29') * 100)` happens to give 29, but the float route is
   * wrong for a whole family of values and right by luck for the rest. `8.11` is the
   * classic: `parseFloat('8.11') * 100` is `810.9999999999999`, which truncates to 810 —
   * one agora short, on a real price. So the implementation must never touch a float, and
   * this test names the values that prove it.
   */
  it('is exact for the values a float would get wrong', () => {
    expect(parseShekels('8.11')).toBe(811)
    expect(parseShekels('0.29')).toBe(29)
    expect(parseShekels('4.35')).toBe(435)
  })

  it('accepts every rendering of the same money', () => {
    // uPay's inbound amount is "1" for a ₪1 payment while our own form sends "1.00"
    // (upay-integration.md round two). Both are one shekel and both must parse the same,
    // or a correct payment is flagged as tampering.
    expect(parseShekels('1')).toBe(100)
    expect(parseShekels('1.0')).toBe(100)
    expect(parseShekels('1.00')).toBe(100)
  })

  it('parses a negative amount', () => {
    expect(parseShekels('-320.50')).toBe(-32050)
  })

  it('tolerates the separators a human types', () => {
    expect(parseShekels(' 1,280 ')).toBe(128000)
    expect(parseShekels('320₪')).toBe(32000)
  })

  it('rejects text rather than returning zero', () => {
    // Returning 0 for 'abc' would silently record a free month.
    expect(() => parseShekels('abc')).toThrow()
    expect(() => parseShekels('')).toThrow()
  })

  it('rejects more precision than an agora', () => {
    // There is no half-agora. Rounding it away here would make the ledger disagree with
    // what the parent was shown.
    expect(() => parseShekels('1.005')).toThrow(/agor/i)
  })

  it('round-trips with formatAgorot', () => {
    for (const agorot of [0, 29, 100, 32000, 32050, 128000, -32000]) {
      expect(parseShekels(formatAgorot(agorot))).toBe(agorot)
    }
  })
})

describe('AGOROT_PER_SHEKEL', () => {
  it('is 100 and is exported, so no call site writes the literal', () => {
    expect(AGOROT_PER_SHEKEL).toBe(100)
  })
})
