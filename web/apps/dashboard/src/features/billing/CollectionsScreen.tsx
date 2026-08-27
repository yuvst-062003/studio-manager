// Dashboard artboard `3e` — תשלומים וגבייה · debt by household.
//
// **"Household" is the payer person** (D-M6-10). L9 and §4.3: there is no household entity,
// and "my children" is `SELECT student_id FROM guardian WHERE person_id = me`. The row unit
// is one payer; `חניכים` is a flat summary column inside it, never a row key.
//
// **▲ `3e` finding 1 — the cash affordance must create a payment and allocate it.** The
// artboard puts `רישום תשלום מזומן` beside a household's AGGREGATE balance with no charge
// picker. The label is right — it records a payment — but a one-click, one-row,
// one-aggregate control is exactly the shape that invites the shortcut §5.10 forbids: a
// charge is settled by allocation, never mutated. So it opens a dialogue with a date, an
// amount and a note, and reports what the allocation settled. Six `billing.payment.*` keys
// exist for that dialogue and the artboard draws none of them.
//
// **`3e` finding 2 — `billing.run.idempotentHint` is invariant 5 in words**, written for the
// single most consequential button on the dashboard, and the artboard shows it with no
// confirmation, no in-progress state and no result. All three are here.
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, Checkbox, EmptyState, MoneyDisplay, StatusChip } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { BillingRunOut, DashboardBillingClient } from './billingClient'
import { ageBucket, escalationRung } from './billingClient'
import { RecordPaymentDialog } from './RecordPaymentDialog'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
  padding: 'var(--space-5)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
}

export type HouseholdRow = {
  payerPersonId: string
  payerName: string
  /** The children this payer's open charges name. A flat summary, never a row key. */
  studentNames: readonly string[]
  balanceAgorot: number
  /** Money already handed over that settles nothing yet. **Beside the balance, never
   *  merged into it** — a manager about to phone a family needs "owes 640 ₪, paid ahead
   *  600 ₪", which is two facts. One number that meant neither is what merging produces. */
  creditAgorot: number
  monthsInDebt: number
  daysOverdue: number
}

export type CollectionsScreenProps = {
  locale: Locale
  client: DashboardBillingClient
  households: readonly HouseholdRow[]
  openDebtAgorot: number
  collectedThisMonthAgorot: number
  collectedSharePercent: number
  activeSubscriptions: number
  failedCharges: number
  period: { year: number; month: number }
}

