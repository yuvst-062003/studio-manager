// Step 3 — תמחור ומסלולים. The plans this class is priced by.
//
// **Money is integer agorot and is never divided outside a formatter.** The manager types
// shekels because that is what a price is to them; `toAgorot` is the only conversion, and
// `MoneyDisplay` is the only renderer.
//
// The prototype's step 3 is called "הוראות קבע" and offers a standing order as something the
// wizard creates. **It cannot be.** Our provider cannot create a הוראת קבע programmatically —
// a `CLAUDE.md` gotcha that predates this port and §4 rule 7 — so what exists is a LINK to
// the provider's own page, filed against the plan, and Settings → Payments is where it is
// filled in. This step says so rather than drawing a switch that would configure nothing.
//
// Two more prototype fields have no column and are not drawn: `cancellationNoticeDays` and
// `freezeDaysAllowed`. A freeze is a real feature with its own dates on the enrolment; a
// club-wide allowance of days is not what it stores.
import { useEffect, useState } from 'react'
import { Button, EmptyState, MoneyDisplay, TextField } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { ClassStepProps } from '../ClassWizard'
import type { WizardPlan } from '../client'

/** Shekels in the box, agorot on the wire. The one conversion, in one place. */
function toAgorot(shekels: string): number {
  return Math.round(Number(shekels) * 100)
}

export function PricesStep({ locale, client, classId, onSaved }: ClassStepProps) {
  const [plans, setPlans] = useState<WizardPlan[] | null>(null)
  const [name, setName] = useState('')
  const [perWeek, setPerWeek] = useState('')
  const [monthly, setMonthly] = useState('')
  const [registration, setRegistration] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!classId) return
    let live = true
    void client
      .listPlans()
      .then((rows) => {
        // This class's plans, and only the OPEN ones: §5.10 versions a plan so a price
        // change never rewrites history, and a closed plan is history the wizard must not
        // offer back for editing.
        if (live) setPlans(rows.filter((row) => row.class_id === classId && row.active_to === null))
      })
      .catch(() => live && setError(t(locale, 'common.loadFailed.body')))
    return () => {
      live = false
    }
  }, [classId, client, locale])

  const add = async () => {
    if (!classId) return
    setBusy(true)
    setError(null)
    try {
      const created = await client.createPlan({
        name: name.trim(),
        // C11 — 'פעמיים בשבוע' is 2 and **null is open membership**. An empty box is the
        // unlimited plan, not a zero.
        sessions_per_week: perWeek === '' ? null : Number(perWeek),
        monthly_amount_agorot: toAgorot(monthly),
        registration_fee_agorot: toAgorot(registration),
        active_from: new Date().toISOString().slice(0, 10),
        class_id: classId,
      })
      setPlans((current) => [...(current ?? []), created])
      setName('')
      setPerWeek('')
      setMonthly('')
      setRegistration('0')
    } catch {
      setError(t(locale, 'schedule.wizard.prices.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (!classId) return <p>{t(locale, 'schedule.wizard.needsClass')}</p>

  return (
    <div className="wizard-step">
      <p className="wizard-step__lead">{t(locale, 'schedule.wizard.prices.lead')}</p>

      {plans && plans.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.wizard.prices.empty')} />
      ) : null}

      <ul className="wizard-list" data-testid="wizard-plans">
        {(plans ?? []).map((plan) => (
          <li className="wizard-list__item" data-testid={`wizard-plan-${plan.id}`} key={plan.id}>
            <span className="wizard-list__name">{plan.name}</span>
            <span className="wizard-list__meta">
              {plan.sessions_per_week === null
                ? t(locale, 'schedule.wizard.prices.unlimited')
                : fill(t(locale, 'billing.plan.perWeek'), { count: plan.sessions_per_week })}
            </span>
            <MoneyDisplay agorot={plan.monthly_amount_agorot} />
          </li>
        ))}
      </ul>

      {/* §4 rule 7, stated where a manager would otherwise look for the switch. */}
      <p className="wizard-step__note" data-testid="wizard-prices-standing-order">
        {t(locale, 'schedule.wizard.prices.standingOrderNote')}
      </p>

      <fieldset className="wizard-step__box">
        <legend>{t(locale, 'schedule.wizard.prices.addTitle')}</legend>
        <div className="wizard-step__row">
          <TextField
            data-testid="wizard-plan-name"
            label={t(locale, 'schedule.wizard.prices.name')}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <TextField
            data-testid="wizard-plan-per-week"
            hint={t(locale, 'schedule.wizard.prices.perWeekHint')}
            label={t(locale, 'schedule.wizard.prices.perWeek')}
            onChange={(event) => setPerWeek(event.target.value)}
            type="number"
            value={perWeek}
          />
          <TextField
            data-testid="wizard-plan-monthly"
            label={t(locale, 'schedule.wizard.prices.monthly')}
            onChange={(event) => setMonthly(event.target.value)}
            type="number"
            value={monthly}
          />
          <TextField
            data-testid="wizard-plan-registration"
            label={t(locale, 'schedule.wizard.prices.registration')}
            onChange={(event) => setRegistration(event.target.value)}
            type="number"
            value={registration}
          />
          <Button
            data-testid="wizard-plan-add"
            disabled={busy || name.trim() === '' || monthly === ''}
            onClick={() => void add()}
            variant="secondary"
          >
            {t(locale, 'schedule.wizard.prices.add')}
          </Button>
        </div>
      </fieldset>

      {error ? (
        <p className="wizard-step__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="wizard-step__actions">
        <Button data-testid="wizard-prices-next" onClick={() => onSaved()}>
          {t(locale, 'schedule.wizard.next')}
        </Button>
      </div>
    </div>
  )
}
