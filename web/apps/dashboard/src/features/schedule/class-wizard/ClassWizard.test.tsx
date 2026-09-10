// §3.21's class wizard — the only way a class is created or edited.
//
// The owner's second correction is the contract these tests hold: *"remove the popup, it's
// irrelevant. If want to edit, then the full wizard, but with the details already in it."*
// So the two things that must never regress are that there is ONE flow, and that its edit
// entrance opens on what the class already has rather than on a blank form that would
// overwrite it.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ClassWizard, STEP_IDS } from './ClassWizard'
import type { ClassWizardClient, WizardClass } from './client'

const JUDO: WizardClass = {
  id: 'c1',
  name: "ג'ודו",
  description: 'לילדים ונוער',
  discipline: 'judo',
  is_active: true,
}

function stub(overrides: Partial<ClassWizardClient> = {}): ClassWizardClient {
  return {
    getClass: vi.fn(async () => JUDO),
    createClass: vi.fn(async (body: { name: string }) => ({ ...JUDO, id: 'c-new', ...body })),
    updateClass: vi.fn(async (_id: string, body: object) => ({ ...JUDO, ...body })),
    listGroups: vi.fn(async () => []),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    getSchedule: vi.fn(async () => []),
    putSchedule: vi.fn(async () => ({ students_left_unscheduled: 0 })),
    listPlans: vi.fn(async () => []),
    createPlan: vi.fn(),
    listRanks: vi.fn(async () => []),
    listPresets: vi.fn(async () => []),
    seedRanks: vi.fn(),
    listProducts: vi.fn(async () => []),
    createProduct: vi.fn(),
    listStaff: vi.fn(async () => []),
    listGroupStaff: vi.fn(async () => []),
    assignStaff: vi.fn(),
    getLink: vi.fn(async () => ({ active: false, registered_count: 0, url: null })),
    createLink: vi.fn(),
    ...overrides,
  } as unknown as ClassWizardClient
}

function renderWizard(classId: string | null, client = stub(), onExit = vi.fn()) {
  render(<ClassWizard classId={classId} client={client} locale="he" onExit={onExit} />)
  return { client, onExit }
}

describe('the shape of the flow', () => {
  it('is seven steps', () => {
    expect(STEP_IDS).toHaveLength(7)
  })

  it('opens on step 1 and says which step it is on', async () => {
    renderWizard(null)
    expect(await screen.findByTestId('class-wizard-step-details')).toBeInTheDocument()
    expect(screen.getByTestId('class-wizard-position')).toHaveTextContent('1')
    expect(screen.getByTestId('class-wizard-position')).toHaveTextContent('7')
  })

  it('draws the shared stepper with a node per step', async () => {
    renderWizard(null)
    await screen.findByTestId('stepper')
    for (const id of STEP_IDS) expect(screen.getByTestId(`stepper-${id}`)).toBeInTheDocument()
  })

  it('names the current step in the accessibility tree, not by colour alone', async () => {
    renderWizard(null)
    await screen.findByTestId('stepper')
    expect(screen.getByTestId('stepper-details')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('stepper-groups')).not.toHaveAttribute('aria-current')
    // And the state as a word, for a reader that cannot see the tint.
    expect(screen.getByTestId('stepper-details')).toHaveTextContent(
      t('he', 'common.stepper.state.current'),
    )
  })

  it('draws a completion bar with the percentage on it, not just a rail of nodes', async () => {
    // The rail says WHICH steps are done. Across seven of them a manager also wants how
    // much of the whole is, which is a different question and was not on the screen.
    renderWizard(null)
    await screen.findByTestId('stepper')
    expect(screen.getByTestId('stepper-track')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByTestId('stepper-percent')).toHaveTextContent('0')
  })

  it('counts the percentage by steps ANSWERED, not by where the manager is standing', async () => {
    // Saving step 1 moves to step 2 — one of seven answered, 14%. Walking BACK to step 1
    // must not undo that: `state` reads `current` for whatever step is open, which is
    // exactly why the count is taken from `settled` instead.
    const { client } = renderWizard(null)
    await screen.findByTestId('wizard-class-name')
    await userEvent.type(screen.getByTestId('wizard-class-name'), 'קרב מגע')
    await userEvent.click(screen.getByTestId('wizard-details-save'))
    await waitFor(() => expect(client.createClass).toHaveBeenCalled())

    await waitFor(() => expect(screen.getByTestId('stepper-track')).toHaveAttribute('aria-valuenow', '14'))
    await userEvent.click(screen.getByTestId('class-wizard-back'))
    expect(await screen.findByTestId('class-wizard-step-details')).toBeInTheDocument()
    expect(screen.getByTestId('stepper-track')).toHaveAttribute('aria-valuenow', '14')
  })

  it('has no Back on the first step', async () => {
    renderWizard(null)
    await screen.findByTestId('class-wizard-step-details')
    expect(screen.queryByTestId('class-wizard-back')).not.toBeInTheDocument()
  })
})

