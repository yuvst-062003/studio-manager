// §5.15 step 5 — next year's prices.
//
// **Old plans are CLOSED, not overwritten, and that sentence has to be on the screen.**
// `apply_prices` delegates to `CatalogueService.close_price_plan`, which sets `active_to` on
// the incumbent and opens a successor from the day the year starts. Editing
// `monthly_amount_agorot` in place "would silently restate what every family was charged
// last year, including on statements they have already read". A manager typing a new number
// into a box that sits beside the old one will assume they are editing it unless told
// otherwise — so `prices.intro` and `prices.keepsHistory` are rendered above the table, not
// tucked into a tooltip.
//
// **Money is agorot, everywhere.** The current amount renders through `MoneyDisplay`, which
// isolates the digits with `<bdi>` so `-320₪` in a Hebrew row cannot come out as `320₪-`.
// The new amount is typed in shekels and converted by `parseShekels`, which does integer
// arithmetic on the two halves of the string — `parseFloat('8.11') * 100` is
// `810.9999999999999`, and truncating that is one agora short on a real price.
//
// `registration_fee_agorot` is omitted rather than defaulted when the box is left empty.
// Omitted means *inherit the current fee*; `0` means *there is no fee*. `PlanRepricing`'s
// docstring calls that distinction real money, and it is: sending `0` for a blank box would
// quietly waive every studio's registration fee.
import { useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, MoneyDisplay, StatusChip, TextField } from '@studio/ui'
import { parseShekels } from '@studio/core'
import { t } from '@studio/i18n'
import { fill } from './client'
import type { BulkOutcome, PlanRepricing, PricePlanRow, RolloverClient } from './client'
import { BulkOutcomePanel } from './BulkOutcomePanel'
import { ConfirmDialog } from './ConfirmDialog'
import type { RolloverStepProps } from './types'
import {
  StepActions,
  captionStyle,
  cellStyle,
  errorStyle,
  headCellStyle,
  introStyle,
  noteStyle,
  scrollStyle,
  stepStyle,
  tableStyle,
} from './StepShell'

export type PricesStepProps = RolloverStepProps & {
  client: RolloverClient
  trainingYearId: string
  /** The new year's first day — a plan opened here is priced FOR that year. */
  yearStartsOn: string
  onChanged: () => void
}

/** `''` → not repriced. Anything unparseable is an error rather than a silent zero. */
function agorotOrNull(text: string): number | null {
  if (text.trim() === '') return null
  try {
    return parseShekels(text)
  } catch {
    return null
  }
}

