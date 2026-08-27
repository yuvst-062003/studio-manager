// SPEC §5.15's rollover wizard — "the single highest-leverage screen in the product".
//
// The tests below are grouped by the promise each one protects rather than by component,
// because the promises are what W6's exit gate is written against:
//
//  * **Resuming lands where the server says.** §5.15 makes the wizard resumable and
//    `RolloverStateOut.resume_at` says why it is never step 1: "a manager who closed the tab
//    after pricing comes back to pricing, not to retyping the year's name". Landing on step 1
//    anyway is how a manager concludes nothing was saved.
//  * **Nothing is carried by colour alone** (SC 1.4.1). Every step's status is a word, on the
//    rail and inside the step, and the assertions read the text rather than a class.
//  * **A refusal is never swallowed.** `BulkOutcome` carries refusals instead of raising so
//    the manager can see what was skipped; a screen that rendered only `applied` would throw
//    that list away and put them back in the state the server went to trouble to avoid.
//  * **A derived step is never marked by hand.** `PATCH .../steps/{year|generate}` answers
//    409, so the screen must not send one — asserted by the absence of the call, because an
//    absent request is the only observable version of "we did not try".
//  * **The optional step stays optional.** `complete` counts `skipped`, and a wizard that
//    would not finish without an announcement "trains people to announce things they did not
//    want to send".
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { RolloverWizard } from './RolloverWizard'
import { ROLLOVER_STEP_ORDER } from './types'
import type { RolloverStepId, RolloverStepStatus } from './types'
import type {
  BulkOutcome,
  ClassRow,
  EnrollmentRow,
  GroupRow,
  PricePlanRow,
  RolloverClient,
  RolloverState,
  TrainingYear,
} from './client'

const YEAR: TrainingYear = {
  id: 'y1',
  name: 'תשפ״ח',
  starts_on: '2027-09-01',
  ends_on: '2028-06-30',
  status: 'draft',
}

const GROUPS: GroupRow[] = [
  { id: 'g1', name: 'ילדים א', class_id: 'c1', class_name: 'ג׳ודו', is_active: true },
  { id: 'g2', name: 'נוער', class_id: 'c1', class_name: 'ג׳ודו', is_active: true },
]

const CLASSES: ClassRow[] = [{ id: 'c1', name: 'ג׳ודו' }]

const ENROLLMENTS: EnrollmentRow[] = [
  {
    enrollment_id: 'e1',
    student_id: 's1',
    student_name: 'דנה כהן',
    group_id: 'g1',
    group_name: 'ילדים א',
  },
  {
    enrollment_id: 'e2',
    student_id: 's2',
    student_name: 'יואב לוי',
    group_id: 'g1',
    group_name: 'ילדים א',
  },
]

const PLANS: PricePlanRow[] = [
  {
    id: 'p1',
    name: 'פעמיים בשבוע',
    monthly_amount_agorot: 28000,
    registration_fee_agorot: 5000,
    sessions_per_week: 2,
    active_from: '2026-09-01',
    active_to: null,
    standing_order_link_url: null,
  },
]

type Statuses = Partial<Record<RolloverStepId, RolloverStepStatus>>

/** `year` is always `done`: the server answers it "by the fact that we are here at all". */
function buildState(statuses: Statuses, extra: Partial<RolloverState> = {}): RolloverState {
  const steps = ROLLOVER_STEP_ORDER.map((id) => ({
    id,
    status: (id === 'year' ? 'done' : (statuses[id] ?? 'pending')) as RolloverStepStatus,
    detail: id === 'generate' ? (extra.sessions_generated ?? 0) : null,
  }))
  const pending = steps.find((step) => step.status === 'pending')
  return {
    training_year: { ...YEAR },
    steps,
    resume_at: (pending?.id ?? 'announce') as RolloverStepId,
    complete: steps.every((step) => step.status !== 'pending'),
    closures: 4,
    groups_active: 2,
    students_enrolled: 2,
    price_plans_open: 1,
    sessions_generated: 0,
    ...extra,
  }
}

