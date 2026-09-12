// `submitJoin` is pure orchestration -- no screen renders here, so every assertion below
// is either a state a screen would read or an argument a wire call actually carried.
import { describe, expect, it, vi } from 'vitest'
import type { ChargeOut, PaymentOrderOut, PaymentPromiseOut, UpayForm } from '../../billing/billingClient'
import { DEMO_SIMULATOR } from '../../billing/billingClient'
import type { MandateLink } from '../../billing/billingClient'
import { emptyStudent } from './types'
import type { StudentDraft, WizardPlan } from './types'
import { submitJoin } from './submitJoin'
import type { RegisterResult, SubmitJoinDeps, SubmitJoinInput } from './submitJoin'

const PLAN: WizardPlan = {
  id: 'plan-1',
  title: 'חודשי',
  subtitle: '',
  pricePerMonthAgorot: 30_000,
  features: [],
}

const FORM: UpayForm = { action: 'https://upay.example/pay', fields: { ref: 'x' } }

function student(id: string, overrides: Partial<StudentDraft> = {}): StudentDraft {
  return emptyStudent(id, { firstName: 'ילד', lastName: id, planId: PLAN.id, ...overrides })
}

function charge(id: string, studentId: string, amount = 30_000): ChargeOut {
  return {
    id,
    payer_person_id: 'payer-1',
    student_id: studentId,
    kind: 'tuition',
    period_year: 2026,
    period_month: 9,
    amount_agorot: amount,
    original_amount_agorot: null,
    proration_note: null,
    due_date: '2026-09-28',
    status: 'open',
    created_by: 'billing_run',
    allocated_agorot: 0,
    is_covered_elsewhere: false,
  } as ChargeOut
}

function register(overrides: Partial<RegisterResult> = {}): RegisterResult {
  return {
    person_id: 'person-1',
    student_ids: ['s1', 's2'],
    child_student_ids: ['s1', 's2'],
    charges_created: 2,
    ...overrides,
  }
}

/** A fresh set of deps every call -- each `vi.fn()` is its own mock, so one test's calls
 *  never leak into another's assertions. */
function makeDeps(options: {
  register?: RegisterResult
  registerFails?: boolean
  charges?: ChargeOut[]
  createPromise?: ReturnType<typeof vi.fn>
  createOrder?: ReturnType<typeof vi.fn>
  orderForm?: ReturnType<typeof vi.fn>
  standingOrderLinks?: readonly MandateLink[]
  savePaymentMethods?: ReturnType<typeof vi.fn>
  bookTrial?: ReturnType<typeof vi.fn>
} = {}): SubmitJoinDeps {
  return {
    register: options.registerFails
      ? vi.fn().mockRejectedValue(new Error('register failed'))
      : vi.fn().mockResolvedValue(options.register ?? register()),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    billing: {
      openCharges: vi.fn().mockResolvedValue(options.charges ?? []),
      createPromise:
        options.createPromise ?? vi.fn().mockResolvedValue({} as PaymentPromiseOut),
      createOrder:
        options.createOrder ??
        vi.fn().mockResolvedValue({ public_ref: 'order-1' } as PaymentOrderOut),
      orderForm: options.orderForm ?? vi.fn().mockResolvedValue(FORM),
      orderStatus: vi.fn().mockResolvedValue({ status: 'pending' } as PaymentOrderOut),
    } as SubmitJoinDeps['billing'],
    standingOrderLinks: vi.fn().mockResolvedValue(options.standingOrderLinks ?? []),
    savePaymentMethods: (options.savePaymentMethods ??
      vi.fn().mockResolvedValue(undefined)) as SubmitJoinDeps['savePaymentMethods'],
    bookTrial: (options.bookTrial ??
      vi.fn().mockResolvedValue(undefined)) as SubmitJoinDeps['bookTrial'],
  }
}

function input(overrides: Partial<SubmitJoinInput> & { deps: SubmitJoinDeps }): SubmitJoinInput {
  return {
    students: [],
    plans: [PLAN],
    methods: {},
    alreadyArranged: false,
    ...overrides,
  }
}

