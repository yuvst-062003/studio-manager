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
import {
  Button,
  Card,
  EmptyState,
  MoneyDisplay,
  PageHeader,
  SelectField,
  StatusChip,
  TextField,
} from '@studio/ui'
import { PlanFrequencyPicker, PlanPreview, frequencyLabel } from './PlanFrequency'
import { StandingOrderLinksPanel } from './StandingOrderLinksPanel'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardBillingClient, PricePlanOut } from './billingClient'
import { agorotFromShekels } from './money'
import { groupByClass } from './byClass'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-5)',
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

/** A class heading over its own plans. Quiet: it separates, it does not shout. */
/** The unfiled heading DOES shout — those plans can be given to nobody. */
const warnHeadingStyle: CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  color: 'var(--danger)',
  marginBlock: 'var(--space-4) var(--space-2)',
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

  //: Which plan is being filed under a class right now, and whether the last attempt
  //: failed. Keyed by plan id rather than one boolean: a manager filing three stale plans
  //: does them one after another, and a shared flag would disable all three controls.
  const [filing, setFiling] = useState<string | null>(null)
  const [fileFailed, setFileFailed] = useState(false)

  // Grouped for display, in the club's own class order.
  const { unfiled, groups: grouped } = groupByClass(plans, classes)

  // Which write failed, or null. One piece of state rather than two booleans: the two
  // never happen at once, and two flags is how a screen ends up showing both messages.
  const [writeFailed, setWriteFailed] = useState<'create' | 'close' | null>(null)

  async function filePlan(planId: string, classId: string) {
    if (!classId || filing !== null) return
    setFiling(planId)
    setFileFailed(false)
    try {
      await client.setPricePlanClass(planId, classId)
      onChanged()
    } catch {
      setFileFailed(true)
    } finally {
      setFiling(null)
    }
  }

  /** One plan, as a card. Extracted so the grouped and ungrouped layouts render the same
   *  card rather than two copies that drift apart.
   *
   *  **A `<button>`, not a `<div onClick>` (checkpoint 10).** It opens the close-card, which
   *  is the only way a price is ever changed — and as a div it was unreachable by keyboard,
   *  invisible to a screen reader as a control, and had no focus ring. `inert-buttons.test.ts`
   *  could not have caught it either: that guard checks `<Button>`s, and this was not one.
   *
   *  Its accessible name says what pressing it DOES. "500 ₪" read out alone tells a screen
   *  reader user nothing about the fact that this opens a price change. */
  const planCard = (plan: PricePlanOut) => (
    <button
      key={plan.id}
      type="button"
      className="plan-card"
      data-closed={plan.active_to ? 'true' : undefined}
      data-testid="plan-row"
      aria-label={`${t(locale, 'billing.plan.closeCurrent')} — ${plan.name}`}
      onClick={() => setOpenPlanId(plan.id)}
    >
      <span className="plan-card__row">
        <span className="plan-card__name">
          <bdi>{plan.name}</bdi>
        </span>
        <span className="plan-card__amount">
          <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
        </span>
      </span>

      <span className="plan-card__meta">
        {/* C11 — the volume the club prices by, as a sentence rather than a bare number.
            Not a group. */}
        <span data-testid="plan-volume">{frequencyLabel(locale, plan.sessions_per_week)}</span>
        {plan.active_to ? (
          <span data-testid="plan-closed">
            {t(locale, 'billing.plan.activeTo')} {plan.active_to}
          </span>
        ) : (
          <span data-testid="plan-current">
            {t(locale, 'billing.plan.activeFrom')} {plan.active_from}
          </span>
        )}
      </span>

      {/* §4 -- the FULL url, never a "link set" tick: a typo in a payment page has to be
          visible without clicking it. And the missing case is badged only on an ACTIVE plan;
          a closed plan's link is dead by definition, so badging it would put a permanent
          unfixable warning on every retired plan. */}
      {plan.standing_order_link_url ? (
        <span data-testid="plan-link" style={urlStyle}>
          <bdi>{plan.standing_order_link_url}</bdi>
        </span>
      ) : plan.active_to === null ? (
        <span data-testid="plan-link-missing">
          <StatusChip status="pending" label={t(locale, 'billing.plan.linkMissing')} />
        </span>
      ) : null}
    </button>
  )

  async function create() {
    if (inFlight || perWeek === undefined) return
    setInFlight(true)
    setWriteFailed(null)
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
    } catch {
      // §3.20's named gap. There was no `catch` at all, so a failed create rejected
      // unhandled and the form simply appeared to do nothing — on a screen where the thing
      // that failed is a PRICE. The fields are NOT cleared: a retry must not mean retyping
      // an amount the manager already typed once.
      setWriteFailed('create')
    } finally {
      setInFlight(false)
    }
  }

  return (
    <div style={columnStyle} data-testid="price-plans">
      {/* The versioning rule as the page's own subtitle. It was already on the close-card,
          where a manager reads it only after deciding to change a price; saying it here too
          costs nothing and is the one fact that explains why the list keeps closed plans. */}
      <PageHeader
        subtitle={t(locale, 'billing.plan.versionedHint')}
        title={t(locale, 'billing.plan.title')}
        titleId="price-plans-title"
      />

      {writeFailed ? (
        <p className="plans-error" data-testid="plan-write-failed" role="alert">
          {t(
            locale,
            writeFailed === 'create' ? 'billing.plan.createFailed' : 'billing.plan.closeFailed',
          )}
        </p>
      ) : null}

      {plans.length === 0 ? (
        <EmptyState title={t(locale, 'billing.plan.empty')} />
      ) : (
        <Card>
          {/* **An unfiled plan is broken, not club-wide.** After "a class can have no
              all-classes plan", a plan with no class can be assigned to NO child — the
              price editor will not offer it. Every plan a club created before per-class
              pricing is in that state, and this is the only screen that says so and the
              only one that can repair it, which is why the filing control is on the row
              rather than in a settings page. */}
          {unfiled.length > 0 && classes.length > 0 ? (
            <section aria-labelledby="plans-unfiled" data-testid="plans-unfiled">
              <h2 id="plans-unfiled" style={warnHeadingStyle}>
                ⚠ {t(locale, 'billing.byClass.unfiled')}
              </h2>
              <p style={mutedStyle}>{t(locale, 'billing.byClass.unfiledPlans')}</p>
              {unfiled.map((plan) => (
                // The card and ITS filing select in one box. Laid out as a plain list they
                // alternated — card, select, card, select — and the select read as belonging
                // to the plan below it as easily as the one above. The select cannot go
                // inside the card: the card is a `<button>`, and a `<select>` inside one is
                // invalid and unoperable.
                <div className="plan-unfiled" key={plan.id}>
                  {planCard(plan)}
                  <SelectField
                    data-testid={`plan-file-${plan.id}`}
                    disabled={filing === plan.id}
                    label={`${t(locale, 'billing.byClass.fileHere')} — ${plan.name}`}
                    onChange={(event) => void filePlan(plan.id, event.target.value)}
                    value=""
                  >
                    <option value="">
                      {filing === plan.id
                        ? t(locale, 'billing.byClass.filing')
                        : t(locale, 'billing.byClass.fileHere')}
                    </option>
                    {classes.map((klass) => (
                      <option key={klass.id} value={klass.id}>
                        {klass.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
              ))}
              {fileFailed ? (
                <p role="alert" data-testid="plan-file-failed" style={mutedStyle}>
                  {t(locale, 'billing.byClass.fileFailed')}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* A club with no classes yet gets one plain list: a heading over every row, or a
              warning nobody can act on, would both be noise before any class exists. */}
          {classes.length === 0 ? (
            <div className="plan-list">{plans.map((plan) => planCard(plan))}</div>
          ) : (
            grouped.map((group) => (
              <section
                key={group.classId}
                aria-labelledby={`plans-class-${group.classId}`}
                data-testid={`plans-class-${group.classId}`}
              >
                <h2 id={`plans-class-${group.classId}`} className="plan-class-heading">
                  <bdi>{group.className}</bdi>
                </h2>
                <div className="plan-list">{group.rows.map((plan) => planCard(plan))}</div>
              </section>
            ))
          )}
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
              setWriteFailed(null)
              try {
                await client.closePricePlan(
                  openPlanId,
                  new Date().toISOString().slice(0, 10),
                  agorotFromShekels(monthly),
                )
              } catch {
                // The same gap as `create`, on the more dangerous of the two: §5.10 versions
                // a plan so a price change never rewrites history, and closing one IS how a
                // price change is done. A silent failure here reads as "the new price is
                // live" while every charge keeps being raised at the old one.
                setWriteFailed('close')
                return
              }
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
            {/* **Not "כל החוגים" any more.** The owner's rule is per class ("a class can
                have no all-classes plan"), so a plan created without one can be assigned to
                nobody — it would land straight in the unfiled warning above, created by
                this very form. A placeholder that cannot be submitted says so before the
                plan exists, rather than after. */}
            <option value="">{t(locale, 'billing.plan.classChoose')}</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </SelectField>
        ) : null}
        <TextField
          data-testid="plan-monthly"
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
          // A club with no classes yet — the setup wizard — has nothing to choose, so the
          // picker is not drawn and this clause cannot block it.
          disabled={
            inFlight ||
            perWeek === undefined ||
            monthly.trim() === '' ||
            (classes.length > 0 && planClassId === '')
          }
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