export function CollectionsScreen({
  locale,
  client,
  households,
  openDebtAgorot,
  collectedThisMonthAgorot,
  collectedSharePercent,
  activeSubscriptions,
  failedCharges,
  period,
}: CollectionsScreenProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [confirmingRun, setConfirmingRun] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<BillingRunOut | null>(null)
  const [payingFor, setPayingFor] = useState<HouseholdRow | null>(null)

  const total = useMemo(
    () => households.reduce((sum, row) => sum + row.balanceAgorot, 0),
    [households],
  )

  async function runNow() {
    setRunning(true)
    try {
      setRunResult(await client.runBilling(period.year, period.month))
    } finally {
      setRunning(false)
      setConfirmingRun(false)
    }
  }

  return (
    <div style={pageStyle} data-testid="collections">
      <header style={rowStyle}>
        <h1>{t(locale, 'billing.debt.title')}</h1>
        <Button variant="secondary" data-testid="export-accountant">
          {t(locale, 'billing.export.forAccountant')}
        </Button>
        <Button variant="primary" data-testid="run-charges" onClick={() => setConfirmingRun(true)}>
          {t(locale, 'billing.run.runNow')}
        </Button>
      </header>

      {confirmingRun ? (
        <Card>
          {/* Invariant 5, in Hebrew, on the button the manager is about to press. */}
          <p data-testid="run-idempotent-hint">{t(locale, 'billing.run.idempotentHint')}</p>
          <Button variant="primary" data-testid="run-charges-confirm" onClick={runNow}>
            {t(locale, 'billing.run.confirm')}
          </Button>
        </Card>
      ) : null}

      {running ? <p data-testid="run-status">{t(locale, 'billing.run.status.running')}</p> : null}
      {runResult ? (
        <p data-testid="run-result">
          {t(locale, 'billing.run.chargesCreated').replace(
            '{{count}}',
            String(runResult.charges_created),
          )}
        </p>
      ) : null}

      {/* -- the four KPIs ---------------------------------------------------- */}
      <div style={rowStyle} data-testid="kpi-row">
        <Stat label={t(locale, 'billing.debt.total')} agorot={openDebtAgorot} tone="debt" />
        <Stat
          label={t(locale, 'billing.debt.collectedThisMonth')}
          agorot={collectedThisMonthAgorot}
          tone="paid"
          note={t(locale, 'billing.debt.collectedShare').replace(
            '{{percent}}',
            String(collectedSharePercent),
          )}
        />
        <Card caption={t(locale, 'billing.subscription.title')}>
          {/* Informational, and deliberately uncoloured — `3e`'s token table gives this one
              `--border` rather than a semantic tone. */}
          <span data-testid="kpi-subscriptions">{activeSubscriptions}</span>
        </Card>
        <Card caption={t(locale, 'billing.order.status.failed')}>
          <span data-testid="kpi-failed" data-tone="pending">
            {failedCharges}
          </span>
        </Card>
      </div>

      {/* -- the debt table --------------------------------------------------- */}
      <section aria-labelledby="open-debts">
        <div style={rowStyle}>
          <h2 id="open-debts">{t(locale, 'billing.openDebts.title')}</h2>
          <Button
            variant="secondary"
            data-testid="bulk-reminder"
            disabled={selected.length === 0}
          >
            {t(locale, 'billing.debt.sendReminderToCount').replace(
              '{{count}}',
              String(selected.length),
            )}
          </Button>
        </div>

        {households.length === 0 ? (
          // `3e` finding 7 — not drawn, and it is the goal state for a well-run club.
          <EmptyState title={t(locale, 'billing.debt.empty')} />
        ) : (
          <Card>
            {households.map((row) => (
              <div key={row.payerPersonId} style={rowStyle} data-testid="household-row">
                <Checkbox
                  // Never empty (ship-audit D1): an empty label is an unnamed checkbox to
                  // a screen reader. The students name the family when the payer read
                  // came back short; the generic word is the floor, not the norm.
                  label={
                    row.payerName ||
                    row.studentNames.join(', ') ||
                    t(locale, 'billing.debt.household')
                  }
                  checked={selected.includes(row.payerPersonId)}
                  onChange={(event) =>
                    setSelected((previous) =>
                      event.target.checked
                        ? [...previous, row.payerPersonId]
                        : previous.filter((id) => id !== row.payerPersonId),
                    )
                  }
                />
                {/* A flat summary of which children the debt covers. Never a row key, and
                    the row does not expand — `3e` records that as a real gap, not a
                    feature to invent here. */}
                <span data-testid="household-students">{row.studentNames.join(', ')}</span>
                <span data-testid="household-months">{row.monthsInDebt}</span>
                <StatusChip
                  status="debt"
                  label={t(locale, `billing.debt.aging.${ageBucket(row.daysOverdue)}`)}
                />
                {/* `3e` finding 4 — four rungs, and the artboard shows one button. A
                    manager who cannot see the rung cannot tell a first nudge from a final
                    notice. */}
                <span data-testid="household-rung">
                  {t(locale, `billing.debt.escalation.${escalationRung(row.daysOverdue)}`)}
                </span>
                <MoneyDisplay agorot={row.balanceAgorot} tone="debt" label={row.payerName} />
                {/* §7 — beside the debt, never merged into it. A family who has paid ahead
                    is not a debtor for the part they paid, and a manager who sends them a
                    reminder without seeing this makes a phone call nobody enjoys. */}
                {row.creditAgorot > 0 ? (
                  <span data-testid="household-credit">
                    {t(locale, 'billing.prepay.credit')}{' '}
                    <MoneyDisplay agorot={row.creditAgorot} tone="paid" label={row.payerName} />
                  </span>
                ) : null}
                <Button variant="secondary" data-testid="send-reminder">
                  {t(locale, 'billing.debt.sendReminder')}
                </Button>
                <Button
                  variant="secondary"
                  data-testid="record-cash"
                  onClick={() => setPayingFor(row)}
                >
                  {t(locale, 'billing.payment.recordCash')}
                </Button>
              </div>
            ))}
            <div style={rowStyle}>
              <span>{t(locale, 'billing.debt.total')}</span>
              <MoneyDisplay agorot={total} tone="debt" />
            </div>
          </Card>
        )}
      </section>

      {payingFor ? (
        <RecordPaymentDialog
          locale={locale}
          client={client}
          household={payingFor}
          onClose={() => setPayingFor(null)}
        />
      ) : null}
    </div>
  )
}

/** `3e`'s KPI tile. The same shape as `6a`, `4a`, `4c`, `1c` and `9g` — the spec asks for it
 *  to be extracted once across the dashboard, and this is a local one until it is. */
function Stat({
  label,
  agorot,
  tone,
  note,
}: {
  label: string
  agorot: number
  tone: 'debt' | 'paid'
  note?: string
}) {
  return (
    <Card caption={label}>
      <MoneyDisplay agorot={agorot} tone={tone} label={label} />
      {note ? <span>{note}</span> : null}
    </Card>
  )
}
