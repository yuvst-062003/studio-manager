// §6.1's payment step, for a family that just joined through the club's link.
//
// Owner design, 2026-08-30: "add a kid / health / payment option / round up to kids / then
// he can add another kid or continue / after continue it shows summary of payments for each
// kid and ask to pay if selected card / if הוראת קבע shows for each its link / and then he
// can finish and continue to the app."
//
// **The price is not asked, because it is already decided.** `OnboardingService.register`
// adds up the weekly sessions of the groups the parent picked and assigns the one live plan
// with that `sessions_per_week`, then raises the first charge. So 300 / 400 / 550 IS "once
// a week / twice / unlimited", and a picker here would let a child hold a price their groups
// disagree with — two sources for one number, reconciled by hand every time. This screen
// shows what the groups already decided and asks the one open question: how the money moves.
//
// A child the join could not price (no matching plan, or two) has no charge and is shown as
// such rather than silently skipped — that is the case the manager's checklist exists for.
//
// **The routes do not combine the same way, and that is the club's own rule** (owner,
// 2026-08-30: "cash or card or checks can be one; הוראת קבע the price is constant, so for
// the same price need to pay twice or for different links"):
//
//   card              ONE uPay checkout over every card child's charge. Money is held per
//                     PAYER, not per child, so one order settles them all and a three-child
//                     family enters their card once.
//   cash / cheque     ONE promise per method over those children's charges. Nothing is paid
//                     here; the manager marks it received.
//   הוראת קבע          ONE LINK PER CHILD, always. A uPay shared link charges a FIXED
//                     amount, so two children on the same price still need two mandates —
//                     a single link would have the family underpay for the second child
//                     every month and nobody would notice until reconciliation.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Alert, Button, Card, EmptyState, LoadFailed, MoneyDisplay, StatusChip } from '@studio/ui'
import type { ChipStatus } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentOverlay } from './PaymentOverlay'
import type { PaymentOverlayRequest } from './PaymentOverlay'
// F15's model fix: PaymentsSection.tsx's own `onOrderOpened` already checks this sentinel
// before opening an overlay. Imported rather than retyped, so the two checks share one
// literal instead of two copies that can drift. `BillingRequestError` is that file's typed
// error path (F15, cause 2) -- it preserves the server's `detail.code` instead of
// discarding the response body, so a failure can be told apart by *code*, not by
// regex-matching a status number out of a message string that is another module's detail.
import { BillingRequestError, DEMO_SIMULATOR } from './PaymentsSection'
import type { BillingClient, ChargeOut, PromiseMethod } from './billingClient'
import { selectionTotal } from './billingClient'

/** The four routes, in the order §5.10's payments screen lists them. */
const METHODS = ['card', 'cash', 'cheque', 'standing_order'] as const
export type SetupMethod = (typeof METHODS)[number]

/**
 * Decision 17's follow-up to "כבר שילמתי" — מזומן / צ׳ק / הוראת קבע, never כרטיס אשראי:
 * a card payment made in the app already has its own record, so there is nothing to
 * claim there. `PromiseMethod` (billingClient.ts) already names exactly this set, so
 * reusing it rather than a fourth hand-typed tuple keeps the two in one place.
 */
const ALREADY_PAID_METHODS = [
  'cash',
  'cheque',
  'standing_order',
] as const satisfies readonly PromiseMethod[]

/** Every route except the card raises a promise a manager settles by hand. */
export function isHandCarried(method: SetupMethod): method is PromiseMethod {
  return method !== 'card'
}

export type SetupChild = { id: string; first_name: string; last_name: string }
/** One child's mandate link. Keyed by `studentId` and not by name: two children can share
 *  a first name, and a link matched to the wrong child signs a mandate at the wrong
 *  amount — the exact failure the per-child link exists to prevent. */
export type StandingOrderLink = { studentId: string; amountAgorot: number; url: string }

/** One child, their outstanding month, and the answer the family gave for them. */
export type ChildRow = {
  child: SetupChild
  charges: ChargeOut[]
  amountAgorot: number
  method: SetupMethod | null
  /** Decision 17 -- "כבר שילמתי" is a TENSE, not a method: the parent's own claim that
   *  this row's money already moved outside the app (handed to the manager directly,
   *  or a mandate that was already set up), for whichever of `method`'s three
   *  hand-carried routes they say it was. Purely informational -- it changes no
   *  arithmetic and settles nothing; the manager still confirms from their own
   *  reconciliation queue (decision 19). Never true when `method === 'card'`: the
   *  already-paid follow-up never offers card, because a card payment made in the app
   *  already has its own record. */
  alreadyPaid: boolean
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  minBlockSize: '44px',
}