describe('submitJoin', () => {
  it('one order over both card children together, orderForm posted, both rows card_pending', async () => {
    const deps = makeDeps({
      charges: [charge('ch1', 's1'), charge('ch2', 's2')],
    })
    const result = await submitJoin(
      input({
        students: [student('c1'), student('c2')],
        methods: { c1: 'credit', c2: 'credit' },
        deps,
      }),
    )

    expect(deps.billing.createOrder).toHaveBeenCalledTimes(1)
    expect(deps.billing.createOrder).toHaveBeenCalledWith(['ch1', 'ch2'], 1, 0)
    expect(deps.billing.orderForm).toHaveBeenCalledWith('order-1')
    expect(result.checkout).toBe(FORM)
    expect(result.outcomes.map((o) => o.state)).toEqual(['card_pending', 'card_pending'])
  })

  // The owner's case, 2026-09-11: "a parent would want to register one kid with payment
  // and second with trial". Before this the only trial on offer was a link out of the
  // wizard, so the two children could not travel together at all.
  it('one child paying and one on a trial: the trial raises no charge and opens no order', async () => {
    const bookTrial = vi.fn().mockResolvedValue(undefined)
    const savePaymentMethods = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({
      charges: [charge('ch1', 's1'), charge('ch2', 's2')],
      bookTrial,
      savePaymentMethods,
    })
    const result = await submitJoin(
      input({
        students: [student('c1'), student('c2', { groupId: 'grp-7', intent: 'trial' })],
        methods: { c1: 'credit' },
        deps,
      }),
    )

    // The paying child is billed for THEIR charge alone. `ch2` belongs to the trial child
    // and must not ride into the order — that is the failure that would charge a family
    // for a lesson they were only trying.
    expect(deps.billing.createOrder).toHaveBeenCalledTimes(1)
    expect(deps.billing.createOrder).toHaveBeenCalledWith(['ch1'], 1, 0)

    // The trial child is booked, with the group step 2 collected.
    expect(bookTrial).toHaveBeenCalledTimes(1)
    expect(bookTrial).toHaveBeenCalledWith([
      expect.objectContaining({ groupId: 'grp-7' }),
    ])

    // And no payment method is declared for them: `student.payment_method` has a CHECK
    // with no room for a trial, and the column is nullable for exactly this case.
    const declared = savePaymentMethods.mock.calls[0]?.[0] ?? []
    expect(declared).toHaveLength(1)
    expect(declared[0].method).toBe('upay_card')

    expect(result.outcomes.map((o) => o.state)).toEqual(['card_pending', 'trial_booked'])
  })

  it('a trial child alone opens no order at all', async () => {
    const deps = makeDeps({ charges: [charge('ch1', 's1')] })
    const result = await submitJoin(
      input({ students: [student('c1', { groupId: 'grp-7', intent: 'trial' })], methods: {}, deps }),
    )

    expect(deps.billing.createOrder).not.toHaveBeenCalled()
    expect(deps.billing.createPromise).not.toHaveBeenCalled()
    expect(result.checkout).toBeNull()
    expect(result.outcomes.map((o) => o.state)).toEqual(['trial_booked'])
  })

  it('cash and cheque each get exactly one createPromise call, over only their own charges', async () => {
    const deps = makeDeps({
      charges: [charge('ch1', 's1'), charge('ch2', 's2')],
    })
    const result = await submitJoin(
      input({
        students: [student('c1'), student('c2')],
        methods: { c1: 'cash', c2: 'cheque' },
        deps,
      }),
    )

    expect(deps.billing.createPromise).toHaveBeenCalledTimes(2)
    expect(deps.billing.createPromise).toHaveBeenCalledWith(['ch1'], 'cash', 0, false)
    expect(deps.billing.createPromise).toHaveBeenCalledWith(['ch2'], 'cheque', 0, false)
    expect(result.outcomes.map((o) => o.state)).toEqual(['recorded', 'recorded'])
  })

  it('a child already on the roster (no charge raised) gets a plan-claim promise', async () => {
    const deps = makeDeps({
      register: register({ student_ids: [], child_student_ids: ['s1'], charges_created: 0 }),
      charges: [],
    })
    const result = await submitJoin(
      input({
        students: [student('c1')],
        methods: { c1: 'cash' },
        deps,
      }),
    )

    expect(deps.billing.createPromise).toHaveBeenCalledTimes(1)
    expect(deps.billing.createPromise).toHaveBeenCalledWith([], 'cash', 0, false, PLAN.id)
    expect(result.outcomes[0]?.state).toBe('recorded')
  })

  it('the same already-on-the-roster child choosing card gets no_charge_for_card, no order', async () => {
    const deps = makeDeps({
      register: register({ student_ids: [], child_student_ids: ['s1'], charges_created: 0 }),
      charges: [],
    })
    const result = await submitJoin(
      input({
        students: [student('c1')],
        methods: { c1: 'credit' },
        deps,
      }),
    )

    expect(deps.billing.createOrder).not.toHaveBeenCalled()
    expect(result.outcomes[0]).toMatchObject({ state: 'not_recorded', reason: 'no_charge_for_card' })
  })

  it('a flagged child is awaiting_review and their charge touches no write', async () => {
    const deps = makeDeps({
      charges: [charge('ch1', 's1'), charge('ch2', 's2')],
    })
    const result = await submitJoin(
      input({
        students: [
          student('c1', { healthAnswers: { limp: true } }),
          student('c2'),
        ],
        methods: { c1: 'cash', c2: 'cash' },
        deps,
      }),
    )

    expect(result.outcomes[0]?.state).toBe('awaiting_review')
    expect(deps.billing.createPromise).toHaveBeenCalledTimes(1)
    expect(deps.billing.createPromise).toHaveBeenCalledWith(['ch2'], 'cash', 0, false)
    for (const call of (deps.billing.createPromise as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).not.toContain('ch1')
    }
    for (const call of (deps.billing.createOrder as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).not.toContain('ch1')
    }
  })

  it('a standing-order child with a matching link gets a mandate and mandate_pending', async () => {
    const deps = makeDeps({
      register: register({ student_ids: ['s1'], child_student_ids: ['s1'] }),
      charges: [charge('ch1', 's1')],
      standingOrderLinks: [{ studentId: 's1', amountAgorot: 30_000, url: 'https://upay/link1' }],
    })
    const result = await submitJoin(
      input({
        students: [student('c1')],
        methods: { c1: 'standing_order' },
        deps,
      }),
    )

    expect(deps.billing.createPromise).toHaveBeenCalledWith(['ch1'], 'standing_order', 0, false)
    expect(result.mandates).toEqual([
      { draftId: 'c1', studentId: 's1', name: 'ילד c1', amountAgorot: 30_000, url: 'https://upay/link1' },
    ])
    expect(result.outcomes[0]?.state).toBe('mandate_pending')
  })

  it('a createPromise failure for one method never loses another method\'s result', async () => {
    const createPromise = vi.fn().mockImplementation((_chargeIds: string[], method: string) =>
      method === 'cash' ? Promise.reject(new Error('boom')) : Promise.resolve({} as PaymentPromiseOut),
    )
    const deps = makeDeps({
      charges: [charge('ch1', 's1'), charge('ch2', 's2')],
      createPromise,
    })
    const result = await submitJoin(
      input({
        students: [student('c1'), student('c2')],
        methods: { c1: 'cash', c2: 'cheque' },
        deps,
      }),
    )

    expect(result.outcomes[0]).toMatchObject({ state: 'not_recorded', reason: 'write_failed' })
    expect(result.outcomes[1]).toMatchObject({ state: 'recorded' })
  })

  it('alreadyArranged true reaches every createPromise call as the fourth argument', async () => {
    const deps = makeDeps({
      register: register({
        student_ids: ['s1', 's2', 's3'],
        child_student_ids: ['s1', 's2', 's3', 's4'],
        charges_created: 3,
      }),
      charges: [charge('ch1', 's1'), charge('ch2', 's2'), charge('ch3', 's3')],
    })
    await submitJoin(
      input({
        students: [student('c1'), student('c2'), student('c3'), student('c4')],
        methods: { c1: 'cash', c2: 'cheque', c3: 'standing_order', c4: 'cash' },
        alreadyArranged: true,
        deps,
      }),
    )

    const calls = (deps.billing.createPromise as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call[3]).toBe(true)
    }
  })

  it('orderForm resolving DEMO_SIMULATOR leaves checkout null but rows card_pending', async () => {
    const deps = makeDeps({
      charges: [charge('ch1', 's1'), charge('ch2', 's2')],
      orderForm: vi.fn().mockResolvedValue(DEMO_SIMULATOR),
    })
    const result = await submitJoin(
      input({
        students: [student('c1'), student('c2')],
        methods: { c1: 'credit', c2: 'credit' },
        deps,
      }),
    )

    expect(result.checkout).toBeNull()
    expect(result.checkoutUnavailable).toBe(true)
    expect(result.outcomes.map((o) => o.state)).toEqual(['card_pending', 'card_pending'])
  })

  it("door D's scope: a sibling's open charge never enters any write", async () => {
    const deps = makeDeps({
      register: register({ student_ids: ['s1'], child_student_ids: ['s1'] }),
      charges: [charge('ch1', 's1'), charge('sibling-ch', 'sibling-student')],
    })
    const result = await submitJoin(
      input({
        students: [student('c1')],
        methods: { c1: 'cash' },
        deps,
      }),
    )

    expect(deps.billing.createPromise).toHaveBeenCalledWith(['ch1'], 'cash', 0, false)
    for (const call of (deps.billing.createPromise as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).not.toContain('sibling-ch')
    }
    for (const call of (deps.billing.createOrder as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).not.toContain('sibling-ch')
    }
    expect(result.outcomes[0]?.state).toBe('recorded')
  })

  it('a register rejection rejects submitJoin and calls no write', async () => {
    const deps = makeDeps({ registerFails: true })

    await expect(
      submitJoin(
        input({
          students: [student('c1')],
          methods: { c1: 'cash' },
          deps,
        }),
      ),
    ).rejects.toThrow()

    expect(deps.billing.createPromise).not.toHaveBeenCalled()
    expect(deps.billing.createOrder).not.toHaveBeenCalled()
  })
})

