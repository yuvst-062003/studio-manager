// The join wizard's payment step, as pure orchestration -- no UI. A later task wires this
// into the screens; this module only decides what happens once the family presses the one
// button step 3 ends on.
//
// Two phases behind that button, because they cannot be one. A promise names SPECIFIC OPEN
// CHARGES, and those charges do not exist until `register` runs -- `charge_first_month`
// fires inside that write. Credit is two-phase regardless: a card is charged by showing
// uPay's page to a human. So: register, read back the charges it created, then act.
import type { BillingClient, ChargeOut, UpayForm } from '../../billing/billingClient'
import type { MandateLink } from '../../billing/billingClient'
import { DEMO_SIMULATOR } from '../../billing/billingClient'
import { toHealthDeclaration } from './adapters'
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
  /** The money is already with the club: a manager took it in person and recorded it
   *  before the family ever opened the wizard. Distinct from `recorded`, which says a
   *  chosen METHOD was filed — this family chose nothing and owes nothing. */
  | 'settled'
  /** Recorded, and a standing-order mandate is still to be signed. */
  | 'mandate_pending'
  /** A uPay order was opened for this child; the card page settles it. */
  | 'card_pending'
  /** A trial lesson was booked for this child; they are not joining yet, so no charge,
   *  no promise and no order exist for them. */
  | 'trial_booked'
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
  /** No payment method was ever chosen for this child. `submitJoin` refuses before
   *  `register` for this, so reaching it means a caller skipped that guard. */
  | 'no_method'

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

/** Raised when a chargeable child reaches submit with no payment method chosen.
 *
 *  **Thrown before `register`**, so nothing has been written and the family can answer and
 *  press again -- which is exactly the retry state step 3 keeps for a failed registration.
 *  Its own class rather than a bare `Error` so the screen can tell it from a network
 *  failure and say something useful. */
export class MissingPaymentMethodError extends Error {
  readonly draftIds: readonly string[]

  constructor(draftIds: readonly string[]) {
    super(`no payment method chosen for ${draftIds.length} child(ren)`)
    this.name = 'MissingPaymentMethodError'
    this.draftIds = draftIds
  }
}

export type SubmitJoinResult = {
  personId: string
  outcomes: PaymentOutcome[]
  /** uPay's card page, to post into the payment frame. */
  checkout: UpayForm | null
  /** The order `checkout` pays, so the frame can watch it resolve. Carried separately
   *  rather than read out of `checkout.fields.paymentdetails`: that field is the payer's
   *  own description since 2026-09-11 and leads with the club's name. */
  checkoutRef: string | null
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
  billing: Pick<
    BillingClient,
    'openCharges' | 'createPromise' | 'createOrder' | 'orderForm' | 'orderStatus'
  >
  /** `GET /me/standing-order-links`, read AFTER the write — the children it names did
   *  not exist before it. */
  standingOrderLinks: () => Promise<readonly MandateLink[]>
  /**
   * `PUT /me/payment-methods` — how the family says they will pay, per child.
   *
   * **This is the whole of the "the payment option didn't get written" fix.** The promises
   * below record three of the four methods and the order records none, because
   * `payment_promise.method` has no card; the profile screen read the method off the
   * promise list, so a card family was told `לא הוגדר` however often they answered.
   */
  savePaymentMethods: (
    items: readonly { studentId: string; method: string }[],
  ) => Promise<void>
  /**
   * §6.1 step 5's privacy consent, recorded from the screen that actually asked for it.
   *
   * **Why the wizard does this at all.** Step 1 shows the family three documents and takes
   * one tick covering all three — and until 2026-09-12 it recorded only the CLUB's terms.
   * The privacy ledger was written by a separate `ConsentGate` screen, which therefore had
   * to stand in front of the app and ask for the same two documents a second time, in a
   * different design. A parent joining through the link ticked תנאי שימוש and מדיניות
   * פרטיות twice, on two consecutive screens.
   *
   * Honest to record here because the two screens show the SAME WORDS: the wizard's
   * `people.joinWizard.legal.*` and the gate's `reports.privacy.*` are the same corpus
   * duplicated into two namespaces — twelve policy sections each, heading for heading.
   *
   * Optional, and swallowed on failure by the caller: `register` has already landed by the
   * time this runs, and a family that exists but has not had a consent row written is asked
   * again by the gate — which is the old behaviour, not a new failure.
   */
  grantPrivacyConsents?: () => Promise<void>
  /** `POST /trial-bookings/self` for the children whose family chose a trial lesson
   *  instead of joining. Optional because door B has no session for it and a door that
   *  cannot offer a trial simply never sets the choice. Given the children's OWN group
   *  ids — the endpoint requires one per child and the wizard collected it at step 2. */
  bookTrial?: (
    children: readonly {
      firstName: string
      lastName: string
      birthDate: string
      groupId: string
      health: ReturnType<typeof toHealthDeclaration> 
    }[],
  ) => Promise<void>
}

