// §5.10 step 5's `returnurl`. **The one screen whose entire job is to be honest that it does
// not know yet.**
//
// 'The redirect is NEVER the source of truth — a closed tab still produces an IPN, which
// arrives roughly five minutes later.' So this screen renders `billing.order.verifying` and
// marks nothing paid. Every field uPay appends to this URL is client-submitted and unsigned
// (§12), and none of it is read here.
//
// `1b` finding 2 and `12e`'s own state table both record that this state is drawn nowhere in
// the canvas, and it is the state the whole card flow depends on being truthful about.
import type { CSSProperties } from 'react'
import { Alert, Button, Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PaymentOrderOut } from './billingClient'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

export type PaymentCompleteScreenProps = {
  locale: Locale
  status: PaymentOrderOut['status']
  onOpenPayments: () => void
}

export function PaymentCompleteScreen({
  locale,
  status,
  onOpenPayments,
}: PaymentCompleteScreenProps) {
  return (
    <div style={columnStyle} data-testid="payment-complete">
      <Card>
        {status === 'paid' ? (
          <p data-testid="order-paid">{t(locale, 'billing.order.status.paid')}</p>
        ) : status === 'amount_mismatch' ? (
          // §5.10: a payment WAS recorded for the money that actually arrived. Telling the
          // parent it failed would be wrong in the direction that costs them a second
          // payment, so this says a check is needed rather than that anything was lost.
          <>
            <Alert tone="danger" iconLabel={t(locale, 'billing.order.status.amount_mismatch')}>
              {t(locale, 'billing.order.mismatchAlert')}
            </Alert>
            <p>{t(locale, 'billing.order.mismatchHint')}</p>
          </>
        ) : (
          <>
            <p>{t(locale, 'billing.order.verifying')}</p>
            {/* The whole point: the parent may leave. The IPN arrives either way. */}
            <p>{t(locale, 'billing.order.verifyingHint')}</p>
          </>
        )}
      </Card>
      <Button variant="secondary" onClick={onOpenPayments}>
        {t(locale, 'billing.title')}
      </Button>
    </div>
  )
}
