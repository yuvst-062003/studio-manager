// 2c's `מסמכים וחיובים` money rows — M6's student-card slot entry, the one the audit
// found "left for someone else" by every wave (P2). The section fetches through its own
// client, the way every slot section does, and renders `PaymentStrip` — the primitive
// built for exactly this spot and mounted by nothing until now (P1).
//
// The balance is the HOUSEHOLD's (§6.3 — debt is per household, not per child), and the
// strip says so by rendering the same figure on every child's card rather than inventing
// a per-child split the ledger does not have.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import { registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentStrip } from './PaymentStrip'
import { makeParentBillingClient } from './PaymentsSection'

export function StudentCardBillingSection({ locale }: { locale: Locale }) {
  const client = useMemo(() => makeParentBillingClient(apiFetch), [])
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    client
      .balance('')
      .then((out) => live && setBalance(out.balance_agorot))
      // A failed read renders as NOTHING here, never as a reassuring zero — P8's rule:
      // a wrong number about money is worse than an error, and the strip's own contract
      // hides itself at zero.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client])

  if (balance === null) return null
  return (
    <section aria-label={t(locale, 'billing.openDebts.total')} data-testid="student-card-billing">
      <PaymentStrip
        balanceAgorot={balance}
        locale={locale}
        onOpenPayments={() => {
          globalThis.location.hash = '#/payments'
        }}
      />
    </section>
  )
}

/** One file plus one line — the seam-4 shape every other section uses. */
export function registerBillingSections(): void {
  registerSlot<{ locale: Locale }>('student-card', {
    key: 'billing-strip',
    // After M3's guardians (50): money is the card's last word, per 2c's region order.
    order: 70,
    render: StudentCardBillingSection,
  })
}