const EMPTY_OUTCOME: BulkOutcome = { applied: 0, refused: [] }

/**
 * A stub that remembers what it was told, so `setStep` moves the wizard the way the server
 * would. A frozen fixture would let the skip test pass without the state ever changing.
 */
function stub(
  statuses: Statuses = {},
  extra: Partial<RolloverState> = {},
  overrides: Partial<RolloverClient> = {},
): RolloverClient {
  const current: Statuses = { ...statuses }
  return {
    listTrainingYears: vi.fn(async () => [YEAR]),
    createTrainingYear: vi.fn(async () => YEAR),
    readState: vi.fn(async () => buildState(current, extra)),
    setStep: vi.fn(async (_yearId: string, stepId: RolloverStepId, status: RolloverStepStatus) => {
      current[stepId] = status
      return buildState(current, extra)
    }),
    applyGroups: vi.fn(async () => EMPTY_OUTCOME),
    applyStudents: vi.fn(async () => EMPTY_OUTCOME),
    applyPrices: vi.fn(async () => EMPTY_OUTCOME),
    announce: vi.fn(async () => ({ announcement_id: 'a1', families: 37 })),
    listHolidayPresets: vi.fn(async () => [
      { key: 'yom_kippur', name: 'יום כיפור', date_from: '2027-10-11', date_to: '2027-10-11' },
    ]),
    createClosure: vi.fn(async () => ({ sessions_cancelled: 3 })),
    generateSessions: vi.fn(async () => ({
      training_year_id: 'y1',
      groups: 9,
      sessions_created: 412,
    })),
    activateYear: vi.fn(async () => ({ ...YEAR, status: 'active' as const })),
    listGroups: vi.fn(async () => GROUPS),
    listClasses: vi.fn(async () => CLASSES),
    listEnrollments: vi.fn(async () => ENROLLMENTS),
    listPricePlans: vi.fn(async () => PLANS),
    ...overrides,
  }
}

async function renderWizard(client: RolloverClient, locale: Locale = 'he') {
  render(<RolloverWizard locale={locale} client={client} />)
  await screen.findByTestId('rollover-wizard')
  return client
}

/** Everything answered but step 7 — the state the skip test needs. */
const ALL_BUT_ANNOUNCE: Statuses = {
  closures: 'done',
  groups: 'done',
  students: 'done',
  prices: 'done',
  generate: 'done',
}

afterEach(() => {
  document.documentElement.dir = ''
})

describe('RolloverWizard · resuming', () => {
  it('opens the step the server named in resume_at, not step 1', async () => {
    // §5.15's resumability, in the one assertion that can fail it.
    await renderWizard(stub({ closures: 'done', groups: 'done' }))
    expect(await screen.findByTestId('rollover-step-students')).toBeInTheDocument()
    expect(screen.queryByTestId('rollover-step-year')).toBeNull()
    expect(screen.queryByTestId('rollover-step-closures')).toBeNull()
  })

  it('reports the position of the resumed step, not of the first one', async () => {
    await renderWizard(stub({ closures: 'done', groups: 'done' }))
    // students is 4 of 7.
    expect(screen.getByTestId('rollover-position')).toHaveTextContent('4')
    expect(screen.getByTestId('rollover-position')).toHaveTextContent('7')
  })

  it('lets a manager step back to a finished step from the rail', async () => {
    await renderWizard(stub({ closures: 'done', groups: 'done' }))
    await userEvent.click(screen.getByTestId('rollover-rail-closures'))
    expect(await screen.findByTestId('rollover-step-closures')).toBeInTheDocument()
  })
})