// ── the method the family picked is actually recorded (owner review, 2026-09-08) ──────
//
// "Even though I finished the full wizard the payment option didn't get written."
//
// It could not be. `payment_promise.method` is `IN ('cash','cheque','standing_order')`, so
// three of the four methods wrote a promise and the fourth wrote a `payment_order` — and
// the profile screen derived the method from the promise list. A card family read
// `לא הוגדר` however many times they answered.

describe('recording how the family says they will pay', () => {
  it('records the method for a CARD child, which no promise could carry', async () => {
    const savePaymentMethods = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({ charges: [charge('ch1', 's1')], savePaymentMethods })

    await submitJoin(
      input({ students: [student('c1')], methods: { c1: 'credit' }, deps }),
    )

    // `credit` is the wizard's word; `upay_card` is `payment.method`'s, which is what the
    // column holds and what `methodKey` already translates.
    expect(savePaymentMethods).toHaveBeenCalledWith([{ studentId: 's1', method: 'upay_card' }])
  })

  it('records every child, on whichever route each of them takes', async () => {
    const savePaymentMethods = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({
      charges: [charge('ch1', 's1'), charge('ch2', 's2')],
      savePaymentMethods,
    })

    await submitJoin(
      input({
        students: [student('c1'), student('c2')],
        methods: { c1: 'standing_order', c2: 'cash' },
        deps,
      }),
    )

    expect(savePaymentMethods).toHaveBeenCalledWith([
      { studentId: 's1', method: 'standing_order' },
      { studentId: 's2', method: 'cash' },
    ])
  })

  it('says nothing about a child the manager still has to review', async () => {
    // No write of any kind mentions them. A preference recorded for a child whose health
    // answers are flagged would be a fact about a registration that has not happened.
    const savePaymentMethods = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({ charges: [charge('ch1', 's1')], savePaymentMethods })

    await submitJoin(
      input({
        students: [student('c1', { healthAnswers: { heart: true } })],
        methods: { c1: 'cash' },
        deps,
      }),
    )

    expect(savePaymentMethods).not.toHaveBeenCalled()
  })

  it('does not fail the join when the method write fails', async () => {
    // The registration has already landed by this point. Losing a preference is not worth
    // failing a join over, and the family can set it in פרופיל.
    const deps = makeDeps({
      charges: [charge('ch1', 's1')],
      savePaymentMethods: vi.fn().mockRejectedValue(new Error('offline')),
    })

    const result = await submitJoin(
      input({ students: [student('c1')], methods: { c1: 'credit' }, deps }),
    )

    expect(result.outcomes[0]!.state).toBe('card_pending')
  })

  it('records the method for a card child this run raised no charge for', async () => {
    // The gap in the first cut of this fix, found 2026-09-08. A card child with no open
    // charge returns EARLY -- there is nothing for uPay to bill -- and the method write
    // was iterating the same list that early return skips. So door D's commonest shape,
    // a family adding a child who is already on the roster, still recorded nothing and
    // the profile still said `לא הוגדר`.
    //
    // Choosing a method is a statement of intent. It does not depend on there being
    // something to bill this minute.
    const savePaymentMethods = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({ charges: [], savePaymentMethods })

    const result = await submitJoin(
      input({ students: [student('c1')], methods: { c1: 'credit' }, deps }),
    )

    expect(savePaymentMethods).toHaveBeenCalledWith([{ studentId: 's1', method: 'upay_card' }])
    // …and the outcome it reports is unchanged: there really was nothing to charge.
    expect(result.outcomes[0]!.reason).toBe('no_charge_for_card')
  })

  it('records the method even when the charges read failed', async () => {
    // Same reasoning one step further out. The registration landed; the family answered
    // the question; losing their answer because a DIFFERENT read failed helps nobody.
    const savePaymentMethods = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({ savePaymentMethods })
    deps.billing.openCharges = vi.fn().mockRejectedValue(new Error('offline'))

    await submitJoin(input({ students: [student('c1')], methods: { c1: 'cash' }, deps }))

    expect(savePaymentMethods).toHaveBeenCalledWith([{ studentId: 's1', method: 'cash' }])
  })
})

