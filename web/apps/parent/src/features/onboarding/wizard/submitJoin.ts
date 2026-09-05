// The join wizard's payment step, as pure orchestration -- no UI. A later task wires this
// into the screens; this module only decides what happens once the family presses the one
// button step 3 ends on.
//
// Two phases behind that button, because they cannot be one. A promise names SPECIFIC OPEN
// CHARGES, and those charges do not exist until `register` runs -- `charge_first_month`
// fires inside that write. Credit is two-phase regardless: a card is charged by showing
// uPay's page to a human. So: register, read back the charges it created, then act.
import type { BillingClient, ChargeOut, UpayForm } from '../../billing/billingClient'
import type { StandingOrderLink } from '../../billing/PaymentSetup'
import { DEMO_SIMULATOR } from '../../billing/PaymentsSection'
import { needsManagerReview } from './types'
import type { PaymentMethod, StudentDraft, WizardPlan } from './types'

/** What `POST /onboarding/{token}/register` and `POST /me/students/register` both
 *  return. `student_ids` is what this submission CREATED; `child_student_ids` is one id
 *  per submitted child in the same order, created here or already on the roster. */
export type RegisterResult = {
  person_id: string
  student_ids: string[]
  child_student_ids: string[]
  charges_created: number
}

/** What became of one child's payment choice. Step 4 renders from this, so every value
 *  has to be something a parent can be told. */
export type OutcomeState =
  /** Flagged health answers: no charge by design, the manager decides. */
  | 'awaiting_review'
  /** The club knows how this child is paying — a promise was written. */
  | 'recorded'
  /** Recorded, and a standing-order mandate is still to be signed. */
  | 'mandate_pending'
  /** A uPay order was opened for this child; the card page settles it. */
  | 'card_pending'
  /** Nothing landed for this child. `reason` says why. */
  | 'not_recorded'

export type OutcomeReason =
  /** They chose card and this registration raised no charge for them, so there is
   *  nothing for uPay to bill. */
  | 'no_charge_for_card'
  /** The write failed after the registration had already landed. */
  | 'write_failed'
  /** The register response named no student for this child. Should not happen. */
  | 'no_student'

export type PaymentOutcome = {
  draftId: string
  name: string
  method: PaymentMethod | null
  amountAgorot: number
  state: OutcomeState
  reason?: OutcomeReason
}

/** One standing-order mandate still to sign. Keyed by student id and not by name:
 *  two children can share a first name, and a link matched to the wrong child signs a
 *  mandate at the wrong amount. */
export type MandateRow = {
  draftId: string
  studentId: string
  name: string
  amountAgorot: number
  url: string
}

export type SubmitJoinResult = {
  personId: string
  outcomes: PaymentOutcome[]
  /** uPay's card page, to post into the payment frame. */
  checkout: UpayForm | null
  /** An order was opened but this deployment has no live uPay form — a demo studio
   *  (`DEMO_SIMULATOR`). Nothing failed; there is simply nothing to post. */
  checkoutUnavailable: boolean
  mandates: MandateRow[]
}

export type SubmitJoinDeps = {
  /** Posts the registration. Door B posts to `/onboarding/{token}/register`, doors C and
   *  D to `/me/students/register`, so the CALLER supplies this and no door leaks in
   *  here. Rejects on failure. */
  register: () => Promise<RegisterResult>
  /** Re-mints the access token. A door B parent belonged to no club until `register`
   *  returned, so every `/me/*` read below answers 403 without it. */
  refreshSession: () => Promise<void>
  billing: Pick<BillingClient, 'openCharges' | 'createPromise' | 'createOrder' | 'orderForm'>
  /** `GET /me/standing-order-links`, read AFTER the write — the children it names did
   *  not exist before it. */
  standingOrderLinks: () => Promise<readonly StandingOrderLink[]>
}

export type SubmitJoinInput = {
  students: readonly StudentDraft[]
  plans: readonly WizardPlan[]
  methods: Readonly<Record<string, PaymentMethod>>
  /** The family said the payment was already arranged with the coach. Recorded on every
   *  promise as `already_paid`, which is a TENSE and not a method: it tells the manager
   *  whether to go and look for this money now or wait for it. */
  alreadyArranged: boolean
  deps: SubmitJoinDeps
}

/** One child cleared for step 5 -- not awaiting review, and named by a real student id.
 *  `outcome` is the SAME object living in the `outcomes` array below: mutating a field on
 *  it here is how a row's state gets promoted once its write succeeds, with nothing to
 *  look up by index. */
type ActiveRow = {
  outcome: PaymentOutcome
  studentId: string
  method: PaymentMethod
  charges: ChargeOut[]
  planId: string
}

