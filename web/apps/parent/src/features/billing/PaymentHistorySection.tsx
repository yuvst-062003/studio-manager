// `12f` behind `#/payments/history` — the hash PaymentsSection has linked to since W8
// while nothing routed it (P1). The screen was built and tested; this container is the
// missing data wiring: the same `/me/*` reads the payments screen uses, handed to the
// presentational screen.
//
// `onEmailReceipt` is deliberately NOT passed: no provider-side resend exists — we hold
// only the uPay form and its IPN, and the receipt lives in uPay's dashboard
// (upay-integration.md). The screen withholds the affordance when the handler is absent;
// wiring a button to a pretend send would be the inert-control defect again.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentHistoryScreen } from './PaymentHistoryScreen'
import { makeParentBillingClient } from './PaymentsSection'
import type { ChargeOut, PaymentOut } from './billingClient'

export function PaymentHistorySection({ locale }: { locale: Locale }) {
  const client = useMemo(() => makeParentBillingClient(apiFetch), [])
  const [data, setData] = useState<{
    payments: PaymentOut[]
    openCharges: ChargeOut[]
    openBalanceAgorot: number
  } | null>(null)
  const [failed, setFailed] = useState(false)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void Promise.all([client.payments(''), client.openCharges(''), client.balance('')])
      .then(([payments, openCharges, balance]) => {
        if (live) setData({ payments, openCharges, openBalanceAgorot: balance.balance_agorot })
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, attempt])

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (data === null) return <p data-testid="history-loading">{t(locale, 'common.setup.loading')}</p>

  const year = new Date().getFullYear()
  const paidThisYearAgorot = data.payments
    .filter((row) => row.reversed_at === null && new Date(row.received_at).getFullYear() === year)
    .reduce((sum, row) => sum + row.amount_agorot, 0)

  return (
    <PaymentHistoryScreen
      locale={locale}
      onPay={() => {
        globalThis.location.hash = '#/payments'
      }}
      openBalanceAgorot={data.openBalanceAgorot}
      openCharges={data.openCharges}
      paidThisYearAgorot={paidThisYearAgorot}
      payments={data.payments}
    />
  )
}