// ── the child whose payment the manager already took (2026-09-12) ─────────────────────
//
// A manager can add a child and tick "already paid" — they took the money in person. That
// child's parent never sees step 3, so no method is ever chosen for them, and `submitJoin`
// is told so through `settledStudentIds`.

describe('submitJoin — a child the club already settled', () => {
  it('registers them and writes no promise, no order and no method', async () => {
    const createPromise = vi.fn()
    const createOrder = vi.fn()
    const savePaymentMethods = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({
      charges: [charge('ch1', 's1')],
      createPromise,
      createOrder,
      savePaymentMethods,
    })

    const result = await submitJoin(
      input({
        students: [student('c1')],
        // No method — nobody asked, which is the whole point of the two-step run.
        methods: {},
        settledStudentIds: ['c1'],
        deps,
      }),
    )

    expect(deps.register).toHaveBeenCalledTimes(1)
    expect(createPromise).not.toHaveBeenCalled()
    expect(createOrder).not.toHaveBeenCalled()
    expect(savePaymentMethods).not.toHaveBeenCalled()
    // `settled` and not `recorded`: `recorded` tells a family their chosen METHOD was
    // filed, and this family chose nothing — the money is already with the club.
    expect(result.outcomes[0]).toMatchObject({ state: 'settled', method: null })
    expect(result.outcomes[0]?.reason).toBeUndefined()
    expect(result.checkout).toBeNull()
  })

  it('still asks the sibling who is NOT settled', async () => {
    // A two-child family where the manager took cash for one of them. The other is an
    // ordinary chargeable child, so the missing-method guard must still refuse.
    const deps = makeDeps()
    await expect(
      submitJoin(
        input({
          students: [student('c1'), student('c2')],
          methods: {},
          settledStudentIds: ['c1'],
          deps,
        }),
      ),
    ).rejects.toMatchObject({ name: 'MissingPaymentMethodError', draftIds: ['c2'] })
    expect(deps.register).not.toHaveBeenCalled()
  })
})
