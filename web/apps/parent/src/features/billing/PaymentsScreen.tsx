// Parent artboard `1b` — תשלומים · the pay screen.
//
// **D-M6-1: this is the payments tab; `12f` is the history reached from it.** `1b`'s finding
// 1 and `12f`'s finding 6 both record that the canvas does not decide, and both say deciding
// matters more than which way. A parent who taps תשלומים came to pay.
//
// **§5.10 — all three routes are always visible.** 'Nothing is ever hidden from the payments
// screen, and there is no persistent payment mode stored on a person.' The standing-order
// warning is a WARNING, never a block: a family who set up a mandate and then wants to clear
// a one-off must still have a route.
//
// **Money never mirrors.** Every amount goes through `MoneyDisplay`, which wraps it in
// `<bdi>`. `1b`'s RTL note is that the danger here is the FIX, not the bug: a `direction: ltr`
// wrapper or a transform would flip `1,280₪` to `₪1,280`.
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, BeltBar, Button, Card, EmptyState, MoneyDisplay, SegmentedControl } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { BillingClient, ChargeOut } from './billingClient'
import { instalmentSplit, oldestMonths, selectionTotal } from './billingClient'

//: §5.10's own chip groups: `[1] [2] [3] [6]` months, `[1] [2] [3]` instalments.
const MONTH_OPTIONS = [1, 2, 3, 6]
const INSTALMENT_OPTIONS = [1, 2, 3]

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
}

const totalRowStyle: CSSProperties = {
  ...rowStyle,
  justifyContent: 'space-between',
  borderBlockStart: '1px solid var(--border)',
  paddingBlockStart: 'var(--space-3)',
}

export type DebtRow = {
  charge: ChargeOut
  /** The child this month is for. Rendered beside the period; both are data, not copy. */
  studentName: string
  /** D7 — the accent bar IS a belt fill here, so it goes through `BeltBar`, which rings
   *  unconditionally. `1b`'s finding 4: the artboard draws these bars with no ring, and D7
   *  covers anywhere `belt_rank.color_hex` is rendered as a fill. */
  beltColorHex: string | null
  /** §5.10's primary double-payment guard: already covered by an open or paid order. */
  coveredElsewhere: boolean
}

export type PaymentsScreenProps = {
  locale: Locale
  client: BillingClient
  debts: readonly DebtRow[]
  hasActiveSubscription: boolean
  standingOrderLink: string | null
  cashInstructions: string | null
  onOrderOpened: (form: { action: string; fields: Record<string, string> }) => void
  onOpenHistory: () => void
}

