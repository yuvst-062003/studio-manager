// Dashboard artboard `5a` — מחירים ומסלולים.
//
// **A plan is never edited in place.** §5.10 and §5.15: a price change CLOSES the current
// plan and opens a new one, because a charge raised last year must still be explicable by the
// plan that was in force when it was raised. `billing.plan.versionedHint` is that rule in
// Hebrew and it belongs on the screen, not in a comment.
//
// **C11 — a plan is scoped by training volume, never by a group.** `sessions_per_week` is
// what the club charges by, and there is no group picker here: a group-scoped plan is exactly
// what charged a child in two groups twice, at two different prices, silently and forever.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, MoneyDisplay, StatusChip, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardBillingClient, PricePlanOut } from './billingClient'
import { agorotFromShekels } from './money'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-5)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
}

//: A URL is long and strong-LTR. `min-inline-size: 0` plus the ellipsis keeps it from
//: pushing the row's amount off a 390-wide screen, and `<bdi>` keeps it from reordering
//: the Hebrew around it. Logical properties throughout (D10).
const urlStyle: CSSProperties = {
  minInlineSize: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--text-muted)',
}

export type PricePlansScreenProps = {
  locale: Locale
  client: DashboardBillingClient
  plans: readonly PricePlanOut[]
  onChanged: () => void
}

export function PricePlansScreen({ locale, client, plans, onChanged }: PricePlansScreenProps) {
  const [openPlanId, setOpenPlanId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [sessions, setSessions] = useState('2')
  const [monthly, setMonthly] = useState('')
  const [inFlight, setInFlight] = useState(false)

  async function create() {
    if (inFlight) return
    setInFlight(true)
    try {
      await client.createPricePlan({
        name,
        sessionsPerWeek: Number(sessions),
        // G2 at the one boundary where a human types money.
        monthlyAmountAgorot: agorotFromShekels(monthly),
        registrationFeeAgorot: null,
        activeFrom: new Date().toISOString().slice(0, 10),
      })
      onChanged()
      setName('')
      setMonthly('')
    } finally {
      setInFlight(false)
    }
  }

  return (
    <div style={columnStyle} data-testid="price-plans">
      <h1>{t(locale, 'billing.plan.title')}</h1>

      {plans.length === 0 ? (
        <EmptyState title={t(locale, 'billing.plan.empty')} />
      ) : (
        <Card>
          {plans.map((plan) => (
            <div
              key={plan.id}
              style={rowStyle}
              data-testid="plan-row"
              onClick={() => setOpenPlanId(plan.id)}
            >
              <span>{plan.name}</span>
              {/* C11 — the volume the club prices by. Not a group. */}
              <span data-testid="plan-volume">{plan.sessions_per_week}</span>
              <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
              {plan.active_to ? (
                <span data-testid="plan-closed">{plan.active_to}</span>
              ) : (
                <span data-testid="plan-current">{plan.active_from}</span>
              )}
              {/* §4 -- the FULL url, never a "link set" tick: a typo in a payment page has
                  to be visible without clicking it. And the missing case is badged only on
                  an ACTIVE plan; a closed plan's link is dead by definition, so badging it
                  would put a permanent unfixable warning on every retired plan. */}
              {plan.standing_order_link_url ? (
                <span data-testid="plan-link" style={urlStyle}>
                  <bdi>{plan.standing_order_link_url}</bdi>
                </span>
              ) : plan.active_to === null ? (
                <span data-testid="plan-link-missing">
                  <StatusChip status="pending" label={t(locale, 'billing.plan.linkMissing')} />
                </span>
              ) : null}
            </div>
          ))}
        </Card>
      )}

      {openPlanId ? (
        <Card>
          {/* The rule, in Hebrew, where the manager is about to change a price. */}
          <p data-testid="versioned-hint">{t(locale, 'billing.plan.versionedHint')}</p>
          {/* Disabled deliberately: there is no shape in the product that edits an amount in
              place, and an enabled field promising one would be a lie the API refuses. */}
          <TextField label={t(locale, 'billing.plan.monthlyAmount')} disabled value="" readOnly />
          <Button
            variant="primary"
            data-testid="plan-close"
            onClick={async () => {
              await client.closePricePlan(
                openPlanId,
                new Date().toISOString().slice(0, 10),
                agorotFromShekels(monthly),
              )
              onChanged()
              setOpenPlanId(null)
            }}
          >
            {t(locale, 'billing.plan.closeCurrent')}
          </Button>
        </Card>
      ) : null}

      <Card caption={t(locale, 'billing.plan.add')}>
        <TextField
          label={t(locale, 'billing.plan.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label={t(locale, 'billing.plan.appliesTo')}
          inputMode="numeric"
          value={sessions}
          onChange={(event) => setSessions(event.target.value)}
        />
        <TextField
          label={t(locale, 'billing.plan.monthlyAmount')}
          inputMode="decimal"
          value={monthly}
          onChange={(event) => setMonthly(event.target.value)}
        />
        <Button variant="primary" data-testid="plan-save" disabled={inFlight} onClick={create}>
          {t(locale, 'billing.plan.add')}
        </Button>
      </Card>
    </div>
  )
}
