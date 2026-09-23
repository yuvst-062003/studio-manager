// What the payment frame shows once the order has actually resolved.
//
// **Why there is anything here at all.** Until 2026-09-11 the frame closed the instant the
// order stopped being `pending` — silent for a success, and actively wrong for an
// `amount_mismatch`, where real money arrived at the wrong amount, a manager has been
// alerted and the charges are NOT settled. The parent was told nothing and shown nothing.
// The frame is the only moment they are looking.
//
// **A success is a MOMENT, not a screen.** Full-bleed, carrying the club's own ground, and
// it leaves on its own after `SETTLED_CLOSE_MS`. No button, because there is nothing to
// decide — the payment happened. That is how Apple Pay, bit and the banking apps treat this
// instant. The design came back from Stitch as a screen with actions and a receipt link;
// the owner corrected it to a two-to-three second moment, and the receipt link is
// impossible anyway (checkpoint 19 — uPay issues a קבלה and never tells us where it is).
//
// **The payment is shown, then said** (2026-09-17). What used to be the club crest under a
// ripple is now `PayingScene`: a card terminal, the club card sliding onto its reader, a
// check on the terminal's screen — and only then the words. The owner brought a reference
// clip of a card-ordering app and asked for that beat; it turns "שולם" from a label into
// the end of something the parent watched happen. The moment grew by about a second to
// make room, and stayed a moment.
//
// **Everything that is NOT a success stays put.** A mismatch, a decline and an expiry each
// have to be read, so those keep a card, an explanation and a button somebody presses. A
// failure that vanished after two seconds would be worse than the silence this replaced.
//
// **The copy is not new.** `billing.order.*` was written for `PaymentCompleteScreen`, the
// return page a bit payer never reaches. The same outcomes get the same sentences, so a
// family meets one product rather than two vocabularies for one event.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card } from '@studio/ui'
import { fill, formatAgorot } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PaymentOrderOut } from './billingClient'
import { PayingScene, SCENE_TOTAL_MS } from './PayingScene'
import type { SettledFor } from './redesign/pay'

/** Entry, hold, exit — the whole moment, three and two-thirds seconds end to end. The entry
 *  is the scene's three beats plus the words rising after them; the hold is long enough to
 *  read one word, one number and one line; and the whole is still short enough that nobody
 *  reaches for a control that is not there. Exported so the overlay and the tests agree on
 *  one set of numbers. */
export const SETTLED_ENTER_MS = SCENE_TOTAL_MS + 50
export const SETTLED_HOLD_MS = 1800
export const SETTLED_EXIT_MS = 400
export const SETTLED_CLOSE_MS = SETTLED_ENTER_MS + SETTLED_HOLD_MS + SETTLED_EXIT_MS

/** Reduced motion is a system setting, and this is the only thing on screen while it runs —
 *  so honouring it means no ripple, no draw and no spring, not shorter ones. The moment
 *  still ends on its own; what goes is the movement, never the information. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // jsdom with no matchMedia stub, and any browser that refuses the query.
    return false
  }
}

export type PaymentSettledProps = {
  locale: Locale
  order: PaymentOrderOut
  /** What the payment actually settled. Optional because not every route that opens a
   *  checkout knows it — the shop and the join wizard hold different shapes — and a
   *  moment without the line is still correct, just terser. Built by
   *  `settledFor`; the sentence is assembled here because the kind needs `t`. */
  settled?: SettledFor | null
  /** Ends the moment. Fires on its own for a success; for every other outcome it is the
   *  button, because those have to be read before they go. */
  onDismiss: () => void
}

