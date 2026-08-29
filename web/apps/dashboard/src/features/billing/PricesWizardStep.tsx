// Artboard `5e` — אשף · שלב 4, the prices step.
//
// **Seam 4, from this lane's side.** M1 owns the wizard container; this file registers one
// entry into its `setup-wizard` slot and the container is never reopened — not
// `SetupWizard.tsx`, and not `packages/ui/src/setup-wizard/register.ts`, which registers
// M1's OWN four steps. `WIZARD_STEP_ORDER` has reserved `prices` at order 4 since M1, and
// `WIZARD_STEPS` in `app/services/structure/setup.py` is the matching server-side contract;
// this feature adds nothing to either tuple, it fills the slot that was already there.
//
// **The link sits beside the amount, and it is OPTIONAL.** Payment-routes spec §5: a club
// may not have its uPay links on the day it sets the app up, and a required field here
// would be a wall in front of a club that cannot pass it yet. Left blank, the plan is
// created and no link is sent — the dashboard then badges the gap on `5a` and in Settings →
// Payments, which is where it gets filled in later.
//
// **A plan is created here and never edited here.** `price_plan` is versioned: a price
// change closes the old row and opens a successor, which is `5a`'s job. This step only
// opens the first ones.
//
// **G2 at the one boundary where a human types money.** A manager types 300; the client
// sends 30000. Getting this wrong by a factor of a hundred is the single most likely money
// bug in the product, and it is invisible until a parent is billed ₪3.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ActionBar,
  Button,
  Card,
  MoneyDisplay,
  SectionHeader,
  TextField,
  registerSlot,
} from '@studio/ui'
import type { WizardStepProps } from '@studio/ui'
import { t } from '@studio/i18n'
import type { DashboardBillingClient, PricePlanOut } from './billingClient'
import { agorotFromShekels } from './money'

/** `WIZARD_STEP_ORDER` is studio · belts · groups · prices · staff · students. */
export const PRICES_WIZARD_ORDER = 4

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
}

export function PricesWizardStep({
  locale,
  onDone,
  onSkip,
  client,
}: WizardStepProps & { client: DashboardBillingClient }) {
  const [plans, setPlans] = useState<PricePlanOut[]>([])
  const [name, setName] = useState('')
  const [sessions, setSessions] = useState('2')
  const [monthly, setMonthly] = useState('')
  const [link, setLink] = useState('')
  const [inFlight, setInFlight] = useState(false)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(() => {
    client
      .pricePlans()
      .then(setPlans)
      .catch(() => setPlans([]))
  }, [client])

  useEffect(reload, [reload])

  async function create() {
    if (inFlight || name.trim() === '' || monthly.trim() === '') return
    setInFlight(true)
    setFailed(false)
    try {
      const plan = await client.createPricePlan({
        name: name.trim(),
        sessionsPerWeek: Number(sessions),
        monthlyAmountAgorot: agorotFromShekels(monthly),
        registrationFeeAgorot: null,
        activeFrom: new Date().toISOString().slice(0, 10),
      })
      // A second call rather than a field on the create shape, because the link is the ONE
      // in-place edit `price_plan` allows and it has its own audited route. A blank box
      // sends nothing at all: NULL is a real state the badge reads, not an empty string.
      if (link.trim() !== '') {
        try {
          await client.setStandingOrderLink(plan.id, link.trim())
        } catch {
          // The plan exists and the link did not take — the server refused the host or the
          // scheme. Said out loud here, and fixable in Settings → Payments without
          // re-creating anything.
          setFailed(true)
        }
      }
      setName('')
      setMonthly('')
      setLink('')
      reload()
    } finally {
      setInFlight(false)
    }
  }

  return (
    <div className="setup-step" data-testid="wizard-step-prices">
      {/* `5e` opens with the question. The step opened with a note about standing-order
          links and never said what it was for. */}
      <SectionHeader level={3} title={t(locale, 'billing.plan.wizardTitle')} />
      <p className="setup-step__meta">{t(locale, 'billing.plan.wizardHint')}</p>
      <p className="setup-step__meta">{t(locale, 'billing.plan.linkNeverInherited')}</p>

      {plans.length > 0 ? (
        <Card>
          {plans.map((plan) => (
            <div key={plan.id} style={rowStyle} data-testid="wizard-plan-row">
              <strong style={{ flex: 1, minInlineSize: 0 }}>
                <bdi>{plan.name}</bdi>
              </strong>
              <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
              {plan.standing_order_link_url === null ? (
                <span data-testid="wizard-plan-link-missing">
                  {t(locale, 'billing.plan.linkMissing')}
                </span>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}

      <Card caption={t(locale, 'billing.plan.add')}>
        <TextField
          label={t(locale, 'billing.plan.name')}
          data-testid="wizard-plan-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label={t(locale, 'billing.plan.appliesTo')}
          data-testid="wizard-plan-sessions"
          inputMode="numeric"
          value={sessions}
          onChange={(event) => setSessions(event.target.value)}
        />
        <TextField
          label={t(locale, 'billing.plan.monthlyAmount')}
          data-testid="wizard-plan-amount"
          inputMode="decimal"
          value={monthly}
          onChange={(event) => setMonthly(event.target.value)}
        />
        <TextField
          label={t(locale, 'billing.plan.standingOrderLink')}
          hint={t(locale, 'billing.plan.linkHint')}
          data-testid="wizard-plan-link"
          inputMode="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
        />
        {failed ? (
          <p role="alert" data-testid="wizard-plan-link-error">
            {t(locale, 'billing.plan.linkRefused')}
          </p>
        ) : null}
        <Button
          variant="secondary"
          data-testid="wizard-plan-save"
          disabled={inFlight}
          onClick={() => void create()}
        >
          {t(locale, 'billing.plan.add')}
        </Button>
      </Card>

      <div style={rowStyle}>
        {/* The container never computes completeness -- the step reports its own outcome. */}
        <Button variant="primary" data-testid="wizard-prices-done" onClick={onDone}>
          {t(locale, 'common.setup.continue')}
        </Button>
        <Button variant="secondary" data-testid="wizard-prices-skip" onClick={onSkip}>
          {t(locale, 'common.setup.skip')}
        </Button>
      </div>
    
      <ActionBar
        end={
          <Button onClick={onDone}>
            {t(locale, 'common.setup.continueTo').replace(
              '{{step}}',
              t(locale, 'common.setup.step.staff'),
            )}
          </Button>
        }
        start={
          <Button onClick={onSkip} variant="ghost">
            {t(locale, 'billing.plan.later')}
          </Button>
        }
      />
    </div>
  )
}

/**
 * One `registerSlot` call, at the order `WIZARD_STEP_ORDER` gives `prices`.
 *
 * Called by the app rather than at module load, for the same reason `registerM1WizardSteps`
 * and `registerBeltsWizardStep` are: the step needs a client, and a module that registered
 * itself on import would have to reach for a global one — and would register twice under
 * HMR and in any test importing the barrel more than once.
 */
export function registerPricesWizardStep(client: DashboardBillingClient): void {
  registerSlot<WizardStepProps>('setup-wizard', {
    key: 'prices',
    order: PRICES_WIZARD_ORDER,
    render: (props: WizardStepProps) => <PricesWizardStep {...props} client={client} />,
  })
}