describe('RolloverWizard · the rail', () => {
  it('is an ordered list and marks the active step with aria-current="step"', async () => {
    await renderWizard(stub({ closures: 'done', groups: 'done' }))
    const rail = screen.getByRole('list')
    expect(rail.tagName).toBe('OL')
    expect(rail).toHaveAccessibleName(t('he', 'schedule.rollover.progressLabel'))

    expect(screen.getByTestId('rollover-rail-students')).toHaveAttribute('aria-current', 'step')
    for (const stepId of ROLLOVER_STEP_ORDER) {
      if (stepId === 'students') continue
      expect(screen.getByTestId(`rollover-rail-${stepId}`)).not.toHaveAttribute('aria-current')
    }
  })

  it('writes every step status out as a word rather than carrying it in colour', async () => {
    // SC 1.4.1. `data-status` is what a stylesheet would tint; the assertion is that the
    // TEXT says the same thing, for each of the three states at once.
    await renderWizard(stub({ closures: 'done', groups: 'skipped' }))
    const expected: Record<RolloverStepId, RolloverStepStatus> = {
      year: 'done',
      closures: 'done',
      groups: 'skipped',
      students: 'pending',
      prices: 'pending',
      generate: 'pending',
      announce: 'pending',
    }
    for (const stepId of ROLLOVER_STEP_ORDER) {
      const chip = screen.getByTestId(`rollover-rail-${stepId}`)
      expect(chip).toHaveAttribute('data-status', expected[stepId])
      expect(screen.getByTestId(`rollover-rail-${stepId}-status`)).toHaveTextContent(
        t('he', `schedule.rollover.status.${expected[stepId]}`),
      )
    }
  })

  it('renders all seven steps, disabling any the server did not send rather than hiding it', async () => {
    const partial = stub()
    partial.readState = vi.fn(async () => ({
      ...buildState({}),
      steps: [{ id: 'year' as RolloverStepId, status: 'done' as RolloverStepStatus, detail: null }],
      resume_at: 'year' as RolloverStepId,
    }))
    await renderWizard(partial)
    for (const stepId of ROLLOVER_STEP_ORDER) {
      expect(screen.getByTestId(`rollover-rail-${stepId}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('rollover-rail-prices')).toBeDisabled()
    expect(screen.getByTestId('rollover-rail-year')).toBeEnabled()
  })

  it('has one h1 and starts the steps at h2', async () => {
    await renderWizard(stub({ closures: 'done', groups: 'done' }))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      t('he', 'schedule.rollover.students.title'),
    )
  })
})

describe('RolloverWizard · derived steps', () => {
  it('never sends a PATCH for `generate`, because the server answers 409', async () => {
    const client = await renderWizard(
      stub({ closures: 'done', groups: 'done', students: 'done', prices: 'done' }),
    )
    expect(await screen.findByTestId('rollover-step-generate')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('rollover-done-generate'))
    await waitFor(() => expect(screen.getByTestId('rollover-step-announce')).toBeInTheDocument())
    expect(client.setStep).not.toHaveBeenCalled()
  })

  it('offers no skip control on a derived step, and says why', async () => {
    await renderWizard(stub({ closures: 'done', groups: 'done', students: 'done', prices: 'done' }))
    expect(screen.queryByTestId('rollover-skip-generate')).toBeNull()
    expect(screen.getByTestId('rollover-derived-generate')).toHaveTextContent(
      t('he', 'schedule.rollover.derivedHint'),
    )
  })

  it('shows what generation created rather than only that it ran', async () => {
    const client = await renderWizard(
      stub({ closures: 'done', groups: 'done', students: 'done', prices: 'done' }),
    )
    await userEvent.click(screen.getByTestId('rollover-generate-run'))
    const summary = await screen.findByTestId('rollover-generate-result')
    expect(summary).toHaveAttribute('role', 'status')
    expect(summary).toHaveTextContent('412')
    expect(summary).toHaveTextContent('9')
    expect(client.generateSessions).toHaveBeenCalledWith('y1')
  })
})

describe('RolloverWizard · groups', () => {
  const atGroups: Statuses = { closures: 'done' }

  it('puts a retire behind a modal confirmation and writes nothing when it is cancelled', async () => {
    const client = await renderWizard(stub(atGroups))
    await screen.findByTestId('rollover-step-groups')
    await userEvent.click(await screen.findByTestId('rollover-group-mark-g2'))
    await userEvent.click(screen.getByTestId('rollover-groups-apply'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName(t('he', 'schedule.rollover.groups.confirmTitle'))

    await userEvent.click(screen.getByTestId('rollover-groups-confirm-cancel'))
    expect(client.applyGroups).not.toHaveBeenCalled()
  })

  it('renders every refusal with its reason, beside the count that did apply', async () => {
    const client = await renderWizard(
      stub(atGroups, {}, {
        applyGroups: vi.fn(async () => ({
          applied: 1,
          refused: [
            { id: 'g7', reason: 'not_found' },
            { id: 'g8', reason: 'empty_name' },
          ],
        })),
      }),
    )
    await screen.findByTestId('rollover-step-groups')
    await userEvent.click(await screen.findByTestId('rollover-group-mark-g2'))
    await userEvent.click(screen.getByTestId('rollover-groups-apply'))
    await userEvent.click(await screen.findByTestId('rollover-groups-confirm-confirm'))

    await waitFor(() => expect(client.applyGroups).toHaveBeenCalled())
    expect(client.applyGroups).toHaveBeenCalledWith(
      'y1',
      expect.objectContaining({ retire: ['g2'] }),
    )

    const rows = await screen.findAllByTestId('rollover-groups-outcome-refusal')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('g7')
    expect(rows[0]).toHaveTextContent(t('he', 'schedule.rollover.refusal.not_found'))
    expect(rows[1]).toHaveTextContent('g8')
    expect(rows[1]).toHaveTextContent(t('he', 'schedule.rollover.refusal.empty_name'))
    // The applied count is a polite confirmation, not an interruption.
    expect(screen.getByTestId('rollover-groups-outcome-applied')).toHaveAttribute('role', 'status')
  })

  it('refuses an empty submission with a message rather than a silent no-op', async () => {
    const client = await renderWizard(stub(atGroups))
    await screen.findByTestId('rollover-step-groups')
    await userEvent.click(screen.getByTestId('rollover-groups-apply'))
    const error = await screen.findByTestId('rollover-groups-error')
    expect(error).toHaveAttribute('role', 'alert')
    expect(client.applyGroups).not.toHaveBeenCalled()
  })

  it('gives the table a caption and every control an accessible name', async () => {
    await renderWizard(stub(atGroups))
    await screen.findByTestId('rollover-step-groups')
    expect(screen.getByRole('table')).toHaveAccessibleName(
      t('he', 'schedule.rollover.groups.caption'),
    )
    for (const box of screen.getAllByRole('textbox')) {
      expect(box).toHaveAccessibleName()
    }
    for (const picker of screen.getAllByRole('combobox')) {
      expect(picker).toHaveAccessibleName()
    }
  })
})

describe('RolloverWizard · students', () => {
  const atStudents: Statuses = { closures: 'done', groups: 'done' }

  it('says there is no automatic age promotion, and offers no control that would do one', async () => {
    // §5.15 forbids it for v1 in as many words, and `app/routers/rollover.py` repeats why.
    await renderWizard(stub(atStudents))
    await screen.findByTestId('rollover-step-students')
    expect(screen.getByTestId('rollover-students-no-auto')).toHaveTextContent(
      t('he', 'schedule.rollover.students.noAutoPromotion'),
    )
    // Every move select defaults to "stays" — nothing is pre-selected on a student's behalf.
    for (const picker of screen.getAllByTestId(/^rollover-student-move-/)) {
      expect(picker).toHaveValue('')
    }
  })

  it('sends the moves a human chose, keyed by enrollment and not by student', async () => {
    const client = await renderWizard(stub(atStudents))
    await screen.findByTestId('rollover-step-students')
    await userEvent.selectOptions(screen.getByTestId('rollover-student-move-e1'), 'g2')
    await userEvent.click(screen.getByTestId('rollover-students-apply'))

    await waitFor(() => expect(client.applyStudents).toHaveBeenCalled())
    expect(client.applyStudents).toHaveBeenCalledWith('y1', {
      moves: [{ enrollment_id: 'e1', to_group_id: 'g2' }],
      not_returning: [],
    })
  })

  it('puts "not returning" behind the same modal confirmation a retire gets', async () => {
    const client = await renderWizard(stub(atStudents))
    await screen.findByTestId('rollover-step-students')
    await userEvent.click(screen.getByTestId('rollover-student-leaving-e2'))
    await userEvent.click(screen.getByTestId('rollover-students-apply'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await userEvent.click(screen.getByTestId('rollover-students-confirm-confirm'))

    await waitFor(() => expect(client.applyStudents).toHaveBeenCalled())
    expect(client.applyStudents).toHaveBeenCalledWith('y1', {
      moves: [],
      not_returning: ['e2'],
    })
  })
})

describe('RolloverWizard · prices', () => {
  const atPrices: Statuses = { closures: 'done', groups: 'done', students: 'done' }

  it('says the old plan is closed rather than overwritten, where the price is typed', async () => {
    await renderWizard(stub(atPrices))
    await screen.findByTestId('rollover-step-prices')
    expect(screen.getByTestId('rollover-prices-versioned')).toHaveTextContent(
      t('he', 'schedule.rollover.prices.intro'),
    )
  })

  it('badges a plan whose standing-order link is missing, where prices are reviewed', async () => {
    // This is the screen where §3.2 BITES. Repricing closes the plan and opens a successor
    // with a deliberately NULL link, so the manager leaves this step with every link gone
    // and no reason to suspect it. The badge is the prompt; without it the club spends the
    // new year with parents who cannot find the link they were told to use.
    await renderWizard(stub(atPrices))
    await screen.findByTestId('rollover-step-prices')
    expect(screen.getByTestId('rollover-plan-link-missing-p1')).toHaveTextContent(
      t('he', 'billing.plan.linkMissing'),
    )
  })

  it('shows the current amount in shekels and sends the new one in agorot', async () => {
    // G2 at the one boundary where a human types money.
    const client = await renderWizard(stub(atPrices))
    await screen.findByTestId('rollover-step-prices')
    expect(screen.getByTestId('rollover-plan-current-p1')).toHaveTextContent('280₪')

    await userEvent.type(screen.getByTestId('rollover-plan-amount-p1'), '300')
    await userEvent.click(screen.getByTestId('rollover-prices-apply'))
    await userEvent.click(await screen.findByTestId('rollover-prices-confirm-confirm'))

    await waitFor(() => expect(client.applyPrices).toHaveBeenCalled())
    expect(client.applyPrices).toHaveBeenCalledWith('y1', {
      repricings: [{ plan_id: 'p1', monthly_amount_agorot: 30000 }],
    })
  })

  it('omits the registration fee when its box is blank, rather than sending zero', async () => {
    // Omitted means inherit; `0` means there is no fee. `PlanRepricing` calls that real
    // money, and sending 0 for a blank box would quietly waive every studio's fee.
    const client = await renderWizard(stub(atPrices))
    await screen.findByTestId('rollover-step-prices')
    await userEvent.type(screen.getByTestId('rollover-plan-amount-p1'), '300')
    await userEvent.click(screen.getByTestId('rollover-prices-apply'))
    await userEvent.click(await screen.findByTestId('rollover-prices-confirm-confirm'))

    await waitFor(() => expect(client.applyPrices).toHaveBeenCalled())
    const [, body] = vi.mocked(client.applyPrices).mock.calls[0] as [string, { repricings: object[] }]
    expect(body.repricings[0]).not.toHaveProperty('registration_fee_agorot')
  })

  it('refuses an unparseable amount before asking the server', async () => {
    const client = await renderWizard(stub(atPrices))
    await screen.findByTestId('rollover-step-prices')
    await userEvent.type(screen.getByTestId('rollover-plan-amount-p1'), 'שלוש מאות')
    await userEvent.click(screen.getByTestId('rollover-prices-apply'))
    expect(await screen.findByTestId('rollover-prices-error')).toHaveTextContent(
      t('he', 'schedule.rollover.prices.badAmount'),
    )
    expect(client.applyPrices).not.toHaveBeenCalled()
  })
})

describe('RolloverWizard · closures', () => {
  it('offers holidays unticked and closes nothing until the button is pressed', async () => {
    // §5.6, which the wizard inherits rather than relaxes: "nothing is closed automatically
    // — studios differ, and a wrong guess deletes real lessons."
    const client = await renderWizard(stub())
    await screen.findByTestId('rollover-step-closures')
    await userEvent.click(screen.getByTestId('rollover-closures-presets'))
    const boxes = await screen.findAllByTestId('rollover-preset-day')
    for (const box of boxes) expect(box).not.toBeChecked()
    expect(client.createClosure).not.toHaveBeenCalled()

    await userEvent.click(boxes[0] as HTMLElement)
    await userEvent.click(screen.getByTestId('rollover-closures-apply'))
    await waitFor(() => expect(client.createClosure).toHaveBeenCalledTimes(1))
    expect(client.createClosure).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'holiday_preset', training_year_id: 'y1' }),
    )
    expect(await screen.findByTestId('rollover-closures-outcome')).toHaveTextContent('3')
  })
})

describe('RolloverWizard · announce', () => {
  it('can be skipped, and the wizard still reports itself complete', async () => {
    const client = await renderWizard(stub(ALL_BUT_ANNOUNCE, { sessions_generated: 412 }))
    await screen.findByTestId('rollover-step-announce')
    expect(screen.getByTestId('rollover-complete')).toHaveTextContent(
      t('he', 'schedule.rollover.incomplete'),
    )

    await userEvent.click(screen.getByTestId('rollover-skip-announce'))
    await waitFor(() =>
      expect(screen.getByTestId('rollover-complete')).toHaveTextContent(
        t('he', 'schedule.rollover.complete'),
      ),
    )
    expect(client.setStep).toHaveBeenCalledWith('y1', 'announce', 'skipped')
    expect(client.announce).not.toHaveBeenCalled()
  })

  it('publishes to every guardian in one press and says how many families it reached', async () => {
    const client = await renderWizard(stub(ALL_BUT_ANNOUNCE, { sessions_generated: 412 }))
    await screen.findByTestId('rollover-step-announce')
    await userEvent.type(screen.getByTestId('rollover-announce-subject'), 'שנה חדשה')
    await userEvent.type(screen.getByTestId('rollover-announce-body'), 'הלו״ז החדש פורסם')
    await userEvent.click(screen.getByTestId('rollover-announce-publish'))

    await waitFor(() => expect(client.announce).toHaveBeenCalled())
    expect(client.announce).toHaveBeenCalledWith('y1', {
      title: 'שנה חדשה',
      body: 'הלו״ז החדש פורסם',
    })
    const published = await screen.findByTestId('rollover-announce-published')
    expect(published).toHaveAttribute('role', 'status')
    expect(published).toHaveTextContent('37')
  })

  it('refuses an empty announcement with a linked, announced error', async () => {
    const client = await renderWizard(stub(ALL_BUT_ANNOUNCE, { sessions_generated: 412 }))
    await screen.findByTestId('rollover-step-announce')
    await userEvent.click(screen.getByTestId('rollover-announce-publish'))
    expect(await screen.findByTestId('rollover-announce-error')).toHaveAttribute('role', 'alert')
    expect(client.announce).not.toHaveBeenCalled()
  })

  it('activates the year as its own press, never as a side effect of announcing', async () => {
    // §5.15: nothing is visible to guardians until activation. A studio that announced by
    // mistake must not discover it opened the year too.
    const client = await renderWizard(stub(ALL_BUT_ANNOUNCE, { sessions_generated: 412 }))
    await screen.findByTestId('rollover-step-announce')
    await userEvent.type(screen.getByTestId('rollover-announce-subject'), 'שנה חדשה')
    await userEvent.type(screen.getByTestId('rollover-announce-body'), 'טקסט')
    await userEvent.click(screen.getByTestId('rollover-announce-publish'))
    await waitFor(() => expect(client.announce).toHaveBeenCalled())
    expect(client.activateYear).not.toHaveBeenCalled()

    await userEvent.click(screen.getByTestId('rollover-activate'))
    await waitFor(() => expect(client.activateYear).toHaveBeenCalledWith('y1'))
    expect(await screen.findByTestId('rollover-activated')).toHaveAttribute('role', 'status')
  })
})

describe('RolloverWizard · no draft year', () => {
  it('shows step 1 as a form and creates the year as a draft', async () => {
    const client = stub()
    client.listTrainingYears = vi.fn(async () => [{ ...YEAR, status: 'active' as const }])
    render(<RolloverWizard locale="he" client={client} />)
    await screen.findByTestId('rollover-no-year')

    await userEvent.type(screen.getByTestId('rollover-year-input-name'), 'תשפ״ח')
    await userEvent.type(screen.getByTestId('rollover-year-input-starts'), '2027-09-01')
    await userEvent.type(screen.getByTestId('rollover-year-input-ends'), '2028-06-30')
    await userEvent.click(screen.getByTestId('rollover-year-create'))

    await waitFor(() => expect(client.createTrainingYear).toHaveBeenCalled())
    expect(client.createTrainingYear).toHaveBeenCalledWith({
      name: 'תשפ״ח',
      starts_on: '2027-09-01',
      ends_on: '2028-06-30',
    })
  })

  it('refuses a year that ends before it starts, before asking the server', async () => {
    const client = stub()
    client.listTrainingYears = vi.fn(async () => [])
    render(<RolloverWizard locale="he" client={client} />)
    await screen.findByTestId('rollover-no-year')

    await userEvent.type(screen.getByTestId('rollover-year-input-name'), 'תשפ״ח')
    await userEvent.type(screen.getByTestId('rollover-year-input-starts'), '2028-06-30')
    await userEvent.type(screen.getByTestId('rollover-year-input-ends'), '2027-09-01')
    await userEvent.click(screen.getByTestId('rollover-year-create'))

    expect(await screen.findByTestId('rollover-year-error')).toHaveTextContent(
      t('he', 'schedule.rollover.year.endBeforeStart'),
    )
    expect(client.createTrainingYear).not.toHaveBeenCalled()
  })
})

describe('RolloverWizard · failure', () => {
  it('says the state could not be read rather than rendering an empty rail', async () => {
    const client = stub()
    client.readState = vi.fn(async () => {
      throw new Error('500')
    })
    render(<RolloverWizard locale="he" client={client} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('he', 'schedule.rollover.loadFailed'),
    )
  })
})

describe('RolloverWizard · direction', () => {
  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <RolloverWizard locale={locale} client={stub({ closures: 'done', groups: 'done' })} />,
    )
    await screen.findByTestId('rollover-wizard')
    await screen.findByTestId('rollover-step-students')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      t(locale, 'schedule.rollover.title'),
    )
    // D10 — a physical property is invisible to an LTR reader and wrong for every Hebrew
    // one, so it is asserted against the rendered style attribute rather than reviewed.
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