export function PaymentSettled({ locale, order, settled, onDismiss }: PaymentSettledProps) {
  const paid = order.status === 'paid'
  //: A lazy `useState` initialiser, not a ref: this value is read during render to choose
  //: the transitions, and a ref read in render is both a lint error and a real hazard.
  const [still] = useState(prefersReducedMotion)
  //: Reduced motion starts already arrived rather than arriving instantly — there is then
  //: no state change to schedule at all, so the first paint is the final one.
  const [entered, setEntered] = useState(still)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (still) return undefined
    // One frame later, so each transition has a starting value to move away from.
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [still])

  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!paid) return undefined
    // Two timers rather than one: the moment fades before it is unmounted, so the frame
    // does not blink out from under a parent mid-read.
    const fade = setTimeout(() => setLeaving(true), SETTLED_ENTER_MS + SETTLED_HOLD_MS)
    const gone = setTimeout(() => dismiss.current(), SETTLED_CLOSE_MS)
    return () => {
      clearTimeout(fade)
      clearTimeout(gone)
    }
  }, [paid])

  if (!paid) {
    return (
      <div style={restingStyle} data-testid="payment-settled" data-status={order.status}>
        {order.status === 'amount_mismatch' ? (
          // §5.10: a payment WAS recorded for the money that actually arrived, and the
          // charges were not settled. Saying "failed" here would be wrong in the direction
          // that costs the family a second payment for the same month.
          <Card>
            <Alert tone="danger" iconLabel={t(locale, 'billing.order.status.amount_mismatch')}>
              {t(locale, 'billing.order.mismatchAlert')}
            </Alert>
            <p>{t(locale, 'billing.order.mismatchHint')}</p>
          </Card>
        ) : (
          <Card>
            <Alert tone="danger" iconLabel={t(locale, `billing.order.status.${order.status}`)}>
              <span data-testid={`settled-${order.status}`}>
                {t(locale, `billing.order.status.${order.status}`)}
              </span>
            </Alert>
          </Card>
        )}
        <Button data-testid="payment-settled-dismiss" onClick={onDismiss} variant="primary">
          {t(locale, 'common.a11y.close')}
        </Button>
      </div>
    )
  }

  // The words wait for the scene: each delay is measured from the check landing, so the
  // first thing a parent reads is the outcome of what they just watched.
  const rise = (delay: number): CSSProperties => ({
    opacity: entered ? 1 : 0,
    transform: entered ? 'translateY(0)' : 'translateY(8px)',
    transition: still
      ? 'none'
      : `opacity 420ms var(--ease-standard) ${SCENE_TOTAL_MS + delay}ms, transform 420ms var(--ease-standard) ${SCENE_TOTAL_MS + delay}ms`,
  })

  return (
    <div
      style={momentStyle(leaving, still)}
      data-testid="payment-settled"
      data-status={order.status}
    >
      {/* Decorative in the strict sense — the chip below carries the meaning in words. */}
      <PayingScene entered={entered} still={still} />

      {/* The confirmation chip. A light `--paid-tint` ground with `--paid` text, which is
          the semantic pair the ledger already uses for a settled charge — and the only way
          to put green on this navy at a contrast ratio that passes. Never colour alone:
          the words are the status and the tick is beside them. */}
      <p data-testid="settled-paid" style={{ ...chipStyle, ...rise(60) }}>
        <svg aria-hidden="true" style={tickStyle} viewBox="0 0 20 20">
          <path
            d="M5 10.5 L8.5 14 L15 6.5"
            fill="none"
            stroke="var(--paid)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.4"
          />
        </svg>
        {t(locale, 'billing.order.paidConfirmed')}
      </p>

      <p style={{ ...headlineStyle, ...rise(140) }}>{t(locale, 'billing.order.status.paid')}</p>
      {/* One non-breaking unit, so the symbol and the number can never drift apart. */}
      <p style={{ ...amountStyle, ...rise(220) }}>
        <bdi>{formatAgorot(order.expected_amount_agorot)}</bdi>
      </p>
      {/* What the money was for. A parent shown only "שולם" and a number has been told the
          least useful half of what just happened (owner, 2026-09-11). */}
      {settled === null || settled === undefined ? null : (
        <p style={{ ...captionStyle, ...rise(300) }} data-testid="settled-for">
          {[
            settled.note ?? t(locale, `billing.charge.kind.${settled.kind}`),
            settled.students.join(', '),
            // One is its own sentence, not a plural with a 1 in it.
            settled.extra === 1
              ? t(locale, 'billing.order.andOneMoreCharge')
              : settled.extra > 1
                ? fill(t(locale, 'billing.order.andMoreCharges'), { count: settled.extra })
                : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}

const momentStyle = (leaving: boolean, still: boolean): CSSProperties => ({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-3)',
  // The club's ground, taken from the brand token rather than a hex: the same surface the
  // landing and the launch screen wear, so a re-skin moves all three together.
  background:
    'radial-gradient(115% 75% at 50% 34%, color-mix(in srgb, var(--brand-primary) 88%, #fff) 0%, var(--brand-primary) 45%, color-mix(in srgb, var(--brand-primary) 62%, #000) 100%)',
  color: 'var(--brand-on-primary)',
  textAlign: 'center',
  opacity: leaving ? 0 : 1,
  transition: still ? 'none' : `opacity ${SETTLED_EXIT_MS}ms var(--ease-standard)`,
})

const restingStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  alignItems: 'center',
  justifyContent: 'center',
  blockSize: '100%',
  textAlign: 'center',
}

const chipStyle: CSSProperties = {
  margin: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-circle)',
  background: 'var(--paid-tint)',
  color: 'var(--paid)',
  fontSize: 'var(--text-label)',
  fontWeight: 600,
}

const tickStyle: CSSProperties = { inlineSize: '1.15rem', blockSize: '1.15rem', flexShrink: 0 }

const captionStyle: CSSProperties = {
  margin: 0,
  marginBlockStart: 'var(--space-1)',
  maxInlineSize: '22rem',
  paddingInline: 'var(--space-4)',
  fontSize: 'var(--text-body)',
  // Quieter than the amount but still on a dark ground, so a mixed tint rather than a
  // secondary ink token — those are all written for the light surface.
  color: 'color-mix(in srgb, var(--brand-on-primary) 78%, transparent)',
}

const headlineStyle: CSSProperties = {
  margin: 0,
  marginBlockStart: 'var(--space-2)',
  fontSize: 'var(--text-display)',
  fontWeight: 700,
  letterSpacing: '0.01em',
}

const amountStyle: CSSProperties = {
  margin: 0,
  fontSize: 'calc(var(--text-display) * 1.9)',
  fontWeight: 800,
  lineHeight: 1.05,
  fontVariantNumeric: 'tabular-nums',
}