export function PricesStep({
  locale,
  status,
  onDone,
  onSkip,
  client,
  trainingYearId,
  yearStartsOn,
  onChanged,
}: PricesStepProps) {
  const [plans, setPlans] = useState<PricePlanRow[] | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [fees, setFees] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  // Fix 2 (2026-08-28) — the create half. This step could only REPRICE, so a first-year
  // club arrived to `אין מסלולים פתוחים` and a dead end.
  const [newName, setNewName] = useState('')
  const [newVolume, setNewVolume] = useState('2')
  const [newMonthly, setNewMonthly] = useState('')
  const [newFee, setNewFee] = useState('')
  const [createState, setCreateState] = useState<'idle' | 'busy' | 'created' | 'failed'>('idle')
  const [plansVersion, setPlansVersion] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      const loaded = await client.listPricePlans()
      if (live) setPlans(loaded)
    })()
    return () => {
      live = false
    }
  }, [client, plansVersion])

  async function createPlan() {
    const monthly = agorotOrNull(newMonthly)
    if (!newName.trim() || monthly === null) return
    setCreateState('busy')
    try {
      await client.createPricePlan({
        name: newName.trim(),
        sessions_per_week: Number(newVolume) || 1,
        monthly_amount_agorot: monthly,
        registration_fee_agorot: agorotOrNull(newFee),
        active_from: yearStartsOn,
      })
      setNewName('')
      setNewMonthly('')
      setNewFee('')
      setCreateState('created')
      setPlansVersion((n) => n + 1)
      onChanged()
    } catch {
      setCreateState('failed')
    }
  }

  const repricings = useMemo<PlanRepricing[]>(() => {
    const out: PlanRepricing[] = []
    for (const plan of plans ?? []) {
      const typed = amounts[plan.id] ?? ''
      if (typed.trim() === '') continue
      const monthly = agorotOrNull(typed)
      if (monthly === null) continue
      const feeText = fees[plan.id] ?? ''
      const fee = agorotOrNull(feeText)
      out.push({
        plan_id: plan.id,
        monthly_amount_agorot: monthly,
        // Omitted, not zero. See the module header.
        ...(fee === null ? {} : { registration_fee_agorot: fee }),
      })
    }
    return out
  }, [amounts, fees, plans])

  function submit() {
    const typedButUnparseable = (plans ?? []).some((plan) => {
      const typed = amounts[plan.id] ?? ''
      return typed.trim() !== '' && agorotOrNull(typed) === null
    })
    if (typedButUnparseable) {
      setError(t(locale, 'schedule.rollover.prices.badAmount'))
      return
    }
    if (repricings.length === 0) {
      setError(t(locale, 'schedule.rollover.prices.nothingToApply'))
      return
    }
    setError(null)
    setConfirming(true)
  }

  async function apply() {
    setConfirming(false)
    setBusy(true)
    try {
      const result = await client.applyPrices(trainingYearId, { repricings })
      setOutcome(result)
      setAmounts({})
      setFees({})
      setPlans(await client.listPricePlans())
      onChanged()
    } catch {
      setError(t(locale, 'schedule.rollover.prices.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby="rollover-prices-title"
      style={stepStyle}
      data-testid="rollover-step-prices"
    >
      <h2 id="rollover-prices-title">{t(locale, 'schedule.rollover.prices.title')}</h2>
      {/* The rule, in the manager's language, where they are about to change a price. */}
      <p style={introStyle} data-testid="rollover-prices-versioned">
        {t(locale, 'schedule.rollover.prices.intro')}
      </p>
      <p style={noteStyle}>{t(locale, 'schedule.rollover.prices.keepsHistory')}</p>

      {plans !== null && plans.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.rollover.prices.empty')} />
      ) : null}

      {/* The create half — always offered, because a club adding a track mid-rollover is
          as real as a club opening its first. */}
      <fieldset data-testid="rollover-prices-create">
        <legend>{t(locale, 'schedule.rollover.prices.newTitle')}</legend>
        <p style={noteStyle}>{t(locale, 'schedule.rollover.prices.newHint')}</p>
        <TextField
          label={t(locale, 'schedule.rollover.prices.newName')}
          data-testid="rollover-new-plan-name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <TextField
          label={t(locale, 'schedule.rollover.prices.newVolume')}
          data-testid="rollover-new-plan-volume"
          type="number"
          min={1}
          max={7}
          value={newVolume}
          onChange={(event) => setNewVolume(event.target.value)}
        />
        <TextField
          label={t(locale, 'schedule.rollover.prices.newMonthly')}
          data-testid="rollover-new-plan-monthly"
          inputMode="decimal"
          value={newMonthly}
          onChange={(event) => setNewMonthly(event.target.value)}
        />
        <TextField
          label={t(locale, 'schedule.rollover.prices.newFee')}
          data-testid="rollover-new-plan-fee"
          inputMode="decimal"
          value={newFee}
          onChange={(event) => setNewFee(event.target.value)}
        />
        <Button
          data-testid="rollover-new-plan-submit"
          disabled={createState === 'busy' || !newName.trim() || agorotOrNull(newMonthly) === null}
          onClick={() => void createPlan()}
        >
          {t(locale, 'schedule.rollover.prices.newSubmit')}
        </Button>
        {createState === 'created' ? (
          <p role="status" data-testid="rollover-new-plan-created">
            {t(locale, 'schedule.rollover.prices.newCreated')}
          </p>
        ) : null}
        {createState === 'failed' ? (
          <p role="alert" style={errorStyle} data-testid="rollover-new-plan-failed">
            {t(locale, 'schedule.rollover.prices.newFailed')}
          </p>
        ) : null}
        <p style={noteStyle}>
          <a href="#/prices">{t(locale, 'schedule.rollover.prices.fullScreen')}</a>
        </p>
      </fieldset>

      {plans !== null && plans.length > 0 ? (
        <div style={scrollStyle}>
          <table style={tableStyle}>
            <caption style={captionStyle}>{t(locale, 'schedule.rollover.prices.caption')}</caption>
            <thead>
              <tr>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.prices.colPlan')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.prices.colCurrent')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.prices.colNew')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.prices.colFee')}
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} data-testid="rollover-plan-row">
                  <th scope="row" style={cellStyle}>
                    {plan.name}
                    {/* §3.2 where it BITES. Repricing closes this plan and opens a
                        successor with a deliberately NULL link -- a payment link charges a
                        fixed amount, so inheriting it would sign every family up at last
                        year's price. The manager would otherwise leave this step with
                        every link gone and no reason to suspect it. */}
                    {plan.standing_order_link_url === null && plan.active_to === null ? (
                      <span data-testid={`rollover-plan-link-missing-${plan.id}`}>
                        <StatusChip
                          status="pending"
                          label={t(locale, 'billing.plan.linkMissing')}
                        />
                      </span>
                    ) : null}
                  </th>
                  <td style={cellStyle} data-testid={`rollover-plan-current-${plan.id}`}>
                    <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
                  </td>
                  <td style={cellStyle}>
                    <TextField
                      label={fill(t(locale, 'schedule.rollover.prices.newAmountLabel'), {
                        name: plan.name,
                      })}
                      data-testid={`rollover-plan-amount-${plan.id}`}
                      inputMode="decimal"
                      value={amounts[plan.id] ?? ''}
                      onChange={(event) =>
                        setAmounts((current) => ({ ...current, [plan.id]: event.target.value }))
                      }
                    />
                  </td>
                  <td style={cellStyle}>
                    <TextField
                      label={fill(t(locale, 'schedule.rollover.prices.newFeeLabel'), {
                        name: plan.name,
                      })}
                      hint={t(locale, 'schedule.rollover.prices.feeHint')}
                      data-testid={`rollover-plan-fee-${plan.id}`}
                      inputMode="decimal"
                      value={fees[plan.id] ?? ''}
                      onChange={(event) =>
                        setFees((current) => ({ ...current, [plan.id]: event.target.value }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={errorStyle} data-testid="rollover-prices-error">
          {error}
        </p>
      ) : null}

      {outcome ? (
        <BulkOutcomePanel locale={locale} outcome={outcome} testId="rollover-prices-outcome" />
      ) : null}

      {confirming ? (
        <ConfirmDialog
          locale={locale}
          titleId="rollover-prices-confirm-title"
          testId="rollover-prices-confirm"
          title={t(locale, 'schedule.rollover.prices.confirmTitle')}
          body={fill(t(locale, 'schedule.rollover.prices.confirmBody'), {
            count: repricings.length,
          })}
          confirmLabel={t(locale, 'schedule.rollover.prices.confirm')}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void apply()}
        />
      ) : null}

      <div>
        <Button data-testid="rollover-prices-apply" disabled={busy} onClick={() => submit()}>
          {t(locale, 'schedule.rollover.prices.apply')}
        </Button>
      </div>

      <StepActions
        locale={locale}
        stepId="prices"
        status={status}
        onDone={onDone}
        onSkip={onSkip}
      />
    </section>
  )
}