describe('creating', () => {
  it('opens on an EMPTY form — nothing of anybody else’s class in it', async () => {
    renderWizard(null)
    expect(await screen.findByTestId('wizard-class-name')).toHaveValue('')
    expect(screen.getByTestId('wizard-class-description')).toHaveValue('')
  })

  it('refuses to create a class with no name', async () => {
    renderWizard(null)
    await screen.findByTestId('wizard-class-name')
    expect(screen.getByTestId('wizard-details-save')).toBeDisabled()
  })

  it('creates the class on step 1 and moves on, rather than batching seven steps', async () => {
    // The whole reason "create" and "edit" are one flow: after step 1 there is always a
    // class id. A wizard that published at the end would leave a failure on call five with
    // a class, groups and plans behind and nothing to return to.
    const { client } = renderWizard(null)
    await screen.findByTestId('wizard-class-name')
    await userEvent.type(screen.getByTestId('wizard-class-name'), 'קרב מגע')
    await userEvent.click(screen.getByTestId('wizard-details-save'))

    await waitFor(() => expect(client.createClass).toHaveBeenCalled())
    expect(vi.mocked(client.createClass).mock.calls[0]?.[0]?.name).toBe('קרב מגע')
    expect(await screen.findByTestId('class-wizard-step-groups')).toBeInTheDocument()
  })

  it('keeps steps 2-7 out of reach until the class exists', async () => {
    // They are not DISABLED — `SetupWizard`'s rail already learned that a dead button reads
    // as "this step doesn't work". They simply do not move, and say why.
    renderWizard(null)
    await screen.findByTestId('stepper')
    await userEvent.click(screen.getByTestId('stepper-prices'))
    expect(screen.getByTestId('class-wizard-step-details')).toBeInTheDocument()
    expect(screen.getByTestId('stepper-prices')).toHaveAttribute(
      'title',
      t('he', 'common.stepper.locked'),
    )
  })

  it('says so when the class cannot be created, and stays on the step', async () => {
    renderWizard(
      null,
      stub({
        createClass: vi.fn(async () => {
          throw new Error('500')
        }),
      }),
    )
    await screen.findByTestId('wizard-class-name')
    await userEvent.type(screen.getByTestId('wizard-class-name'), 'קרב מגע')
    await userEvent.click(screen.getByTestId('wizard-details-save'))
    expect(await screen.findByRole('alert')).toHaveTextContent(t('he', 'schedule.classes.saveFailed'))
    expect(screen.getByTestId('class-wizard-step-details')).toBeInTheDocument()
    // And what was typed is still there.
    expect(screen.getByTestId('wizard-class-name')).toHaveValue('קרב מגע')
  })
})

describe('editing — "with the details already in it"', () => {
  it('opens step 1 on what the class already has', async () => {
    renderWizard('c1')
    expect(await screen.findByTestId('wizard-class-name')).toHaveValue("ג'ודו")
    expect(screen.getByTestId('wizard-class-description')).toHaveValue('לילדים ונוער')
    expect(screen.getByTestId('wizard-class-discipline')).toHaveValue('judo')
  })

  it('titles itself by the class, so three steps in you still know which one', async () => {
    renderWizard('c1')
    expect(
      await screen.findByRole('heading', { level: 1, name: "ג'ודו" }),
    ).toBeInTheDocument()
  })

  it('every step is reachable straight away — the class exists', async () => {
    renderWizard('c1')
    await screen.findByTestId('stepper')
    await userEvent.click(screen.getByTestId('stepper-launch'))
    expect(await screen.findByTestId('class-wizard-step-launch')).toBeInTheDocument()
  })

  it('PATCHES rather than creating a second class', async () => {
    const { client } = renderWizard('c1')
    await screen.findByTestId('wizard-class-name')
    await userEvent.clear(screen.getByTestId('wizard-class-name'))
    await userEvent.type(screen.getByTestId('wizard-class-name'), 'ג׳ודו אולימפי')
    await userEvent.click(screen.getByTestId('wizard-details-save'))

    await waitFor(() => expect(client.updateClass).toHaveBeenCalled())
    expect(client.createClass).not.toHaveBeenCalled()
    expect(vi.mocked(client.updateClass).mock.calls[0]?.[0]).toBe('c1')
  })

  it('sends null for a cleared description, so a deletion is not silently undone', async () => {
    const { client } = renderWizard('c1')
    await screen.findByTestId('wizard-class-description')
    await userEvent.clear(screen.getByTestId('wizard-class-description'))
    await userEvent.click(screen.getByTestId('wizard-details-save'))
    await waitFor(() => expect(client.updateClass).toHaveBeenCalled())
    expect(vi.mocked(client.updateClass).mock.calls[0]?.[1]?.description).toBeNull()
  })

  it('refuses to open a blank wizard over a class it could not read', async () => {
    // The dangerous case: a wizard that opened empty on a load failure would overwrite the
    // class with whatever the manager typed.
    renderWizard(
      'c1',
      stub({
        getClass: vi.fn(async () => {
          throw new Error('500')
        }),
      }),
    )
    expect(await screen.findByText(t('he', 'common.loadFailed.body'))).toBeInTheDocument()
    expect(screen.queryByTestId('wizard-class-name')).not.toBeInTheDocument()
  })
})