export async function submitJoin(input: SubmitJoinInput): Promise<SubmitJoinResult> {
  const { students, plans, methods, alreadyArranged, deps } = input

  // Let this reject: the caller keeps the family on step 3 and shows the error.
  // Everything below runs only once the family exists.
  const registered = await deps.register()

  try {
    await deps.refreshSession()
  } catch {
    // Not worth losing the rest over -- the reads below fail into `not_recorded` on
    // their own if the token really is unusable.
  }

  let openCharges: ChargeOut[] | null = null
  try {
    openCharges = await deps.billing.openCharges('')
  } catch {
    // Every child not awaiting review becomes `not_recorded` / `write_failed` below,
    // and nothing past this point gets called: there is nothing left to scope a
    // promise or an order to.
    openCharges = null
  }

  const outcomes: PaymentOutcome[] = []
  const active: ActiveRow[] = []

  students.forEach((draft, index) => {
    const method = methods[draft.id] ?? 'credit'
    const amountAgorot = plans.find((plan) => plan.id === draft.planId)?.pricePerMonthAgorot ?? 0
    const name = `${draft.firstName} ${draft.lastName}`.trim()

    if (needsManagerReview(draft)) {
      // No write of any kind mentions this child, and none of their charges enters any
      // promise or order.
      outcomes.push({ draftId: draft.id, name, method, amountAgorot, state: 'awaiting_review' })
      return
    }

    if (openCharges === null) {
      outcomes.push({
        draftId: draft.id,
        name,
        method,
        amountAgorot,
        state: 'not_recorded',
        reason: 'write_failed',
      })
      return
    }

    const studentId = registered.child_student_ids[index]
    if (studentId === undefined) {
      outcomes.push({
        draftId: draft.id,
        name,
        method,
        amountAgorot,
        state: 'not_recorded',
        reason: 'no_student',
      })
      return
    }

    // This is also what scopes door D. A family adding a fourth child must not have the
    // other three children's open balances swept into this registration's promise, and
    // filtering to the students THIS run created is what keeps them out.
    const charges = registered.student_ids.includes(studentId)
      ? openCharges.filter((charge) => charge.student_id === studentId)
      : []

    if (method === 'credit' && charges.length === 0) {
      // A card child with no charges never reaches step 5c: there is nothing for uPay
      // to bill.
      outcomes.push({
        draftId: draft.id,
        name,
        method,
        amountAgorot,
        state: 'not_recorded',
        reason: 'no_charge_for_card',
      })
      return
    }

    // Default until a step-5 write overwrites it: the registration has already landed,
    // so a failure from here on is a `write_failed`, never a silent nothing.
    const outcome: PaymentOutcome = {
      draftId: draft.id,
      name,
      method,
      amountAgorot,
      state: 'not_recorded',
      reason: 'write_failed',
    }
    outcomes.push(outcome)
    active.push({ outcome, studentId, method, charges, planId: draft.planId })
  })

  let checkout: UpayForm | null = null
  let checkoutUnavailable = false
  const mandates: MandateRow[] = []

  if (openCharges !== null) {
    // a. and b. -- cash, cheque and standing order. One call per method over every one of
    // that method's children's charges together (real charges); one call PER CHILD for a
    // child register raised no charge for (already on the roster), so the manager still
    // sees the choice with the plan named.
    for (const method of ['cash', 'cheque', 'standing_order'] as const) {
      const withCharges = active.filter((row) => row.method === method && row.charges.length > 0)
      const withoutCharges = active.filter(
        (row) => row.method === method && row.charges.length === 0,
      )

      if (withCharges.length > 0) {
        const chargeIds = withCharges.flatMap((row) => row.charges.map((charge) => charge.id))
        try {
          await deps.billing.createPromise(chargeIds, method, 0, alreadyArranged)
          for (const row of withCharges) {
            row.outcome.state = 'recorded'
            row.outcome.reason = undefined
          }
        } catch {
          // Already `not_recorded` / `write_failed` by default.
        }
      }

      for (const row of withoutCharges) {
        if (!row.planId) continue // Nothing sensible to claim -- stays `write_failed`.
        try {
          await deps.billing.createPromise([], method, 0, alreadyArranged, row.planId)
          row.outcome.state = 'recorded'
          row.outcome.reason = undefined
        } catch {
          // Already `not_recorded` / `write_failed` by default.
        }
      }
    }

    // c. -- card. One order over every card child's charges together: money is held per
    // PAYER, so a three-child family enters a card once.
    const cardRows = active.filter((row) => row.method === 'credit')
    if (cardRows.length > 0) {
      const chargeIds = cardRows.flatMap((row) => row.charges.map((charge) => charge.id))
      try {
        const order = await deps.billing.createOrder(chargeIds, 1, 0)
        const form = await deps.billing.orderForm(order.public_ref)
        for (const row of cardRows) {
          row.outcome.state = 'card_pending'
          row.outcome.reason = undefined
        }
        if (form.action === DEMO_SIMULATOR.action) {
          // The order is real and simply unpayable here -- the rows still say
          // `card_pending`.
          checkoutUnavailable = true
        } else {
          checkout = form
        }
      } catch {
        // Already `not_recorded` / `write_failed` by default.
      }
    }

    // d. -- standing-order mandates, read only after the writes above: a child whose
    // promise just landed may now have a link naming them.
    const standingOrderRows = active.filter(
      (row) => row.method === 'standing_order' && row.outcome.state === 'recorded',
    )
    if (standingOrderRows.length > 0) {
      try {
        const links = await deps.standingOrderLinks()
        for (const row of standingOrderRows) {
          const link = links.find((candidate) => candidate.studentId === row.studentId)
          if (!link) continue // The promise landed; there is simply no mandate for their plan.
          mandates.push({
            draftId: row.outcome.draftId,
            studentId: row.studentId,
            name: row.outcome.name,
            amountAgorot: link.amountAgorot,
            url: link.url,
          })
          row.outcome.state = 'mandate_pending'
        }
      } catch {
        // Leaves every such row `recorded` and returns no mandates -- a failed read
        // never turns a written promise into a failure.
      }
    }
  }

  return { personId: registered.person_id, outcomes, checkout, checkoutUnavailable, mandates }
}