export type SubmitJoinInput = {
  students: readonly StudentDraft[]
  /** The health template this submission signs against — the same id
   *  `toRegisterPayload` is given, so a trial child's declaration is the member's form
   *  and not a lesser one. */
  templateId?: string | null
  plans: readonly WizardPlan[]
  methods: Readonly<Record<string, PaymentMethod>>
  /** The family said the payment was already arranged with the coach. Recorded on every
   *  promise as `already_paid`, which is a TENSE and not a method: it tells the manager
   *  whether to go and look for this money now or wait for it. */
  alreadyArranged: boolean
  /**
   * The club's cash and cheque arrangements, as months bought FORWARD beside the month this
   * registration already owes. `{cash: 2}` collects three months of cash in total.
   *
   * **Must match what step 3 showed.** Forward months are priced SERVER-side from the
   * payer's monthly total; the screen computes the same figure from this run's plans, and
   * the two agree only when this run's children are the payer's only children. Doors C and D
   * therefore pass `{0, 0}` — a family that already has children prepays from the payments
   * screen, which reads `/me/prepay-terms` and knows the real total. Charging a total the
   * family was never shown is the 2026-09-12 defect in a new place.
   */
  prepayMonths?: { cash: number; cheque: number }
  /**
   * Children whose payment the club has ALREADY arranged — a manager took the money in
   * person and said so on the convert step.
   *
   * They are not asked for a method, not counted towards step 3, and no promise or order is
   * written for them here: one already exists, made by the manager, and a second would show
   * the same money twice on the payments screen. Their outcome is `recorded`, because from
   * the family's side it is.
   */
  settledStudentIds?: readonly string[]
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
  const prepay = input.prepayMonths ?? { cash: 0, cheque: 0 }
  const settled = new Set(input.settledStudentIds ?? [])

  //: `register` is given JOINING children only (`toRegisterPayload` filters them), so a
  //: submission of nothing but trial children has nobody to register — and calling it
  //: would throw on an empty child list. A family in that shape already exists on doors C
  //: and D; on door B the trial endpoint creates them as a lead.
  const joiningDrafts = students.filter((draft) => draft.intent !== 'trial')

  //: **Refused rather than defaulted, and refused BEFORE anything is written.**
  //: `methods[draft.id]` used to read `?? 'credit'` here and in the picker, which made "the
  //: family chose card" and "the family answered nothing" the same value in both places --
  //: so they agreed, and agreed wrongly. An untouched screen opened a real card order on a
  //: live merchant account, and a choice lost to a reloaded tab did the same silently. That
  //: reached a family on 2026-09-12. Step 3 now holds its own button; this is the second
  //: lock, and it throws before `register` so the family exists nowhere yet and can simply
  //: answer and press again.
  const unanswered = joiningDrafts.filter(
    (candidate) =>
      !needsManagerReview(candidate) &&
      //: A child the club has already settled is never asked, so it can never be missing.
      !settled.has(candidate.id) &&
      methods[candidate.id] === undefined,
  )
  if (unanswered.length > 0) {
    throw new MissingPaymentMethodError(unanswered.map((candidate) => candidate.id))
  }

  // Let this reject: the caller keeps the family on step 3 and shows the error.
  // Everything below runs only once the family exists.
  const registered =
    joiningDrafts.length > 0
      ? await deps.register()
      : //: Nobody was registered, so every id list is empty and no charge was raised.
        //: Typed in full rather than cast, so a field added to `RegisterResult` later
        //: fails here instead of arriving as `undefined` at a call site downstream.
        ({
          person_id: '',
          student_ids: [] as string[],
          child_student_ids: [] as string[],
          charges_created: 0,
        } satisfies RegisterResult)

  try {
    await deps.refreshSession()
  } catch {
    // Not worth losing the rest over -- the reads below fail into `not_recorded` on
    // their own if the token really is unusable.
  }

  // The privacy ledger, written by the screen that asked. Swallowed like
  // `savePaymentMethods` below and for the same reason: `register` has landed, and losing a
  // consent row the gate will ask for again is not worth failing a join over.
  if (deps.grantPrivacyConsents) {
    try {
      await deps.grantPrivacyConsents()
    } catch {
      // The gate stays in front of the app, which is exactly the old behaviour.
    }
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
  /**
   * How each child says they will pay, for `PUT /me/payment-methods`.
   *
   * **Deliberately not `active`.** That list is "children with something to bill right
   * now", and two of the early returns below leave it: a card child this run raised no
   * charge for, and every child when the charges read failed. Recording the method off
   * `active` therefore missed door D's commonest shape -- a family adding a child already
   * on the roster -- and those families still read `לא הוגדר` after answering. Choosing a
   * method is a statement of intent; it does not depend on there being an invoice.
   */
  const declared: { studentId: string; method: string }[] = []

  /** The children trying a lesson rather than joining. Collected in the loop and written
   *  once after it, so a family with three trial children makes one request. */
  const trials: {
    firstName: string
    lastName: string
    birthDate: string
    groupId: string
    health: ReturnType<typeof toHealthDeclaration>
  }[] = []

  /** `credit` is the wizard's word; `upay_card` is `payment.method`'s, which is what the
   *  column holds and what `methodKey` already translates for display. */
  const stored = (method: PaymentMethod) => (method === 'credit' ? 'upay_card' : method)

  students.forEach((draft) => {
    //: `null`, never a fallback method -- see the guard above. A review child legitimately
    //: has none, and `PaymentOutcome.method` is typed for exactly that.
    const method = methods[draft.id] ?? null
    const amountAgorot = plans.find((plan) => plan.id === draft.planId)?.pricePerMonthAgorot ?? 0
    const name = `${draft.firstName} ${draft.lastName}`.trim()

    if (needsManagerReview(draft)) {
      // No write of any kind mentions this child, and none of their charges enters any
      // promise or order.
      outcomes.push({ draftId: draft.id, name, method, amountAgorot, state: 'awaiting_review' })
      return
    }

    if (draft.intent === 'trial') {
      // Not joining yet, so this child leaves the money path entirely: no payment method
      // is declared (`student.payment_method`'s CHECK has no value for a trial, and the
      // column is nullable for exactly this case), no charge is consulted, and no promise
      // or order is opened. The booking itself is one write, made after the loop.
      const groupId = draft.groupId
      if (groupId) {
        //: The declaration travels WITH the booking. Without it `trials.py` records
        //: `health_status = "missing"` — a child whose parent completed the full health
        //: step recorded as having given nothing, and §5.4a already says `trial_signed`
        //: is not enough for enrollment, so starting below even that is worse.
        trials.push({
          firstName: draft.firstName,
          lastName: draft.lastName,
          birthDate: draft.birthDate,
          groupId,
          health: toHealthDeclaration(draft, input.templateId ?? null),
        })
      }
      // `method: null` — the outcome type already allows it, and a trial child has no
      // payment method by design rather than by omission.
      outcomes.push({ draftId: draft.id, name, method: null, amountAgorot: 0, state: 'trial_booked' })
      return
    }

    if (settled.has(draft.id)) {
      //: The manager already took this money in person and said so. Nothing to promise,
      //: nothing to charge, nothing to declare — and **this must stand above the method
      //: guard below**, because nobody ever asked this family for a method: their run of
      //: the wizard had no step 3 at all. Placed under it, as it was when written, every
      //: settled child ended on `not_recorded: no_method` — the one ending that tells a
      //: family who has already paid that their payment did not land.
      outcomes.push({ draftId: draft.id, name, method: null, amountAgorot, state: 'settled' })
      return
    }

    if (method === null) {
      //: Unreachable while the guard above runs -- kept as a typed floor rather than a
      //: non-null assertion, so a future caller that skips the guard fails visibly here
      //: instead of quietly billing a card.
      outcomes.push({
        draftId: draft.id,
        name,
        method,
        amountAgorot,
        state: 'not_recorded',
        reason: 'no_method',
      })
      return
    }

    // Resolved BEFORE the charges are consulted, because the method write below needs it
    // and does not care whether there is anything to bill.
    //
    //: Indexed by position among the JOINING children, which is what `register` was given.
    //: Using the whole family's index shifted every child after a trial sibling onto the
    //: wrong student id — the kind of mistake that reads fine and bills the wrong person.
    const studentId = registered.child_student_ids[joiningDrafts.indexOf(draft)]
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


    // The family answered the question and the registration landed. Record it whatever
    // happens to the money below.
    declared.push({ studentId, method: stored(method) })

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

  // The trial children, in one write. Swallowed on failure for the same reason
  // `savePaymentMethods` is: `register` has already landed, the family exists, and losing
  // a booking they can make again is not worth failing the whole join over. The outcome
  // rows already say `trial_booked`, which is what step 4 renders.
  if (trials.length > 0 && deps.bookTrial) {
    try {
      await deps.bookTrial(trials)
    } catch {
      // Reported by nothing downstream; the child is registered either way.
    }
  }

  // How the family says they will pay. See `declared` above for why it is not `active`.
  // Children awaiting a manager's review are excluded there: a preference recorded for one
  // of those would be a fact about a registration that has not happened.
  //
  // Swallowed on failure, deliberately: `register` has already landed by here, and losing
  // a preference the family can set again in פרופיל is not worth failing a join over.
  if (declared.length > 0) {
    try {
      await deps.savePaymentMethods(declared)
    } catch {
      // Nothing downstream reads it, and no outcome changes.
    }
  }

  let checkout: UpayForm | null = null
  let checkoutUnavailable = false
  let checkoutRef: string | null = null
  const mandates: MandateRow[] = []

  /**
   * How many months forward THIS method buys, and the rule that keeps it honest.
   *
   * **Forward months are priced payer-WIDE** by the server: `prepay_months x
   * monthly_total(payer)`, over every one of the family's active students. So they can be
   * attached to exactly one method. A family putting one child on cash and another on
   * cheque would otherwise buy the whole household's months twice — once at two months and
   * once at twelve — and be promised a number nobody on either screen ever saw.
   *
   * The answer when the family splits methods is therefore zero, not a share: this month's
   * charges are still recorded per method, and the forward arrangement is made with the
   * manager afterwards. A standing order never buys months either — its mandate is what
   * collects every month after this one.
   */
  const oneMethodForEveryone =
    active.length > 0 && active.every((row) => row.method === active[0]?.method)
      ? active[0]?.method
      : null
  const forwardFor = (method: PaymentMethod): number => {
    if (method !== oneMethodForEveryone) return 0
    if (method === 'cash') return prepay.cash
    if (method === 'cheque') return prepay.cheque
    return 0
  }

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
          await deps.billing.createPromise(chargeIds, method, forwardFor(method), alreadyArranged)
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
          checkoutRef = order.public_ref
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

  return {
    personId: registered.person_id,
    outcomes,
    checkout,
    checkoutRef,
    checkoutUnavailable,
    mandates,
  }
}
