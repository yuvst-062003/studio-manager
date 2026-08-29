// ▲ `3e` finding 1 — 'Record a cash payment' must go through allocation, never a flag.
//
// §5.10 is explicit: **a charge is settled by allocation, never mutated.** `billing` says the
// same in three places — `payment.allocatedOldestFirst`, `charge.status.settled` documented
// as a derived cache, and the namespace header noting that no string invites a manager to
// "mark as paid" on a charge itself.
//
// The artboard's label is right — it records a PAYMENT — but it sits beside a household's
// aggregate balance with no charge picker and no way to split an amount, which is exactly the
// shape that invites the shortcut the spec forbids. So this is a dialogue: a date, an amount,
// a note; then the server allocates oldest-first and this reports what it settled. Six
// `billing.payment.*` keys exist for it and the artboard draws none of them.
//
// **The client never picks the charges.** `charge_ids` goes up empty and §5.10's oldest-first
// rule stays the server's — a client that chose would be a second answer to "which months
// does this money clear".
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, MoneyDisplay, Radio, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardBillingClient } from './billingClient'

/**
 * The routes a manager records BY HAND.
 *
 * `upay_card` is absent deliberately: uPay's IPN writes those rows, and a hand-entered
 * card payment would be a second source of truth for money that already has one.
 * `credit_adjustment` is absent because it is not money arriving — it is a correction,
 * and it has its own audited path.
 */
const MANUAL_METHODS = ['cash', 'cheque', 'bank_transfer'] as const
type ManualMethod = (typeof MANUAL_METHODS)[number]

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

export type RecordPaymentDialogProps = {
  locale: Locale
  client: DashboardBillingClient
  household: { payerPersonId: string; payerName: string; balanceAgorot: number }
  onClose: () => void
}

export function RecordPaymentDialog({
  locale,
  client,
  household,
  onClose,
}: RecordPaymentDialogProps) {
  const [method, setMethod] = useState<ManualMethod>('cash')
  const [shekels, setShekels] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [note, setNote] = useState('')
  const [inFlight, setInFlight] = useState(false)
  const [result, setResult] = useState<{ allocated: number; unallocatedAgorot: number } | null>(
    null,
  )

  async function submit() {
    if (inFlight) return
    setInFlight(true)
    try {
      setResult(
        await client.recordPayment({
          payerPersonId: household.payerPersonId,
          // G2 at the one boundary where a human types money. A manager types 320; the
          // client sends 32000. Getting this wrong by a factor of a hundred is the single
          // most likely money bug in the product, and it is invisible until a parent is
          // billed ₪3.20.
          amountAgorot: Math.round(Number(shekels) * 100),
          receivedAt: new Date(receivedAt).toISOString(),
          method,
          note: note || undefined,
        }),
      )
    } finally {
      setInFlight(false)
    }
  }

  return (
    <Card caption={t(locale, 'billing.payment.record')}>
      <div style={columnStyle} data-testid="record-payment-dialog">
        <TextField
          label={t(locale, 'billing.payment.date')}
          type="date"
          value={receivedAt}
          onChange={(event) => setReceivedAt(event.target.value)}
        />
        <TextField
          label={t(locale, 'billing.payment.amount')}
          inputMode="decimal"
          value={shekels}
          onChange={(event) => setShekels(event.target.value)}
        />
        {/* How the money arrived. This was hard-coded to cash, so a club that took a
            cheque had it filed as cash and §10's "how much is sitting in undeposited
            cheques" could not be answered from the data — even though `payment.method`
            has stored the difference since W4 and the promises panel already asks it. */}
        <fieldset className="payment-methods" role="radiogroup">
          <legend className="payment-methods__legend">
            {t(locale, 'billing.payment.method')}
          </legend>
          {MANUAL_METHODS.map((option) => (
            <Radio
              checked={method === option}
              data-testid={`payment-method-${option}`}
              key={option}
              label={t(locale, `billing.payment.method.${option}`)}
              name="payment-method"
              onChange={() => setMethod(option)}
              value={option}
            />
          ))}
        </fieldset>
        <TextField
          label={t(locale, 'billing.payment.note')}
          multiline
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <Button
          variant="primary"
          data-testid="record-payment-submit"
          disabled={inFlight || !shekels || !receivedAt}
          onClick={submit}
        >
          {t(locale, 'billing.payment.record')}
        </Button>

        {result ? (
          <div data-testid="record-payment-result">
            <p>{t(locale, 'billing.payment.saved')}</p>
            {/* What the allocation actually settled — the half the artboard's one-click
                control could never report. */}
            <p>{t(locale, 'billing.payment.allocatedOldestFirst')}</p>
            {result.unallocatedAgorot > 0 ? (
              <p data-testid="record-payment-surplus">
                {t(locale, 'billing.payment.unallocated')}{' '}
                <MoneyDisplay agorot={result.unallocatedAgorot} tone="pending" />
              </p>
            ) : null}
          </div>
        ) : null}

        <Button variant="secondary" onClick={onClose}>
          {t(locale, 'billing.dialog.cancel')}
        </Button>
      </div>
    </Card>
  )
}
