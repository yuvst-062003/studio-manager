// ההזמנות שלי — the shop's own order history.
//
// It lived on פרופיל until the owner's review of 2026-09-06, two rows under
// "היסטוריית תשלומים" and reading the same charges. Two lists of one thing on one screen,
// answering different questions badly. Here it answers the shop's question — what did I
// buy — and תשלומים answers the money one.
//
// The rows are the `manual` charges the order endpoint writes, one per line ordered. There
// is no fulfilment state to show: §4.3 says inventory is a different product, so "has the
// coach handed it over" is not something this system knows.
import { Package, X } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { useDialog } from '../../onboarding/wizard/useDialog'

export type OrderRow = {
  id: string
  label: string
  amountAgorot: number
  dueDate: string
}

export function OrdersSheet({
  orders,
  locale,
  money,
  dateLabel,
  onClose,
}: {
  orders: readonly OrderRow[] | null
  locale: Locale
  money: (agorot: number) => string
  dateLabel: (isoDate: string) => string
  onClose: () => void
}) {
  const dialogRef = useDialog(true, onClose)

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-blur transition-all duration-300">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="orders-title"
        tabIndex={-1}
        data-testid="shop-orders-sheet"
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 dark:border-slate-800"
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="text-start">
            <h3 id="orders-title" className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight">
              {t(locale, 'billing.shop.ordersTitle')}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t(locale, 'billing.shop.ordersSub')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'billing.shop.close')}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {orders === null ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t(locale, 'billing.shop.loading')}</p>
        ) : orders.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
            {t(locale, 'billing.shop.ordersEmpty')}
          </p>
        ) : (
          <ul className="space-y-2 list-none m-0 p-0">
            {orders.map((order) => (
              <li
                key={order.id}
                data-testid={`shop-order-${order.id}`}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700"
              >
                <span className="font-bold text-sm text-slate-900 dark:text-slate-50 shrink-0">
                  {money(order.amountAgorot)}
                </span>
                <span className="flex-1 min-w-0 text-start">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
                    {order.label}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    {dateLabel(order.dueDate)}
                  </span>
                </span>
                <span className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-slate-400" aria-hidden="true" />
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* The money side of the same rows. `#/payments/history` lists what was PAID. */}
        <a
          href="#/payments/history"
          className="block text-center text-xs font-bold text-[#0056c5] dark:text-blue-300 py-2 cursor-pointer"
        >
          {t(locale, 'billing.shop.ordersAll')}
        </a>
      </div>
    </div>
  )
}
