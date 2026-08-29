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

/** `WIZARD_STEP_ORDER` is studio · groups · belts · prices · staff · students. */
export const PRICES_WIZARD_ORDER = 4

/**
 * How often a plan lets a student train, as a choice rather than a number box.
 *
 * `null` is open membership — `price_plan.sessions_per_week` is nullable and its own
 * docstring gives this club's ladder: "300 → 0, 400 → 1, 550 → NULL = unlimited".
 *
 * This was a bare `TextField` labelled חל על ("applies to") bound to `sessionsPerWeek`,
 * with no unit and no hint of what a good answer looked like. A manager reported the step
 * as not understandable and described, unprompted, exactly the ladder below — which is
 * what the field always meant and never said (2026-08-29).
 */
const FREQUENCIES: readonly (number | null)[] = [1, 2, 3, 4, 5, null]

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
}

/** "3 אימונים בשבוע", or "מנוי חופשי" for the open plan. */
function frequencyLabel(locale: WizardStepProps['locale'], perWeek: number | null): string {
  return perWeek === null
    ? t(locale, 'billing.plan.unlimited')
    : t(locale, 'billing.plan.perWeek').replace('{{count}}', String(perWeek))
}

export function PricesWizardStep({
  locale,
  onDone,
  onSkip,
  client,
}: WizardStepProps & { client: DashboardBillingClient }) {
  const [plans, setPlans] = useState<PricePlanOut[]>([])
  const [name, setName] = useState('')
  /** `undefined` means "not chosen yet"; `null` is a chosen open membership. */
  const [perWeek, setPerWeek] = useState<number | null | undefined>(undefined)
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
    if (inFlight || perWeek === undefined || monthly.trim() === '') return
    setInFlight(true)
    setFailed(false)
    try {
      const plan = await client.createPricePlan({
        // The frequency already names the plan — "3 אימונים בשבוע" — so a manager who has
        // no house name for it is not stopped by a required box they must invent an
        // answer for. Typing one still wins.
        name: name.trim() || frequencyLabel(locale, perWeek),
        sessionsPerWeek: perWeek,
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
      setPerWeek(undefined)
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
              {/* What the plan is FOR, beside what it costs. The list showed a name and an
                  amount, so two plans differing only in training volume looked identical. */}
              <span className="plan-row__freq">
                {frequencyLabel(locale, plan.sessions_per_week)}
              </span>
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
        {/* ① how often — the question the step is actually about. A plan is priced by
            training volume (C11), so this is chosen before anything else and every other
            field reads as a consequence of it. */}
        <fieldset className="plan-frequency" data-testid="wizard-plan-frequency">
          <legend className="plan-frequency__legend">
            {t(locale, 'billing.plan.howOften')}
          </legend>
          <div className="plan-frequency__options">
            {FREQUENCIES.map((option) => (
              <Button
                data-selected={perWeek === option}
                data-testid={`wizard-plan-freq-${option ?? 'open'}`}
                key={String(option)}
                onClick={() => setPerWeek(option)}
                variant={perWeek === option ? 'secondary' : 'ghost'}
              >
                {frequencyLabel(locale, option)}
              </Button>
            ))}
          </div>
        </fieldset>

        {/* ② how much. */}
        <TextField
          data-testid="wizard-plan-amount"
          hint={t(locale, 'billing.plan.monthlyHint')}
          inputMode="decimal"
          label={t(locale, 'billing.plan.monthlyAmount')}
          onChange={(event) => setMonthly(event.target.value)}
          value={monthly}
        />

        {/* The plan as one sentence, before it is created. "400 – 3 times a week" is how
            the club talks about it, and it is the only place the two answers meet. */}
        {perWeek !== undefined && monthly.trim() !== '' ? (
          <p className="plan-preview" data-testid="wizard-plan-preview">
            <strong>{name.trim() || frequencyLabel(locale, perWeek)}</strong>
            <span>·</span>
            <MoneyDisplay
              agorot={agorotFromShekels(monthly)}
              label={t(locale, 'billing.plan.monthlyAmount')}
            />
            <span>{t(locale, 'billing.plan.perMonth')}</span>
          </p>
        ) : null}

        {/* ③ the two answers most clubs leave alone. Folded away so the step is two
            questions, not four boxes of equal weight. */}
        <details className="plan-extras">
          <summary>{t(locale, 'billing.plan.moreOptions')}</summary>
          <TextField
            data-testid="wizard-plan-name"
            hint={t(locale, 'billing.plan.nameHint')}
            label={t(locale, 'billing.plan.name')}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              perWeek === undefined ? undefined : frequencyLabel(locale, perWeek)
            }
            value={name}
          />
          <TextField
            data-testid="wizard-plan-link"
            hint={t(locale, 'billing.plan.linkHint')}
            inputMode="url"
            label={t(locale, 'billing.plan.standingOrderLink')}
            onChange={(event) => setLink(event.target.value)}
            value={link}
          />
        </details>
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