describe('no colour anywhere — the owner cut it', () => {
  it('offers no swatches and sends no colour', async () => {
    const { client } = renderWizard('c1')
    await screen.findByTestId('wizard-class-name')
    expect(screen.queryByTestId('class-colour-none')).not.toBeInTheDocument()
    expect(screen.queryByText(t('he', 'schedule.classes.name'))).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('wizard-details-save'))
    await waitFor(() => expect(client.updateClass).toHaveBeenCalled())
    expect(vi.mocked(client.updateClass).mock.calls[0]?.[1]).not.toHaveProperty('color')
  })
})

describe('leaving', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exits to the class it was editing', async () => {
    const onExit = vi.fn()
    renderWizard('c1', stub(), onExit)
    await screen.findByTestId('class-wizard-exit')
    await userEvent.click(screen.getByTestId('class-wizard-exit'))
    expect(onExit).toHaveBeenCalledWith('c1')
  })

  it('exits to the index when nothing was created', async () => {
    const onExit = vi.fn()
    renderWizard(null, stub(), onExit)
    await screen.findByTestId('class-wizard-exit')
    await userEvent.click(screen.getByTestId('class-wizard-exit'))
    expect(onExit).toHaveBeenCalledWith(null)
  })

  it('exits to the class it just created, not to the index', async () => {
    const onExit = vi.fn()
    const { client } = renderWizard(null, stub(), onExit)
    await screen.findByTestId('wizard-class-name')
    await userEvent.type(screen.getByTestId('wizard-class-name'), 'קרב מגע')
    await userEvent.click(screen.getByTestId('wizard-details-save'))
    await waitFor(() => expect(client.createClass).toHaveBeenCalled())
    await userEvent.click(screen.getByTestId('class-wizard-exit'))
    expect(onExit).toHaveBeenCalledWith('c-new')
  })
})

describe('what the prototype asks for and this does not build', () => {
  it('draws no health-declaration toggle — §5.5 makes it a gate, not a setting', async () => {
    renderWizard('c1')
    await screen.findByTestId('stepper')
    await userEvent.click(screen.getByTestId('stepper-launch'))
    const note = await screen.findByTestId('wizard-health-gate')
    // Stated as a fact...
    expect(note).toHaveTextContent(t('he', 'schedule.wizard.launch.healthGate'))
    // ...and not as a control anybody could turn off.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('says a standing order is not created here, rather than drawing a switch', async () => {
    renderWizard('c1')
    await screen.findByTestId('stepper')
    await userEvent.click(screen.getByTestId('stepper-prices'))
    expect(await screen.findByTestId('wizard-prices-standing-order')).toHaveTextContent(
      t('he', 'schedule.wizard.prices.standingOrderNote'),
    )
  })

  it('offers no wage field and no per-capability switches on the coaches step', async () => {
    renderWizard('c1')
    await screen.findByTestId('stepper')
    await userEvent.click(screen.getByTestId('stepper-coaches'))
    await screen.findByTestId('wizard-coach-permissions')
    // §4 rule 3 — there is no payroll model, so there is no box to type a wage into.
    expect(document.body.textContent ?? '').not.toMatch(/שכר לשעה|₪\/שעה/)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('draws no capacity on the groups step — D2 cut it from the product', async () => {
    renderWizard('c1')
    await screen.findByTestId('stepper')
    await userEvent.click(screen.getByTestId('stepper-groups'))
    await screen.findByTestId('wizard-groups')
    expect(document.body.textContent ?? '').not.toMatch(/תפוסה|קיבולת/)
  })
})

describe('renders with no physical CSS', () => {
  it.each(['he', 'en'] as const)('in %s', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <ClassWizard classId="c1" client={stub()} locale={locale} onExit={vi.fn()} />,
    )
    await screen.findByTestId('stepper')
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
