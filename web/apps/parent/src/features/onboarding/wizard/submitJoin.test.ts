// `submitJoin` is pure orchestration -- no screen renders here, so every assertion below
// is either a state a screen would read or an argument a wire call actually carried.
import { describe, expect, it, vi } from 'vitest'
import type { ChargeOut, PaymentOrderOut, PaymentPromiseOut, UpayForm } from '../../billing/billingClient'
import { DEMO_SIMULATOR } from '../../billing/PaymentsSection'
import type { StandingOrderLink } from '../../billing/PaymentSetup'
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
  standingOrderLinks?: readonly StandingOrderLink[]
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
    } as SubmitJoinDeps['billing'],
    standingOrderLinks: vi.fn().mockResolvedValue(options.standingOrderLinks ?? []),
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
