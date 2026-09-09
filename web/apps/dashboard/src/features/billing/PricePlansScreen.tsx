// Dashboard artboard `5a` — מחירים ומסלולים.
//
// **A plan is never edited in place.** §5.10 and §5.15: a price change CLOSES the current
// plan and opens a new one, because a charge raised last year must still be explicable by the
// plan that was in force when it was raised. `billing.plan.versionedHint` is that rule in
// Hebrew and it belongs on the screen, not in a comment.
//
// **C11, as it stands after 2026-09-09.** `sessions_per_week` is what the club charges by,
// and there is still NO GROUP PICKER: a group-scoped plan is exactly what charged a child in
// two groups twice, at two different prices, silently and forever.
//
// There IS a class picker, on the owner's sign-off. The distinction is the whole safety
// argument — two groups of one discipline stay one charge, judo and karate bill separately —
// and it is why the control below says חוג and can never be allowed to say קבוצה.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, MoneyDisplay, SelectField, StatusChip, TextField } from '@studio/ui'
import { PlanFrequencyPicker, PlanPreview, frequencyLabel } from './PlanFrequency'
import { StandingOrderLinksPanel } from './StandingOrderLinksPanel'
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

// One plan, two lines: the facts a manager scans for (name, volume, price, since when)
// on the first, the long strong-LTR payment URL alone on the second — inline in one flex
// row it dragged the amount off screen and interleaved with the Hebrew around it
// (2026-08-30).
const planStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
}

const mutedStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
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
  /** The club's classes. Empty means the club has none yet -- the picker is then not drawn
   *  at all and every plan prices the studio, exactly as before per-class pricing. */
  classes?: readonly { id: string; name: string }[]
}

export function PricePlansScreen({
  locale,
  client,
  plans,
  onChanged,
  classes = [],
}: PricePlansScreenProps) {
  const [openPlanId, setOpenPlanId] = useState<string | null>(null)
  const [name, setName] = useState('')
  /** `undefined` means not chosen yet; `null` is a chosen open membership. */
  const [perWeek, setPerWeek] = useState<number | null | undefined>(undefined)
  const [monthly, setMonthly] = useState('')
  //: Which class this plan prices. '' until chosen, which prices the studio the way every
  //: plan did before per-class pricing — the state a club with no classes stays in.
  const [planClassId, setPlanClassId] = useState('')
  const [inFlight, setInFlight] = useState(false)

  async function create() {
    if (inFlight || perWeek === undefined) return
    setInFlight(true)
    try {
      await client.createPricePlan({
        // The frequency already names the plan, so a club with no house name for
        // "3 times a week" is not stopped by a box it must invent an answer for.
        name: name.trim() || frequencyLabel(locale, perWeek),
        sessionsPerWeek: perWeek,
        // G2 at the one boundary where a human types money.
        monthlyAmountAgorot: agorotFromShekels(monthly),
        registrationFeeAgorot: null,
        activeFrom: new Date().toISOString().slice(0, 10),
        classId: planClassId || null,
      })
      onChanged()
      setName('')
      setPerWeek(undefined)
      setMonthly('')
      setPlanClassId('')
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
              style={planStyle}
              data-testid="plan-row"
              onClick={() => setOpenPlanId(plan.id)}
            >
              <div style={rowStyle}>
                <strong style={{ flex: 1, minInlineSize: 0 }}>
                  <bdi>{plan.name}</bdi>
                </strong>
                {/* C11 — the volume the club prices by, as a sentence rather than a bare
                    number. Not a group. */}
                <span data-testid="plan-volume">
                  {frequencyLabel(locale, plan.sessions_per_week)}
                </span>
                <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
                {plan.active_to ? (
                  <span data-testid="plan-closed" style={mutedStyle}>
                    {t(locale, 'billing.plan.activeTo')} {plan.active_to}
                  </span>
                ) : (
                  <span data-testid="plan-current" style={mutedStyle}>
                    {t(locale, 'billing.plan.activeFrom')} {plan.active_from}
                  </span>
                )}
              </div>
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

      {/* The same three questions the setup wizard asks, in the same order and with the
          same controls. This screen kept the original `חל על` number box after the wizard's
          was rebuilt, so one club saw two designs for one decision (reported 2026-08-29). */}
      <Card caption={t(locale, 'billing.plan.add')}>
        <PlanFrequencyPicker locale={locale} onChange={setPerWeek} value={perWeek} />
        {classes.length > 0 ? (
          // חוג, and never קבוצה. A group-scoped plan is the shape that billed a child in
          // two groups twice; a class-scoped one is what the owner asked for. The words are
          // load-bearing, which is why this comment sits on the control rather than in the
          // header alone.
          <SelectField
            data-testid="plan-class"
            hint={t(locale, 'billing.plan.classHint')}
            label={t(locale, 'billing.plan.class')}
            onChange={(event) => setPlanClassId(event.target.value)}
            value={planClassId}
          >
            <option value="">{t(locale, 'billing.plan.classAll')}</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </SelectField>
        ) : null}
        <TextField
          hint={t(locale, 'billing.plan.monthlyHint')}
          inputMode="decimal"
          label={t(locale, 'billing.plan.monthlyAmount')}
          onChange={(event) => setMonthly(event.target.value)}
          value={monthly}
        />
        <PlanPreview locale={locale} name={name} perWeek={perWeek} shekels={monthly} />
        <details className="plan-extras">
          <summary>{t(locale, 'billing.plan.moreOptions')}</summary>
          <TextField
            hint={t(locale, 'billing.plan.nameHint')}
            label={t(locale, 'billing.plan.name')}
            onChange={(event) => setName(event.target.value)}
            placeholder={perWeek === undefined ? undefined : frequencyLabel(locale, perWeek)}
            value={name}
          />
        </details>
        <Button
          data-testid="plan-save"
          disabled={inFlight || perWeek === undefined || monthly.trim() === ''}
          onClick={create}
          variant="primary"
        >
          {t(locale, 'billing.plan.add')}
        </Button>
      </Card>

      {/* The canonical link editor, mounted where the links are read. It lived only under
          Settings → Payments, and a manager staring at their plans had no way to fix a
          link from here (2026-08-30). Same component both places, one design. */}
      <StandingOrderLinksPanel locale={locale} client={client} />
    </div>
  )
}
