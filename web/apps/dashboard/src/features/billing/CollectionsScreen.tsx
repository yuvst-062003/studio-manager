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
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { apiFetch, downloadFile, fill, formatDateInStudioZone, whatsappShareUrl } from '@studio/core'
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  Icon,
  MoneyDisplay,
  PercentDisplay,
  StatusChip,
} from '@studio/ui'
import type { IconName } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type {
  BillingRunOut,
  ChargeOut,
  DashboardBillingClient,
  UnpricedStudentOut,
} from './billingClient'
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

/** `3e`'s three aging buckets, plus "everything". The prototype's filter pills carry a
 *  live count each, which is the half that makes them worth having: a manager who cannot
 *  see that 60+ holds four households has no reason to press it. */
const BUCKETS = ['all', '0_30', '31_60', '60_plus'] as const

type Bucket = (typeof BUCKETS)[number]

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
  const [bucket, setBucket] = useState<Bucket>('all')
  // Counted off the households already on screen, so a pill never offers a filter that
  // yields nothing and the numbers cannot disagree with the list under them.
  const counts = useMemo(() => {
    const tally: Record<Bucket, number> = { all: households.length, '0_30': 0, '31_60': 0, '60_plus': 0 }
    for (const row of households) tally[ageBucket(row.daysOverdue)] += 1
    return tally
  }, [households])
  const shown = useMemo(
    () => (bucket === 'all' ? households : households.filter((row) => ageBucket(row.daysOverdue) === bucket)),
    [bucket, households],
  )
  const shownTotal = useMemo(
    () => shown.reduce((sum, row) => sum + row.balanceAgorot, 0),
    [shown],
  )
  // F7a — the reminder outcome per household, so 'sent' and 'we did not send that'
  // never look alike. `quiet` renders the 21:00 rule; `recent` the 24h rate limit.
  const [reminded, setReminded] = useState<Record<string, 'sent' | 'recent' | 'quiet' | 'failed'>>({})
  const [exportFailed, setExportFailed] = useState(false)
  // Read by the SCREEN and not passed in as a prop, unlike `households`: it is one small
  // list with no cross-filtering, and threading it through every caller of this screen
  // would make three of them carry a fetch for a panel they do not otherwise touch.
  const [unpriced, setUnpriced] = useState<readonly UnpricedStudentOut[]>([])
  useEffect(() => {
    let live = true
    // A failed read leaves the panel absent rather than showing an error: this is a
    // secondary list on a screen whose primary job is the debt table, and a broken box
    // above it would read as the debt being broken.
    void client
      .unpricedStudents()
      .then((rows) => live && setUnpriced(rows))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client])

  async function sendReminders(payerIds: string[]) {
    const response = await apiFetch('/api/v1/reminders/debt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer_person_ids: payerIds }),
    })
    if (response.status === 409) {
      setReminded((current) => ({
        ...current,
        ...Object.fromEntries(payerIds.map((id) => [id, 'quiet' as const])),
      }))
      return
    }
    if (!response.ok) {
      setReminded((current) => ({
        ...current,
        ...Object.fromEntries(payerIds.map((id) => [id, 'failed' as const])),
      }))
      return
    }
    const body = (await response.json()) as { sent: number; skipped_recent: number }
    // One request for many households answers with counts; per-row truth needs the
    // rate limit read back. 'sent' when everything went, 'recent' when nothing did,
    // and the mixed case marks all as sent — the server refused only the recent ones.
    const outcome = body.sent === 0 && body.skipped_recent > 0 ? ('recent' as const) : ('sent' as const)
    setReminded((current) => ({
      ...current,
      ...Object.fromEntries(payerIds.map((id) => [id, outcome])),
    }))
  }
  const [confirmingRun, setConfirmingRun] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<BillingRunOut | null>(null)
  const [payingFor, setPayingFor] = useState<HouseholdRow | null>(null)
  // The household drill (2026-08-30). 3e's no-expansion note recorded a GAP, not a rule;
  // the owner asked for the row to answer "what exactly is owed" — which is also the one
  // place a parent's shop-order note (riding the charge label) reaches a manager's eyes.
  const [detailsFor, setDetailsFor] = useState<string | null>(null)
  const [detailCharges, setDetailCharges] = useState<Record<string, readonly ChargeOut[]>>({})
  const toggleDetails = (payerPersonId: string) => {
    setDetailsFor((current) => (current === payerPersonId ? null : payerPersonId))
    if (!detailCharges[payerPersonId]) {
      void client
        .openCharges(payerPersonId)
        .then((items) =>
          setDetailCharges((previous) => ({ ...previous, [payerPersonId]: items })),
        )
        .catch(() => undefined)
    }
  }


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
        {/* §2.3 — the money door absorbs `#/prices`. A price plan is the thing a charge is
            made FROM, so it belongs beside the charges rather than in a settings rail,
            which is where its only other link used to be. */}
        <a
          className="studio-btn"
          data-testid="collections-prices-link"
          data-variant="ghost"
          href="#/prices"
        >
          {t(locale, 'common.dash.nav.prices')}
        </a>
        <Button
          variant="secondary"
          data-testid="export-accountant"
          onClick={() => {
            setExportFailed(false)
            void downloadFile(
              `/api/v1/exports/accountant?year=${period.year}&month=${period.month}`,
              `payments-${period.year}-${String(period.month).padStart(2, '0')}.csv`,
            ).catch(() => setExportFailed(true))
          }}
        >
          {t(locale, 'billing.export.forAccountant')}
        </Button>
        {exportFailed ? (
          <span data-testid="export-failed">{t(locale, 'common.loadFailed.body')}</span>
        ) : null}
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

      {/* -- the four KPIs, in the manager home's own tile shape ---------------- */}
      <div className="dash-kpis" data-testid="kpi-row">
        <Kpi
          icon="payments"
          label={t(locale, 'billing.debt.total')}
          testId="kpi-debt"
          tone="debt"
          value={<MoneyDisplay agorot={openDebtAgorot} tone="debt" />}
        />
        <Kpi
          foot={
            <>
              <PercentDisplay value={collectedSharePercent} />{' '}
              {t(locale, 'billing.debt.collectedShare')}
            </>
          }
          footTestId="kpi-collected-share"
          icon="check"
          label={t(locale, 'billing.debt.collectedThisMonth')}
          testId="kpi-collected"
          tone="paid"
          value={<MoneyDisplay agorot={collectedThisMonthAgorot} tone="paid" />}
        />
        {/* Informational, and deliberately uncoloured — `3e`'s token table gives this one
            `--border` rather than a semantic tone. */}
        <Kpi
          icon="students"
          label={t(locale, 'billing.subscription.title')}
          testId="kpi-subscriptions"
          value={activeSubscriptions}
        />
        <Kpi
          icon="warning"
          label={t(locale, 'billing.order.status.failed')}
          testId="kpi-failed"
          tone={failedCharges > 0 ? 'pending' : undefined}
          value={failedCharges}
        />
      </div>

      {/* -- the children nobody can bill ------------------------------------- */}
      {/* §5.10's run has appended these to `tally.unpriced` since M6, the tally lands in
          `billing_run.log`, and no router, worker or screen read it. A child whose groups
          total three sessions a week in a club selling 1 / 2 / open membership was priced
          at nothing and trained all year for free, visible only in a JSON blob.

          It belongs HERE and not on its own screen: this is where a manager already comes
          to ask "who owes what", and a child nobody can bill is the same question with the
          answer missing. Rendered only when the list is non-empty — a permanent empty panel
          on the club's busiest screen is a panel people learn to skip. */}
      {unpriced.length > 0 ? (
        <section aria-labelledby="unpriced-students" data-testid="unpriced-students">
          <h2 id="unpriced-students">{t(locale, 'billing.unpriced.title')}</h2>
          <p>{t(locale, 'billing.unpriced.hint')}</p>
          <Card>
            {unpriced.map((row) => (
              <div key={row.student_id} style={rowStyle} data-testid="unpriced-row">
                <bdi>{row.display_name}</bdi>
                <span data-testid="unpriced-payer">
                  {row.payer_display_name
                    ? `${t(locale, 'billing.unpriced.payer')}: ${row.payer_display_name}`
                    : t(locale, 'billing.unpriced.noPayer')}
                </span>
                {row.joined_on ? (
                  <span data-testid="unpriced-since">
                    {t(locale, 'billing.unpriced.since').replace(
                      '{date}',
                      formatDateInStudioZone(row.joined_on, locale),
                    )}
                  </span>
                ) : null}
                {/* The plan is set on the student card, which is where the price already
                    lives — this names the gap and points at the one screen that closes it. */}
                <a href={`#/students/${row.student_id}`} data-testid="unpriced-open">
                  {t(locale, 'billing.unpriced.open')}
                </a>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {/* -- the debt list ----------------------------------------------------- */}
      <section aria-labelledby="open-debts">
        <div style={rowStyle}>
          <h2 id="open-debts">{t(locale, 'billing.openDebts.title')}</h2>
          <Button
            variant="secondary"
            data-testid="bulk-reminder"
            disabled={selected.length === 0}
            onClick={() => void sendReminders(selected)}
          >
            {t(locale, 'billing.debt.sendReminderToCount').replace(
              '{{count}}',
              String(selected.length),
            )}
          </Button>
        </div>

        {/* The prototype's filter pills, with the live count that makes them worth having.
            Only when there is more than one bucket to choose between — a single pill is
            not a choice, the same rule the students screen's class chips follow. */}
        {households.length > 0 ? (
          <div
            aria-label={t(locale, 'billing.debt.filterAging')}
            className="collections-pills"
            data-testid="aging-pills"
            role="group"
          >
            {BUCKETS.map((value) => (
              <button
                aria-pressed={bucket === value}
                data-testid={`aging-pill-${value}`}
                key={value}
                onClick={() => setBucket(value)}
                type="button"
              >
                {value === 'all'
                  ? t(locale, 'billing.debt.filterAll')
                  : t(locale, `billing.debt.aging.${value}`)}
                <span className="collections-pills__count">{counts[value]}</span>
              </button>
            ))}
          </div>
        ) : null}

        {households.length === 0 ? (
          // `3e` finding 7 — not drawn, and it is the goal state for a well-run club.
          <EmptyState title={t(locale, 'billing.debt.empty')} />
        ) : (
          <ul className="collections-list" data-testid="collections-list">
            {shown.map((row) => (
              <li className="debt-card" key={row.payerPersonId} data-testid="household-block">
              <div className="debt-card__row" data-testid="household-row">
                {/* Band one — who. */}
                <div className="debt-card__who">
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
                  <span className="debt-card__students" data-testid="household-students">
                    {row.studentNames.join(', ')}
                  </span>
                </div>

                {/* Band two — what state. The amount is the figure a manager scans for, so
                    it is the largest thing on the card rather than the eighth item in a
                    row of eleven. */}
                <div className="debt-card__state">
                  <span className="debt-card__amount">
                    <MoneyDisplay agorot={row.balanceAgorot} tone="debt" label={row.payerName} />
                  </span>
                  <StatusChip
                    status="debt"
                    label={t(locale, `billing.debt.aging.${ageBucket(row.daysOverdue)}`)}
                  />
                  <span className="debt-card__months" data-testid="household-months">
                    {fill(t(locale, 'billing.debt.monthsInDebtCount'), { count: row.monthsInDebt })}
                  </span>
                  {/* `3e` finding 4 — four rungs, and the artboard shows one button. A
                      manager who cannot see the rung cannot tell a first nudge from a final
                      notice. */}
                  <span className="debt-card__rung" data-testid="household-rung">
                    {t(locale, `billing.debt.escalation.${escalationRung(row.daysOverdue)}`)}
                  </span>
                  {/* §7 — beside the debt, never merged into it. A family who has paid ahead
                      is not a debtor for the part they paid, and a manager who sends them a
                      reminder without seeing this makes a phone call nobody enjoys. */}
                  {row.creditAgorot > 0 ? (
                    <span className="debt-card__credit" data-testid="household-credit">
                      {t(locale, 'billing.prepay.credit')}{' '}
                      <MoneyDisplay agorot={row.creditAgorot} tone="paid" label={row.payerName} />
                    </span>
                  ) : null}
                </div>

                {/* Band three — what you can do about it. */}
                <div className="debt-card__actions">
                <Button
                  variant="secondary"
                  data-testid="send-reminder"
                  onClick={() => void sendReminders([row.payerPersonId])}
                >
                  {t(locale, 'billing.debt.sendReminder')}
                </Button>
                {reminded[row.payerPersonId] ? (
                  <span
                    className="debt-card__outcome"
                    data-testid={`reminder-outcome-${row.payerPersonId}`}
                  >
                    {t(
                      locale,
                      reminded[row.payerPersonId] === 'sent'
                        ? 'billing.debt.reminderSent'
                        : reminded[row.payerPersonId] === 'recent'
                          ? 'billing.debt.reminderRecent'
                          : reminded[row.payerPersonId] === 'quiet'
                            ? 'billing.reminder.quietHours'
                            : 'common.loadFailed.body',
                    )}
                  </span>
                ) : null}
                {/* The prototype's per-row WhatsApp nudge, and it earns its place: the
                    button beside it goes through `POST /reminders/debt`, which is push, and
                    push is exactly what a family that has not opened the app in a month does
                    not receive. A `wa.me` link opens the conversation with the message
                    composed and lets the manager press send — nothing is sent on their
                    behalf, and no phone number leaves this screen. */}
                <a
                  className="studio-btn"
                  data-testid={`whatsapp-${row.payerPersonId}`}
                  data-variant="ghost"
                  href={whatsappShareUrl(
                    t(locale, 'billing.debt.whatsappTitle'),
                    fill(t(locale, 'billing.debt.whatsappBody'), {
                      name: row.payerName || row.studentNames.join(', '),
                      amount: (row.balanceAgorot / 100).toFixed(2),
                    }),
                  )}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t(locale, 'billing.debt.whatsapp')}
                </a>
                <Button
                  variant="secondary"
                  data-testid="record-cash"
                  onClick={() => setPayingFor(row)}
                >
                  {t(locale, 'billing.payment.recordCash')}
                </Button>
                <Button
                  variant="ghost"
                  data-testid="household-details"
                  aria-expanded={detailsFor === row.payerPersonId}
                  onClick={() => toggleDetails(row.payerPersonId)}
                >
                  {t(locale, 'billing.debt.details')}
                </Button>
                </div>
              </div>
              {detailsFor === row.payerPersonId ? (
                <ul className="debt-card__charges" data-testid="household-charges">
                  {(detailCharges[row.payerPersonId] ?? []).map((charge) => (
                    <li className="debt-card__charge" key={charge.id}>
                      {/* The label first: it is what the money is FOR, and it is where a
                          parent's own note arrives. The kind is the fallback for charges
                          the run wrote with no label of their own. */}
                      <span className="debt-card__charge-label">
                        {charge.proration_note || t(locale, `billing.charge.kind.${charge.kind}`)}
                      </span>
                      <span className="debt-card__charge-date" dir="ltr">
                        {charge.due_date}
                      </span>
                      <MoneyDisplay agorot={charge.amount_agorot} tone="debt" />
                    </li>
                  ))}
                  {(detailCharges[row.payerPersonId] ?? []).length === 0 ? (
                    <li>{t(locale, 'billing.debt.detailsEmpty')}</li>
                  ) : null}
                </ul>
              ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* The total sits under the list rather than inside it: it is a fact about the
            whole screen, and it is the FILTERED total when a pill is pressed, because a
            sum that ignores the filter above it is a sum answering a question nobody
            asked. */}
        {households.length > 0 ? (
          <p className="collections-total" data-testid="collections-total">
            <span>
              {bucket === 'all'
                ? t(locale, 'billing.debt.total')
                : t(locale, 'billing.debt.totalFiltered')}
            </span>
            <MoneyDisplay agorot={shownTotal} tone="debt" />
          </p>
        ) : null}
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
/**
 * One tile of the money band, in the shape checkpoint 2 gave the manager home: a label, a
 * figure, a tinted icon badge, and a foot rule with whatever qualifies the number.
 *
 * The same `.dash-kpi` classes, deliberately — the home's band and this one show the same
 * club's money on two screens, and two tile designs for one fact is how a manager starts
 * wondering whether they mean different things.
 *
 * `tone` is SEMANTIC and not an emphasis choice: `debt` and `paid` are the tokens that mean
 * those things everywhere else, and there is no tone for "make this one stand out".
 */
function Kpi({
  label,
  value,
  foot,
  icon,
  tone,
  testId,
  footTestId,
}: {
  label: string
  value: ReactNode
  /** §3.3 -- a number and its own trailing words, never a pre-built string: the value goes
   *  through `PercentDisplay`'s own isolation, and a plain string here is exactly what let
   *  this fuse with the amount above it in the first place. */
  foot?: ReactNode
  icon: IconName
  tone?: 'debt' | 'paid' | 'pending'
  testId: string
  /** The foot's own id, kept separate because the collected-share note is asserted by
   *  name — §3.3's isolation test names it, and renaming it would lose that link. */
  footTestId?: string
}) {
  return (
    <div className="dash-kpi" data-testid={testId} data-tone={tone}>
      <div className="dash-kpi__head">
        <span className="dash-kpi__text">
          <span className="dash-kpi__label">{label}</span>
          <span className="dash-kpi__figures">
            <span className="dash-kpi__value">{value}</span>
          </span>
        </span>
        <span aria-hidden="true" className="dash-kpi__badge">
          <Icon name={icon} size={18} />
        </span>
      </div>
      {foot ? (
        <div className="dash-kpi__foot">
          <span className="dash-kpi__note" data-testid={footTestId ?? `${testId}-foot`}>
            {foot}
          </span>
        </div>
      ) : null}
    </div>
  )
}
