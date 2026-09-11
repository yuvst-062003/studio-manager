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
import { Button, Card, EmptyState, MoneyDisplay, PageHeader } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type {
  DashboardBillingClient,
  MatchSuggestion,
  RecurringSubscriptionOut,
  UpayIpnRecordOut,
} from './billingClient'

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
      {/* §5.10 step 5 as the page's subtitle, rather than a loose line under the heading.
          Not a comment, not a docstring — the promise the product makes to whichever parent
          would otherwise get the wrong reminder. `data-testid` stays on it: a test asserts
          this sentence is on the screen, and it must keep being findable. */}
      <PageHeader
        subtitle={
          <span data-testid="never-auto">{t(locale, 'billing.reconciliation.neverAuto')}</span>
        }
        title={t(locale, 'billing.reconciliation.title')}
        titleId="reconciliation"
      />

      <div className="recon-columns">
        {/* -- unmatched payments -------------------------------------------- */}
        <Card caption={t(locale, 'billing.reconciliation.unmatched')}>
          {unmatched.length === 0 ? (
            <EmptyState title={t(locale, 'billing.reconciliation.empty')} />
          ) : (
            <div className="recon-list">
              {unmatched.map((record) => {
                const suggestion = suggestions.find((row) => row.ipn_id === record.id)
                return (
                  <div key={record.id} className="recon-card" data-testid="unmatched-row">
                    {/* §11.7's data half — the only identifying information uPay gives us. */}
                    <div className="recon-card__who">
                      <span className="recon-card__owner" data-testid="card-owner">
                        {/* uPay does not always send a name. Blank, it left a card that began
                          with a bare number and identified nobody — so the absence is said
                          rather than left as whitespace. */}
                        {record.card_owner_name ? (
                          <bdi>{record.card_owner_name}</bdi>
                        ) : (
                          t(locale, 'billing.reconciliation.noOwnerName')
                        )}
                      </span>
                      <span className="recon-card__digits" data-testid="four-digits">
                        {record.four_digits}
                      </span>
                      <span className="recon-card__digits" data-testid="payment-date">
                        {record.payment_date}
                      </span>
                    </div>

                    {/* THE TWO AMOUNTS, EACH SAYING WHICH IT IS.
                      The raw string uPay sent and our parse of it, side by side — the only
                      way an amount mismatch is legible, and when `amount_agorot` is null we
                      could not read it at all, which must not be papered over with an
                      invented number. Unlabelled they rendered as `320.00  ₪320`, which
                      reads as one number printed twice by mistake rather than as the
                      comparison it is (owner's screenshot, checkpoint 10). */}
                    <div className="recon-amounts">
                      <span className="recon-amount">
                        <span className="recon-amount__label">
                          {t(locale, 'billing.reconciliation.rawAmount')}
                        </span>
                        <bdi data-testid="raw-amount">{record.amount}</bdi>
                      </span>
                      <span className="recon-amount">
                        <span className="recon-amount__label">
                          {t(locale, 'billing.reconciliation.parsedAmount')}
                        </span>
                        {record.amount_agorot === null ? (
                          <span data-testid="unreadable-amount">—</span>
                        ) : (
                          <MoneyDisplay agorot={record.amount_agorot} tone="paid" />
                        )}
                      </span>
                    </div>

                    {suggestion ? (
                      <span data-testid="suggestion">
                        {t(locale, 'billing.reconciliation.suggestion')}:{' '}
                        {payerName(suggestion.payer_person_id)} (
                        {t(locale, 'billing.reconciliation.confidence')} {suggestion.confidence})
                      </span>
                    ) : null}

                    <div className="recon-card__actions">
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
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* -- payers expected to pay this month ------------------------------ */}
        <Card caption={t(locale, 'billing.reconciliation.expected')}>
          {expected.length === 0 ? (
            <EmptyState title={t(locale, 'billing.subscription.title')} />
          ) : (
            <div className="recon-list">
              {expected.map((subscription) => (
                <div key={subscription.id} className="recon-card" data-testid="expected-row">
                  <div className="recon-card__who">
                    <span className="recon-card__owner">
                      <bdi>{payerName(subscription.payer_person_id)}</bdi>
                    </span>
                  </div>
                  <MoneyDisplay agorot={subscription.amount_agorot} tone="pending" />
                </div>
              ))}
            </div>
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