const mutedStyle: CSSProperties = { color: 'var(--text-muted)' }

const choicesStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

/**
 * Decision 19's chip table, read literally: a plain method chip for a row paying now,
 * a claim chip (never reading as settled) for one marked "כבר שילמתי", and — because a
 * הוראת קבע mandate is never instantly settled either — its own not-yet-cleared chip
 * even when nobody has claimed anything. `{{method}}` is filled with the SAME label the
 * plain chip would show, so the claim reuses one source of method names rather than a
 * second copy that can drift from `schedule.plan.gate.method.*`.
 */
function chipFor(locale: Locale, row: ChildRow): { status: ChipStatus; label: string } {
  const method = row.method ?? 'card'
  if (row.alreadyPaid) {
    return {
      status: 'pending',
      label: t(locale, 'billing.chip.alreadyPaid').replace(
        '{{method}}',
        t(locale, `schedule.plan.gate.method.${method}`),
      ),
    }
  }
  if (method === 'standing_order') {
    return { status: 'pending', label: t(locale, 'billing.chip.standingPending') }
  }
  return { status: 'planned', label: t(locale, `schedule.plan.gate.method.${method}`) }
}

/**
 * Decision 17's five-answer question -- כרטיס אשראי · הוראת קבע · מזומן · צ׳קים · כבר
 * שילמתי -- shared between the family-wide ask and the per-child "שינוי" override
 * (§4 step 4 point 4: "the same five options and the same follow-up"), so the two
 * screens cannot silently drift into offering a different set.
 */
function PayHowChoices({
  locale,
  onAlreadyPaid,
  onChoose,
}: {
  locale: Locale
  onAlreadyPaid: () => void
  onChoose: (method: SetupMethod) => void
}) {
  return (
    <div style={choicesStyle}>
      {METHODS.map((method) => (
        <Button
          data-testid={`setup-method-${method}`}
          key={method}
          onClick={() => onChoose(method)}
          variant="secondary"
        >
          {t(locale, `schedule.plan.gate.method.${method}`)}
        </Button>
      ))}
      <Button data-testid="setup-method-already_paid" onClick={onAlreadyPaid} variant="secondary">
        {t(locale, 'schedule.plan.gate.paidAlready')}
      </Button>
    </div>
  )
}

/**
 * Decision 17's one follow-up -- "איך שילמתם?" -- מזומן / צ׳ק / הוראת קבע, never כרטיס
 * אשראי (a card payment made in the app already has its own record). Shared for the
 * same reason `PayHowChoices` is.
 */
function AlreadyPaidFollowUp({
  locale,
  onCancel,
  onChoose,
}: {
  locale: Locale
  onCancel: () => void
  onChoose: (method: PromiseMethod) => void
}) {
  return (
    <>
      <p>{t(locale, 'billing.alreadyPaid.methodQuestion')}</p>
      <div style={choicesStyle}>
        {ALREADY_PAID_METHODS.map((method) => (
          <Button
            data-testid={`setup-claim-method-${method}`}
            key={method}
            onClick={() => onChoose(method)}
            variant="secondary"
          >
            {t(locale, `schedule.plan.gate.method.${method}`)}
          </Button>
        ))}
      </div>
      <Button data-testid="setup-claim-cancel" onClick={onCancel} variant="ghost">
        {t(locale, 'billing.dialog.cancel')}
      </Button>
    </>
  )
}

/**
 * Group the payer's open charges by the child they are for.
 *
 * Exported and pure so the arithmetic is testable without a server: a two-child family's
 * summary is the one place a mistake here is invisible and expensive.
 */
export function rowsFor(
  students: readonly SetupChild[],
  charges: readonly ChargeOut[],
): ChildRow[] {
  return students.map((child) => {
    const own = charges.filter((charge) => charge.student_id === child.id)
    return {
      child,
      charges: own,
      amountAgorot: selectionTotal(own),
      method: null,
      alreadyPaid: false,
    }
  })
}