export function PaymentsScreen({
  locale,
  client,
  debts,
  hasActiveSubscription,
  standingOrderLink,
  cashInstructions,
  onOrderOpened,
  onOpenHistory,
}: PaymentsScreenProps) {
  const [months, setMonths] = useState(2)
  const [instalments, setInstalments] = useState(1)
  const [inFlight, setInFlight] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only charges nothing else already covers are selectable. §5.10's guard 1, and the
  // reason a covered row still RENDERS: hiding it would leave a parent looking for a month
  // they can see they owe.
  const selectable = useMemo(() => debts.filter((row) => !row.coveredElsewhere), [debts])
  const chosen = useMemo(
    () => oldestMonths(selectable.map((row) => row.charge), months),
    [selectable, months],
  )
  const total = selectionTotal(chosen)
  const split = instalmentSplit(total, instalments)

  async function pay() {
    if (inFlight || chosen.length === 0) return
    setInFlight(true)
    setError(null)
    try {
      const order = await client.createOrder(chosen.map((charge) => charge.id), instalments)
      onOrderOpened(await client.orderForm(order.public_ref))
    } catch {
      setError(t(locale, 'common.error.generic'))
    } finally {
      setInFlight(false)
    }
  }

  if (debts.length === 0) {
    // `1b` finding 3 — not drawn, and it is the GOAL state. A family in good standing sees
    // this every month.
    return (
      <div style={columnStyle} data-testid="payments-screen">
        <EmptyState title={t(locale, 'billing.openDebts.empty')} />
        <Button variant="secondary" onClick={onOpenHistory}>
          {t(locale, 'billing.history.title')}
        </Button>
      </div>
    )
  }

  return (
    <div style={columnStyle} data-testid="payments-screen">
      <section aria-labelledby="open-debts">
        <h2 id="open-debts">{t(locale, 'billing.openDebts.title')}</h2>
        <Card>
          {debts.map((row) => (
            <div key={row.charge.id} style={rowStyle} data-testid="debt-row">
              {/* D7 — a belt fill always carries its ring. `BeltBar` has no prop that
                  turns it off and must not gain one. */}
              {/* `label` is required by the primitive, and that is G10 rather than
                  bookkeeping: colour is never the only carrier, so the belt has to be
                  readable by a screen reader too. */}
              <BeltBar
                colorHex={row.beltColorHex ?? 'var(--border)'}
                label={row.studentName}
              />
              <span>{periodLabel(row.charge)}</span>
              <span>{row.studentName}</span>
              <MoneyDisplay agorot={row.charge.amount_agorot} tone="debt" />
              {row.coveredElsewhere ? (
                <span data-testid="covered-elsewhere">
                  {t(locale, 'billing.card.coveredElsewhere')}
                </span>
              ) : null}
            </div>
          ))}
          <div style={totalRowStyle}>
            <span>{t(locale, 'billing.openDebts.total')}</span>
            <MoneyDisplay
              agorot={selectionTotal(debts.map((row) => row.charge))}
              tone="debt"
              label={t(locale, 'billing.openDebts.total')}
            />
          </div>
        </Card>
      </section>

      <h2>{t(locale, 'billing.howToPay.title')}</h2>

      {/* -- כרטיס אשראי ------------------------------------------------------ */}
      <Card>
        <div data-testid="route-card">
          <h3>{t(locale, 'billing.method.card')}</h3>
          {/* `1b` finding 5: the key exists and the artboard never says the rule. The
              selection IS oldest-first across every child, so the screen says so. */}
          <p>{t(locale, 'billing.card.oldestFirst')}</p>
          {hasActiveSubscription ? (
            // §5.10's second guard. A WARNING, never a block — the parent decides.
            <Alert tone="danger" iconLabel={t(locale, 'billing.method.standingOrder')}>
              {t(locale, 'billing.standingOrder.activeWarning')}
            </Alert>
          ) : null}
          {selectable.length === 0 ? (
            <p data-testid="nothing-selectable">
              {t(locale, 'billing.card.nothingSelectable')}
            </p>
          ) : (
            <>
              <div data-max={String(selectable.length)} data-testid="months-control">
                <SegmentedControl
                  legend={t(locale, 'billing.card.selectMonths')}
                  value={String(months)}
                  options={MONTH_OPTIONS.filter((n) => n <= selectable.length).map((n) => ({
                    value: String(n),
                    label: String(n),
                  }))}
                  onValueChange={(value) => setMonths(Number(value))}
                />
              </div>
              <div data-testid="instalments-control">
                <SegmentedControl
                  legend={t(locale, 'billing.card.installments')}
                  value={String(instalments)}
                  options={INSTALMENT_OPTIONS.map((n) => ({
                    value: String(n),
                    label: String(n),
                  }))}
                  onValueChange={(value) => setInstalments(Number(value))}
                />
              </div>
              <div style={totalRowStyle}>
                <span>{t(locale, 'billing.card.total')}</span>
                <MoneyDisplay agorot={total} tone="debt" />
              </div>
              <p data-testid="instalment-split">{splitLabel(locale, split)}</p>
              <Button
                variant="primary"
                data-testid="pay-button"
                disabled={inFlight}
                onClick={pay}
              >
                {t(locale, 'billing.card.pay')}
              </Button>
            </>
          )}
          {error ? (
            <Alert tone="danger" live iconLabel={t(locale, 'billing.card.pay')}>
              {error}
            </Alert>
          ) : null}
        </div>
      </Card>

      {/* -- הוראת קבע -------------------------------------------------------- */}
      <Card>
        <div data-testid="route-standing-order">
          <h3>{t(locale, 'billing.method.standingOrder')}</h3>
          {standingOrderLink ? (
            <a href={standingOrderLink} data-testid="standing-order-link">
              {t(locale, 'billing.standingOrder.link')}
            </a>
          ) : null}
          <p>{t(locale, 'billing.standingOrder.instructions')}</p>
          {/* G8 on the screen: the app cannot confirm these, so the charges stay open
              until a manager reconciles them. Saying so is what stops a parent thinking
              the payment failed. */}
          <p>{t(locale, 'billing.standingOrder.notConfirmable')}</p>
        </div>
      </Card>

      {/* -- מזומן ------------------------------------------------------------ */}
      <Card>
        <div data-testid="route-cash">
          <h3>{t(locale, 'billing.method.cash')}</h3>
          <p>{cashInstructions ?? t(locale, 'billing.cash.instructions')}</p>
        </div>
      </Card>
    </div>
  )
}

/** `2026-09` from the charge's own period. Data, not copy — `1b`'s strings table says the
 *  period half has no key. */
function periodLabel(charge: ChargeOut): string {
  if (charge.period_year == null || charge.period_month == null) return ''
  return `${String(charge.period_month).padStart(2, '0')}/${charge.period_year}`
}

/** `1b` finding 6 — two shapes with two plural rules, which is why both keys exist. */
function splitLabel(locale: Locale, split: { first: number; rest: number; count: number }): string {
  if (split.count === 1) return t(locale, 'billing.card.splitSingle')
  return t(locale, 'billing.card.splitEqual').replace('{{count}}', String(split.count))
}
