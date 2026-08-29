// Parent artboard `12f` — תשלומים · payment history. **D9.3, both halves.**
//
// D9.3 does two things: retitle the screen from `קבלות ותשלומים` to `תשלומים`, and scope the
// email affordance to card rows only — because §5.10 has uPay issue a חשבונית/קבלה for CARD
// payments only, and the system issues no tax document for cash, bank transfer or הוראת קבע.
//
// The retitle was applied on the artboard; **the structural half was not.** `שליחה למייל` was
// a single global footer button, under a disclaimer saying only card payments have a receipt.
// That is the same false promise D9.3 removed from the title, moved down the screen. Here the
// affordance is per row and gated on the method, which is what `billing.receipt.email` — a
// SINGULAR key, *a* receipt on *a* row — already encoded.
//
// **D-M6-3: the filters are `charge.kind`, not a second taxonomy.** `12f` finding 3.
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, MoneyDisplay, SegmentedControl } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { ChargeOut, PaymentOut } from './billingClient'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
}

const headerStyle: CSSProperties = {
  alignItems: 'baseline',
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'space-between',
}

//: The method and the date stack: the method is what a parent scans for, the date qualifies it.
const methodStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
}

const dateStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
}

//: D-M6-3 — one axis, one enum. `all` plus the three kinds a parent ever sees; `registration`
//: is folded into `manual` on this screen because a family sees one joining fee, once, and a
//: filter chip for it would be a chip that is empty eleven months of the year.
const FILTERS = ['all', 'tuition', 'manual', 'event'] as const
type Filter = (typeof FILTERS)[number]

export type PaymentHistoryScreenProps = {
  locale: Locale
  payments: readonly PaymentOut[]
  openCharges: readonly ChargeOut[]
  paidThisYearAgorot: number
  openBalanceAgorot: number
  /**
   * Optional because no provider-side resend exists yet: we hold only the uPay form
   * and its IPN, and the receipt lives in uPay's dashboard (upay-integration.md).
   * When absent the affordance is withheld — a button that pretends to email is the
   * inert-control defect this product keeps having to remove.
   */
  onEmailReceipt?: (paymentId: string) => void
  onPay: () => void
}

export function PaymentHistoryScreen({
  locale,
  payments,
  openCharges,
  paidThisYearAgorot,
  openBalanceAgorot,
  onEmailReceipt,
  onPay,
}: PaymentHistoryScreenProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = useMemo(() => payments.filter((row) => matches(row, filter)), [payments, filter])

  return (
    <div style={columnStyle} data-testid="payment-history">
      {/* A heading and a way back. This screen had neither: it opened on a summary card,
          with the תשלומים tab still lit, and nothing saying it was a sub-screen or how to
          leave it. Its one title string was being spent on a visually hidden legend. */}
      <div style={headerStyle}>
        <h2 style={{ margin: 0 }}>{t(locale, 'billing.history.title')}</h2>
        <a data-testid="history-back" href="#/payments">
          {t(locale, 'billing.history.back')}
        </a>
      </div>
      <Card>
        <div style={rowStyle}>
          <span>{t(locale, 'billing.history.paidThisYear')}</span>
          <MoneyDisplay agorot={paidThisYearAgorot} tone="paid" />
        </div>
        <div style={rowStyle}>
          <span>{t(locale, 'billing.history.openBalance')}</span>
          {/* Negative is a family in CREDIT, and `MoneyDisplay` wraps it in `<bdi>` so the
              minus cannot jump to the far end of a right-to-left row and read as a debt. */}
          <MoneyDisplay agorot={openBalanceAgorot} tone={openBalanceAgorot > 0 ? 'debt' : 'paid'} />
        </div>
      </Card>

      <div data-testid="history-filters">
        <SegmentedControl
          legend={t(locale, 'billing.history.filterLegend')}
          legendVisible
          value={filter}
          options={FILTERS.map((value) => ({ value, label: filterLabel(locale, value) }))}
          onValueChange={(next) => setFilter(next as Filter)}
        />
      </div>

      {visible.length === 0 ? (
        // 12f finding 4 — not drawn, and a family in their first month sees it every time.
        <EmptyState title={t(locale, 'billing.history.empty')} />
      ) : (
        <Card>
          {visible.map((payment) => (
            <div key={payment.id} style={rowStyle} data-testid="payment-row">
              <span style={methodStyle}>
                <span>{t(locale, `billing.method.${methodKey(payment.method)}`)}</span>
                {/* A history of amounts with no dates is not a history. `received_at` was on
                    the wire the whole time; the row simply never rendered it. G3 — stored
                    UTC, shown in the studio's zone. */}
                <span data-testid="payment-date" style={dateStyle}>
                  {formatDateInStudioZone(payment.received_at, locale)}
                </span>
              </span>
              <MoneyDisplay agorot={payment.amount_agorot} tone="paid" />
              {/* ▲ D9.3's structural half. Card rows only, because those are the only
                  payments uPay issues a document for. */}
              {payment.method === 'upay_card' && onEmailReceipt ? (
                <Button
                  variant="secondary"
                  data-testid="email-receipt"
                  onClick={() => onEmailReceipt(payment.id)}
                >
                  {t(locale, 'billing.receipt.email')}
                </Button>
              ) : null}
            </div>
          ))}
        </Card>
      )}

      {/* The disclaimer keeps only what is TRUE: a receipt is issued for card payments. The
          artboard's second half — 'and can be emailed' — is what turned a scoping statement
          into a global promise. */}
      <p data-testid="receipt-scope">{t(locale, 'billing.receipt.cardOnly')}</p>

      {openCharges.length > 0 ? (
        <Button variant="primary" data-testid="pay-from-history" onClick={onPay}>
          {t(locale, 'billing.card.pay')}
        </Button>
      ) : null}
    </div>
  )
}

function matches(payment: PaymentOut, filter: Filter): boolean {
  if (filter === 'all') return true
  // A payment has a method, not a kind; its kind is the kind of the charges it settled, which
  // `PaymentAllocationOut.kind` now carries. This used to read
  // `allocations.length > 0 && filter === 'tuition'` — a constant wearing a predicate's
  // clothes: שכר לימוד matched every allocated payment whatever it had settled, and חיוב ידני
  // and אירוע matched nothing at all, so two of the four chips were dead controls.
  //
  // An unallocated payment still shows only under `all`, which is honest — it is precisely a
  // payment nobody has decided the meaning of yet. `registration` folds into `manual` for the
  // reason FILTERS gives above.
  return (payment.allocations ?? []).some((allocation) =>
    filter === 'manual'
      ? allocation.kind === 'manual' || allocation.kind === 'registration'
      : allocation.kind === filter,
  )
}

function filterLabel(locale: Locale, filter: Filter): string {
  if (filter === 'all') return t(locale, 'billing.filter.all')
  return t(locale, `billing.charge.kind.${filter}`)
}

/**
 * A payment method to the i18n key that names it. The final arm is `cash` rather than a
 * throw, which is why every method has to be listed here explicitly: an unlisted one
 * renders as מזומן and says nothing about how it actually arrived, which is exactly the
 * fact §10 added `cheque` to stop losing.
 */
function methodKey(method: PaymentOut['method']): string {
  return method === 'upay_card'
    ? 'card'
    : method === 'standing_order'
      ? 'standingOrder'
      : method === 'bank_transfer'
        ? 'bankTransfer'
        : method === 'cheque'
          ? 'cheque'
          : method === 'credit_adjustment'
            ? 'creditAdjustment'
            : 'cash'
}