/** One child's final method/amount decision, reported to the caller once the family
 *  reaches "סיום" -- the join wizard's done-state (`JoinDoneScreen.tsx`) is built from
 *  this, structurally compatible with its `JoinDoneChildRow` without either module
 *  importing the other. */
export type PaymentSummaryRow = {
  studentId: string
  displayName: string
  method: SetupMethod
  amountAgorot: number
}

export type PaymentSetupProps = {
  locale: Locale
  client: BillingClient
  students: readonly SetupChild[]
  /** `GET /me/standing-order-links` — one per child, by name. */
  standingOrderLinks: readonly StandingOrderLink[]
  /** Pressed סיום, or אחר כך. The caller lets the app through. */
  onFinish: () => void
  /**
   * Nothing is outstanding, so this step has no question to ask.
   *
   * **Load-bearing, not a nicety.** Without it the step stood in front of the whole app on
   * every launch — a family in good standing, and every family who had already paid, met a
   * payment wizard instead of their home screen.
   */
  onNothingToPay?: () => void
  /** Called once, alongside `onFinish`, with every priced child's final method/amount —
   *  the join wizard's done-state renders from this. Optional: the app-level nag gate
   *  (`PaymentSetupGate` in `App.tsx`) has no done-state and does not pass it. */
  onSummary?: (rows: PaymentSummaryRow[]) => void
}

