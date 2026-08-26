// §5.10's הוראת קבע reconciliation queue.
//
// **D-M6-11 — designed from the spec, not ported.** `3e`'s finding 3: eighteen
// `billing.reconciliation.*` keys exist, including `neverAuto`, and **no artboard anywhere in
// the canvas draws them.** So this is built from §5.10's own two-column description —
// unmatched payments on one side, payers expected to pay this month on the other — and it
// lives as a section of `3e` rather than as a route nobody can reach.
//
// **§5.10 step 5 is the rule this screen exists to keep.** 'Suggestions are never
// auto-applied. A wrong automatic match marks the wrong payer paid and sends the wrong parent
// a debt reminder — an expensive bug in a small community. A human always confirms.'
// `reconciliation.neverAuto` says so on the screen, and computing a suggestion has no side
// effect on the ledger.
//
// **§11.7 — the card owner name and last four ARE shown here.** They are forbidden in
// application *logs*; they are data on a manager-only screen, and matching an unmatched
// הוראת קבע payment is impossible without them. uPay provides no other identifying field —
// that is a confirmed provider limitation (§12), not a design choice.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type {
  DashboardBillingClient,
  MatchSuggestion,
  RecurringSubscriptionOut,
  UpayIpnRecordOut,
} from './billingClient'

const columnsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-5)',
  alignItems: 'flex-start',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
}

export type ReconciliationQueueProps = {
  locale: Locale
  client: DashboardBillingClient
  unmatched: readonly UpayIpnRecordOut[]
  suggestions: readonly MatchSuggestion[]
  expected: readonly RecurringSubscriptionOut[]
  payerName: (payerPersonId: string) => string
  onChanged: () => void
}

export function ReconciliationQueue({
  locale,
  client,
  unmatched,
  suggestions,
  expected,
  payerName,
  onChanged,
}: ReconciliationQueueProps) {
  const [busy, setBusy] = useState<string | null>(null)

  async function confirm(ipnId: string, payerPersonId: string) {
    setBusy(ipnId)
    try {
      await client.confirmMatch(ipnId, payerPersonId)
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="reconciliation" data-testid="reconciliation">
      <h2 id="reconciliation">{t(locale, 'billing.reconciliation.title')}</h2>
      {/* §5.10 step 5, on the screen. Not a comment, not a docstring — the promise the
          product makes to whichever parent would otherwise get the wrong reminder. */}
      <p data-testid="never-auto">{t(locale, 'billing.reconciliation.neverAuto')}</p>

      <div style={columnsStyle}>
        {/* -- unmatched payments -------------------------------------------- */}
        <Card caption={t(locale, 'billing.reconciliation.unmatched')}>
          {unmatched.length === 0 ? (
            <EmptyState title={t(locale, 'billing.reconciliation.empty')} />
          ) : (
            unmatched.map((record) => {
              const suggestion = suggestions.find((row) => row.ipn_id === record.id)
              return (
                <div key={record.id} style={rowStyle} data-testid="unmatched-row">
                  {/* §11.7's data half — the only identifying information uPay gives us. */}
                  <span data-testid="card-owner">{record.card_owner_name}</span>
                  <span data-testid="four-digits">{record.four_digits}</span>
                  <span data-testid="payment-date">{record.payment_date}</span>
                  {/* The raw string uPay sent AND our parse of it, side by side. A manager
                      seeing both is the only way an amount mismatch is legible — and when
                      `amount_agorot` is null we could not read it, which is exactly the case
                      that must not be papered over with an invented number. */}
                  <span data-testid="raw-amount">{record.amount}</span>
                  {record.amount_agorot === null ? (
                    <span data-testid="unreadable-amount">—</span>
                  ) : (
                    <MoneyDisplay agorot={record.amount_agorot} tone="paid" />
                  )}
                  {suggestion ? (
                    <span data-testid="suggestion">
                      {t(locale, 'billing.reconciliation.suggestion')}:{' '}
                      {payerName(suggestion.payer_person_id)} (
                      {t(locale, 'billing.reconciliation.confidence')} {suggestion.confidence})
                    </span>
                  ) : null}
                  <Button
                    variant="primary"
                    data-testid="confirm-match"
                    disabled={busy === record.id || !suggestion}
                    onClick={() => suggestion && confirm(record.id, suggestion.payer_person_id)}
                  >
                    {t(locale, 'billing.reconciliation.confirm')}
                  </Button>
                  <Button
                    variant="secondary"
                    data-testid="ignore-ipn"
                    disabled={busy === record.id}
                    onClick={async () => {
                      setBusy(record.id)
                      try {
                        await client.ignoreIpn(record.id)
                        onChanged()
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    {t(locale, 'billing.reconciliation.ignore')}
                  </Button>
                </div>
              )
            })
          )}
        </Card>

        {/* -- payers expected to pay this month ------------------------------ */}
        <Card caption={t(locale, 'billing.reconciliation.expected')}>
          {expected.length === 0 ? (
            <EmptyState title={t(locale, 'billing.subscription.title')} />
          ) : (
            expected.map((subscription) => (
              <div key={subscription.id} style={rowStyle} data-testid="expected-row">
                <span>{payerName(subscription.payer_person_id)}</span>
                <MoneyDisplay agorot={subscription.amount_agorot} tone="pending" />
              </div>
            ))
          )}
          {/* G8 — the manager's own record, because uPay cannot create a mandate and the
              parent never sets one. */}
          <p data-testid="manager-record-hint">
            {t(locale, 'billing.subscription.managerRecordHint')}
          </p>
        </Card>
      </div>
    </section>
  )
}
