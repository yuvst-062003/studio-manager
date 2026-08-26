// M6's `alert-centre` section — the slot fill into `6c`, which is M3's container.
//
// `features/people/register.ts` says it outright: "M6's debt alert belongs above a trial
// queue", and its order values leave gaps so this lane does not renumber anything.
//
// Two numbers, and the second is the important one. §5.10's `amount_mismatch` row is a
// **high-priority manager alert**: real money arrived for the wrong amount, a payment was
// recorded for it, and the charges were NOT settled. If nobody looks, a family is chased for
// a month they paid.
import { Alert, Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type DebtAlertProps = {
  locale: Locale
  overdueHouseholds: number
  amountMismatches: number
  staleOrders: number
  onOpenCollections: () => void
}

export function DebtAlert({
  locale,
  overdueHouseholds,
  amountMismatches,
  staleOrders,
  onOpenCollections,
}: DebtAlertProps) {
  if (overdueHouseholds === 0 && amountMismatches === 0 && staleOrders === 0) return null
  return (
    <div data-testid="billing-alert">
      {amountMismatches > 0 ? (
        // §5.10: 'a high-priority manager alert is raised'. `live` because this one appears
        // in response to something that happened rather than being on screen at load.
        <Alert tone="danger" live iconLabel={t(locale, 'billing.order.status.amount_mismatch')}>
          {t(locale, 'billing.order.mismatchAlert')}
        </Alert>
      ) : null}
      {staleOrders > 0 ? (
        // §5.10's 'IPN never arrives' row — verify against uPay's own reports.
        <p data-testid="stale-orders">{t(locale, 'billing.order.stale')}</p>
      ) : null}
      {overdueHouseholds > 0 ? (
        <p data-testid="overdue-households">
          {t(locale, 'billing.debt.byHousehold')}: {overdueHouseholds}
        </p>
      ) : null}
      <Button variant="secondary" onClick={onOpenCollections}>
        {t(locale, 'billing.debt.title')}
      </Button>
    </div>
  )
}