export function PaymentSetup({
  locale,
  client,
  students,
  standingOrderLinks,
  onFinish,
  onNothingToPay,
  onSummary,
}: PaymentSetupProps) {
  const [rows, setRows] = useState<ChildRow[] | null>(null)
  // The in-app payment overlay's current request, or none. Card checkout and every
  // standing-order link both route through this one piece of state (2026-09-03
  // addendum) instead of navigating the tab away.
  const [overlay, setOverlay] = useState<PaymentOverlayRequest | null>(null)
  // Before this is true the screen asks once for the family. Child positions are used only
  // for overrides opened from the summary.
  const [familyAnswered, setFamilyAnswered] = useState(false)
  // Decision 17 -- the family chose "כבר שילמתי" and is now on the one follow-up
  // ("איך שילמתם?"), not yet counted as `familyAnswered`.
  const [familyClaimPending, setFamilyClaimPending] = useState(false)
  const [index, setIndex] = useState<number | null>(null)
  // Same follow-up, for the per-child "שינוי" override at `index`.
  const [overrideClaimPending, setOverrideClaimPending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // F15, cause 1 — not an error. Set when `payByCard` meets the demo sentinel below:
  // nothing failed, there is simply no live form to post in this deployment. `run()`'s
  // catch never touches this.
  const [notice, setNotice] = useState<string | null>(null)
  const [handSent, setHandSent] = useState(false)
  const [standingSent, setStandingSent] = useState(false)
  // §7.6 -- a failed read used to become `rows = []` indistinguishably from a family who
  // genuinely owes nothing, which fired `onNothingToPay` and bounced them out of
  // onboarding on a transient 500. This is a THIRD state, not a fourth branch of `rows`,
  // so a retry can tell "still loading" apart from "loaded and empty".
  const [failed, setFailed] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let live = true
    void client
      .openCharges('')
      .then((charges) => live && setRows(rowsFor(students, charges)))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, students, reloads])

  // A child the club could not price has nothing to answer, so the walk skips them — but
  // the summary still lists them, which is the point of showing them at all.
  const payable = useMemo(() => (rows ?? []).filter((row) => row.amountAgorot > 0), [rows])

  useEffect(() => {
    if (rows !== null && payable.length === 0) onNothingToPay?.()
  }, [rows, payable.length, onNothingToPay])
  const current = familyAnswered && index !== null ? (payable[index] ?? null) : null

  // Decision 17 -- one child's answer, `alreadyPaid` set explicitly rather than left to
  // default so a plain choice (card/cash/cheque/standing_order picked directly) and a
  // claim (picked through the follow-up) can never be confused by an implicit default.
  const choose = useCallback((childId: string, method: SetupMethod, alreadyPaid: boolean) => {
    setRows((previous) =>
      (previous ?? []).map((row) =>
        row.child.id === childId ? { ...row, method, alreadyPaid } : row,
      ),
    )
    setIndex(null)
    setOverrideClaimPending(false)
  }, [])

  const chooseForFamily = useCallback((method: SetupMethod, alreadyPaid: boolean) => {
    setRows((previous) =>
      (previous ?? []).map((row) => (row.amountAgorot > 0 ? { ...row, method, alreadyPaid } : row)),
    )
    setFamilyAnswered(true)
    setFamilyClaimPending(false)
    setIndex(null)
  }, [])

  // "שינוי" on a summary row -- always starts a fresh five-option ask, never mid-way
  // through a stale follow-up left over from a previous override.
  const openOverride = useCallback((idx: number) => {
    setOverrideClaimPending(false)
    setIndex(idx)
  }, [])

  function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    action()
      .catch((caught: unknown) =>
        setError(
          // F15, cause 2 — the CODE selects the message, not the status text. This is
          // `GET /payment-orders/{ref}/form`'s one 503 branch (its other failure, the demo
          // studio, is the 409 the sentinel below already covers), so `code` alone tells
          // it apart from every other failure this screen can hit.
          caught instanceof BillingRequestError && caught.code === 'merchant_account_unconfigured'
            ? t(locale, 'billing.card.merchantUnconfigured')
            : t(locale, 'common.error.generic'),
        ),
      )
      .finally(() => setBusy(false))
  }

  if (failed) {
    // Never `onNothingToPay` here: that verb means "the club has nothing to ask this
    // family for", and a read that never completed has not established that.
    return (
      <div style={pageStyle} data-testid="payment-setup">
        <LoadFailed
          locale={locale}
          onRetry={() => {
            setFailed(false)
            setReloads((n) => n + 1)
          }}
        />
      </div>
    )
  }

  if (rows === null) {
    // §7.9 -- this gate wraps the whole app, so a bare `null` here blanked every screen
    // behind it while the first read was in flight, not just this step.
    return (
      <div style={pageStyle} data-testid="payment-setup">
        <p data-testid="payment-setup-loading">{t(locale, 'common.setup.loading')}</p>
      </div>
    )
  }

  if (payable.length === 0) {
    // Nothing owed: a family in good standing, or one the club has not priced yet. The
    // caller is told so it can stand this step down entirely rather than render a wizard
    // with no question in it.
    return (
      <div style={pageStyle} data-testid="payment-setup">
        <EmptyState title={t(locale, 'schedule.setup.nothingToPay')} />
        <Button data-testid="setup-finish" onClick={onFinish} variant="primary">
          {t(locale, 'schedule.setup.finish')}
        </Button>
      </div>
    )
  }

  // -- one answer for the family, decision 17's five options -----------------
  if (!familyAnswered && !familyClaimPending) {
    const multiple = payable.length > 1
    return (
      <div style={pageStyle} data-testid="payment-setup">
        <Card>
          <h1>{t(locale, 'schedule.setup.title')}</h1>
          <p data-testid="setup-family-method">{t(locale, 'schedule.setup.familyMethodHint')}</p>
        </Card>
        <Card>
          <h2>{t(locale, 'schedule.plan.gate.payHow')}</h2>
          {multiple ? <p style={mutedStyle}>{t(locale, 'schedule.setup.familyApplies')}</p> : null}
          <PayHowChoices
            locale={locale}
            onAlreadyPaid={() => setFamilyClaimPending(true)}
            onChoose={(method) => chooseForFamily(method, false)}
          />
        </Card>
        <Button data-testid="setup-later" onClick={onFinish} variant="ghost">
          {t(locale, 'schedule.plan.gate.later')}
        </Button>
      </div>
    )
  }

  // -- the family chose כבר שילמתי; one follow-up, for the whole family ------
  if (!familyAnswered && familyClaimPending) {
    return (
      <div style={pageStyle} data-testid="payment-setup">
        <Card>
          <h1>{t(locale, 'schedule.setup.title')}</h1>
        </Card>
        <Card>
          <div data-testid="setup-claim-family">
            <AlreadyPaidFollowUp
              locale={locale}
              onCancel={() => setFamilyClaimPending(false)}
              onChoose={(method) => chooseForFamily(method, true)}
            />
          </div>
        </Card>
        <Button data-testid="setup-later" onClick={onFinish} variant="ghost">
          {t(locale, 'schedule.plan.gate.later')}
        </Button>
      </div>
    )
  }

  // -- one child override ("שינוי"), the same five options --------------------
  if (current && !overrideClaimPending) {
    return (
      <div style={pageStyle} data-testid="payment-setup">
        <Card>
          <h1>{t(locale, 'schedule.setup.title')}</h1>
          <p>{t(locale, 'schedule.setup.intro')}</p>
          <p style={rowStyle}>
            <strong>
              <bdi>{current.child.first_name}</bdi>
            </strong>
            <MoneyDisplay agorot={current.amountAgorot} label={current.child.first_name} />
          </p>
        </Card>
        <Card>
          <div data-testid={`setup-ask-${current.child.id}`}>
            <h2>{t(locale, 'schedule.plan.gate.payHow')}</h2>
            <PayHowChoices
              locale={locale}
              onAlreadyPaid={() => setOverrideClaimPending(true)}
              onChoose={(method) => choose(current.child.id, method, false)}
            />
          </div>
        </Card>
        {/* Never a dead end. An outstanding month must not cost a family the app they use
            to find out when their child trains. */}
        <Button data-testid="setup-later" onClick={onFinish} variant="ghost">
          {t(locale, 'schedule.plan.gate.later')}
        </Button>
      </div>
    )
  }

  // -- one child override, כבר שילמתי chosen; the same one follow-up ---------
  if (current && overrideClaimPending) {
    return (
      <div style={pageStyle} data-testid="payment-setup">
        <Card>
          <h1>{t(locale, 'schedule.setup.title')}</h1>
          <p style={rowStyle}>
            <strong>
              <bdi>{current.child.first_name}</bdi>
            </strong>
            <MoneyDisplay agorot={current.amountAgorot} label={current.child.first_name} />
          </p>
        </Card>
        <Card>
          <div data-testid={`setup-claim-${current.child.id}`}>
            <AlreadyPaidFollowUp
              locale={locale}
              onCancel={() => setOverrideClaimPending(false)}
              onChoose={(method) => choose(current.child.id, method, true)}
            />
          </div>
        </Card>
        <Button data-testid="setup-later" onClick={onFinish} variant="ghost">
          {t(locale, 'schedule.plan.gate.later')}
        </Button>
      </div>
    )
  }

  // -- the summary ----------------------------------------------------------
  const cardRows = payable.filter((row) => row.method === 'card')
  const cardCharges = cardRows.flatMap((row) => row.charges)
  const cardTotal = selectionTotal(cardCharges)
  const standingRows = payable.filter((row) => row.method === 'standing_order')
  // Decision 15/16 -- a child who has claimed "כבר שילמתי · הוראת קבע" is never in the
  // mandate-link queue below: they have said the mandate already exists, and handing
  // them a link to create a second one is how a family ends up paying twice a month.
  // `standingRows` itself stays unfiltered -- `recordStandingOrder()` below still needs
  // every standing-order row, claimed or not, to write the (method, already_paid) split
  // decision 18 requires.
  const standingLinkQueueRows = standingRows.filter((row) => !row.alreadyPaid)
  const handRows = payable.filter((row) => row.method === 'cash' || row.method === 'cheque')

  async function payByCard() {
    const order = await client.createOrder(
      cardCharges.map((charge) => charge.id),
      1,
      0,
    )
    const form = await client.orderForm(order.public_ref)
    if (form.action === DEMO_SIMULATOR.action) {
      // F15, cause 1. No live uPay form exists here by design (§19.6) -- whether
      // `orderForm` resolved this sentinel directly (a demo studio) or caught the 409
      // `demo_studio_has_no_live_form` and turned it into the same value
      // (PaymentsSection.tsx `orderForm`), there is nothing to post into an overlay. That
      // also closes the 409 for free: one comparison covers both origins. Nothing failed,
      // so this is a notice, not an error, and the row list is refreshed rather than left
      // showing data fetched before this order existed.
      setNotice(t(locale, 'billing.card.demoOrderOpened'))
      setReloads((n) => n + 1)
      return
    }
    setOverlay({ kind: 'checkout', form })
  }

  function closeOverlay() {
    setOverlay(null)
  }

  function overlayComplete() {
    setOverlay(null)
    // Re-reads openCharges so the summary reflects whatever the overlay just settled --
    // same reload mechanism `LoadFailed`'s retry already uses.
    setReloads((n) => n + 1)
  }

  async function tellTheManager() {
    // Decision 18 / F20's second half -- grouped by (method, already_paid), never by
    // method alone: a claimed cash payment and an expected one are two promises, the
    // same way `recordStandingOrder()` below already splits standing-order rows. Lumping
    // them into one `createPromise` call would file the claim as `already_paid: false`
    // and lose it -- the manager would chase money that already arrived.
    for (const method of ['cash', 'cheque'] as const) {
      const forMethod = handRows.filter((row) => row.method === method)
      const claimed = forMethod.filter((row) => row.alreadyPaid)
      const pending = forMethod.filter((row) => !row.alreadyPaid)
      if (claimed.length > 0) {
        const ids = claimed.flatMap((row) => row.charges.map((charge) => charge.id))
        await client.createPromise(ids, method, 0, true)
      }
      if (pending.length > 0) {
        const ids = pending.flatMap((row) => row.charges.map((charge) => charge.id))
        await client.createPromise(ids, method, 0, false)
      }
    }
    setHandSent(true)
  }

  // §7.1 -- a family who picks הוראת קבע today presses סיום and the club learns nothing:
  // no promise, no flag, no note. `PaymentPromisesPanel.tsx`'s standing-order filter can
  // never show a row that came from here. This is that write, raised the same way the
  // hand-carried routes already are -- one promise across every standing-order child,
  // never charged (§8 / G8: our provider cannot create a mandate programmatically), so the
  // manager sees it as money expected rather than money collected.
  async function recordStandingOrder() {
    if (standingSent || standingRows.length === 0) return
    // Split by the parent's own already-paid claim, not lumped into one promise: the
    // manager needs to see a self-reported claim as its own row (`already_paid: true`),
    // distinct from the ordinary "expect this mandate to clear" promise the rest of the
    // family gets -- merging them would either bury the claim or falsely attach it to a
    // child nobody claimed anything about.
    const claimed = standingRows.filter((row) => row.alreadyPaid)
    const pending = standingRows.filter((row) => !row.alreadyPaid)
    if (claimed.length > 0) {
      const ids = claimed.flatMap((row) => row.charges.map((charge) => charge.id))
      await client.createPromise(ids, 'standing_order', 0, true)
    }
    if (pending.length > 0) {
      const ids = pending.flatMap((row) => row.charges.map((charge) => charge.id))
      await client.createPromise(ids, 'standing_order', 0, false)
    }
    setStandingSent(true)
  }

  function finishSetup() {
    onSummary?.(
      payable.map((row) => ({
        studentId: row.child.id,
        displayName: row.child.first_name,
        method: row.method ?? 'card',
        amountAgorot: row.amountAgorot,
      })),
    )
    if (standingRows.length === 0 || standingSent) {
      onFinish()
      return
    }
    run(async () => {
      await recordStandingOrder()
      onFinish()
    })
  }

  return (
    <div style={pageStyle} data-testid="payment-setup">
      <Card>
        <h1>{t(locale, 'schedule.setup.summaryTitle')}</h1>
        {rows.map((row) => (
          <div key={row.child.id} style={rowStyle} data-testid={`setup-row-${row.child.id}`}>
            <strong style={{ flex: 1, minInlineSize: 0 }}>
              <bdi>{row.child.first_name}</bdi>
            </strong>
            {row.amountAgorot > 0 ? (
              <>
                <MoneyDisplay agorot={row.amountAgorot} label={row.child.first_name} />
                <StatusChip {...chipFor(locale, row)} />
                <Button
                  data-testid={`setup-change-${row.child.id}`}
                  onClick={() =>
                    openOverride(payable.findIndex((p) => p.child.id === row.child.id))
                  }
                  variant="ghost"
                >
                  {t(locale, 'schedule.setup.change')}
                </Button>
              </>
            ) : (
              // The club could not price this child — no matching plan, or two. Said out
              // loud, because a silently missing row is the one nobody chases.
              <span data-testid={`setup-unpriced-${row.child.id}`} style={mutedStyle}>
                {t(locale, 'schedule.setup.unpriced')}
              </span>
            )}
          </div>
        ))}
      </Card>

      {error ? (
        <Alert iconLabel={t(locale, 'schedule.setup.summaryTitle')} live tone="danger">
          <span data-testid="setup-error">{error}</span>
        </Alert>
      ) : null}

      {notice ? (
        <Alert iconLabel={t(locale, 'schedule.setup.summaryTitle')} live tone="pending">
          <span data-testid="setup-notice">{notice}</span>
        </Alert>
      ) : null}

      {cardRows.length > 0 ? (
        // One checkout for every card child. Money is held per payer, so one order settles
        // them all — a three-child family enters their card once, not three times.
        <Card>
          <div data-testid="setup-card">
            <div style={rowStyle}>
              <span>{t(locale, 'schedule.setup.total')}</span>
              <MoneyDisplay agorot={cardTotal} tone="debt" />
            </div>
            <Button
              data-testid="setup-pay-card"
              disabled={busy}
              onClick={() => run(payByCard)}
              variant="primary"
            >
              {t(locale, 'schedule.setup.payCard')}
            </Button>
          </div>
        </Card>
      ) : null}

      {standingLinkQueueRows.length > 0 ? (
        <Card>
          <div data-testid="setup-standing">
            <h2>{t(locale, 'schedule.setup.standingTitle')}</h2>
            {/* Why there is a link each, said on the screen: a mandate is signed for a
                fixed amount, so one link for two children underpays for one of them every
                month until reconciliation notices. A child who claimed "כבר שילמתי ·
                הוראת קבע" (decision 15/16) never reaches this list -- they said the
                mandate already exists, and a link here would offer to create a second
                one. */}
            <p style={mutedStyle}>{t(locale, 'schedule.setup.standingHint')}</p>
            {standingLinkQueueRows.map((row) => {
              const link = standingOrderLinks.find(
                (candidate) => candidate.studentId === row.child.id,
              )
              return (
                <div key={row.child.id} style={rowStyle}>
                  <span style={{ flex: 1, minInlineSize: 0 }}>
                    <bdi>{row.child.first_name}</bdi>
                  </span>
                  <MoneyDisplay agorot={row.amountAgorot} label={row.child.first_name} />
                  {link ? (
                    <Button
                      // Two controls reading the same words are two links a screen reader
                      // cannot tell apart, and telling them apart is the whole point here.
                      aria-label={t(locale, 'schedule.setup.linkFor').replace(
                        '{name}',
                        row.child.first_name,
                      )}
                      data-testid={`setup-standing-link-${row.child.id}`}
                      // 2026-09-03 addendum -- opens in the in-app overlay instead of a
                      // new tab. §7.2's old failure mode (following the link navigated
                      // the ONE tab the join wizard runs in away, restarting it on
                      // return) is exactly what the overlay exists to prevent.
                      onClick={() => setOverlay({ kind: 'link', url: link.url })}
                      type="button"
                      variant="ghost"
                    >
                      {t(locale, 'billing.standingOrder.link')}
                    </Button>
                  ) : (
                    <span style={mutedStyle}>
                      {t(locale, 'billing.standingOrder.notConfirmable')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ) : null}

      {handRows.length > 0 ? (
        <Card>
          <div data-testid="setup-hand">
            {handRows.map((row) => (
              <div key={row.child.id} style={rowStyle}>
                <span style={{ flex: 1, minInlineSize: 0 }}>
                  <bdi>{row.child.first_name}</bdi>
                </span>
                <span>{t(locale, `schedule.plan.gate.hand.${row.method as PromiseMethod}`)}</span>
              </div>
            ))}
            {handSent ? (
              <p data-testid="setup-hand-sent">{t(locale, 'schedule.setup.handSent')}</p>
            ) : (
              <Button
                data-testid="setup-tell-manager"
                disabled={busy}
                onClick={() => run(tellTheManager)}
                variant="primary"
              >
                {t(locale, 'schedule.plan.gate.confirm')}
              </Button>
            )}
          </div>
        </Card>
      ) : null}

      <Button data-testid="setup-finish" disabled={busy} onClick={finishSetup} variant="secondary">
        {t(locale, 'schedule.setup.finish')}
      </Button>

      {overlay ? (
        <PaymentOverlay
          locale={locale}
          onClose={closeOverlay}
          onComplete={overlayComplete}
          request={overlay}
        />
      ) : null}
    </div>
  )
}

/** The gate shape `App.tsx` mounts: renders the setup until the family finishes it. */
export function PaymentSetupGate({
  children,
  ...props
}: Omit<PaymentSetupProps, 'onFinish' | 'onNothingToPay'> & { children: ReactNode }) {
  const [done, setDone] = useState(false)
  const standDown = useCallback(() => setDone(true), [])
  if (done) return <>{children}</>
  return <PaymentSetup {...props} onFinish={standDown} onNothingToPay={standDown} />
}
