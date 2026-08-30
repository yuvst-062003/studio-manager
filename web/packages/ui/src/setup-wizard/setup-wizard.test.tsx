// SPEC §5.1's setup wizard.
//
// The test that matters most here is the LAST one: a fake step registers into
// 'setup-wizard' and lands in the right position without SetupWizard.tsx being touched.
// Without it, "M6 and M7 add a step without reopening the container" is a claim rather
// than a guarantee — and both of those milestones are waves away from finding out.
import { render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { clearSlot, registerSlot, useSlot } from '../slots'
import { renderIn, DIRECTIONS } from '../testing'
import { SetupWizard } from './SetupWizard'
import type { SetupClient } from './SetupWizard'
import { LOGO_EDGE, makeStudioStep, resizeToSquarePng } from './StudioStep'
import { defaultSeason, makeGroupsStep } from './GroupsStep'
import type { GroupRow, Slot } from './GroupsStep'
import { makeStaffStep } from './StaffStep'
import type { StaffInvite } from './StaffStep'
import { makeStudentsStep } from './StudentsStep'
import { WIZARD_STEP_ORDER } from './types'
import type { SetupProgress, WizardStepId, WizardStepProps } from './types'

const ALL_IDS = [...WIZARD_STEP_ORDER]

function progress(overrides: Partial<Record<WizardStepId, 'done' | 'skipped'>> = {}): SetupProgress {
  const steps = ALL_IDS.map((id, index) => ({
    id,
    order: index + 1,
    status: overrides[id] ?? ('pending' as const),
    at: overrides[id] ? '2026-08-25T10:00:00+00:00' : null,
  }))
  return {
    steps,
    complete: steps.every((step) => step.status === 'done'),
    dismissed_at: null,
  }
}

function fakeClient(initial = progress()): SetupClient & { calls: string[] } {
  let state = initial
  const calls: string[] = []
  return {
    calls,
    read: async () => state,
    setStep: async (stepId, status) => {
      calls.push(`${stepId}:${status}`)
      state = {
        ...state,
        steps: state.steps.map((step) =>
          step.id === stepId ? { ...step, status, at: '2026-08-25T10:00:00+00:00' } : step,
        ),
      }
      state = { ...state, complete: state.steps.every((step) => step.status === 'done') }
      return state
    },
    dismiss: async () => {
      calls.push('dismiss')
      state = { ...state, dismissed_at: '2026-08-25T10:05:00+00:00' }
      return state
    },
  }
}

/** A step reduced to what the container actually contracts for. */
function stubStep(label: string) {
  return function Stub({ status, onDone, onSkip }: WizardStepProps) {
    return (
      <div data-testid={`stub-${label}`}>
        <span>{status}</span>
        <button type="button" onClick={onDone}>{`done-${label}`}</button>
        <button type="button" onClick={onSkip}>{`skip-${label}`}</button>
      </div>
    )
  }
}

function registerM1Stubs() {
  registerSlot<WizardStepProps>('setup-wizard', { key: 'studio', order: 1, render: stubStep('studio') })
  registerSlot<WizardStepProps>('setup-wizard', { key: 'groups', order: 2, render: stubStep('groups') })
  registerSlot<WizardStepProps>('setup-wizard', { key: 'staff', order: 5, render: stubStep('staff') })
  registerSlot<WizardStepProps>('setup-wizard', {
    key: 'students',
    order: 6,
    render: stubStep('students'),
  })
}

beforeEach(() => {
  clearSlot('setup-wizard')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * jsdom ships no canvas and no createImageBitmap, so the resize path is unreachable
 * without these. They are the browser APIs the step uses and nothing more — stubbing them
 * is what lets the letterbox rule be asserted rather than assumed.
 */
function stubCanvas(source = { width: 200, height: 100 }) {
  const drawImage = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ ...source, close: vi.fn() })),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['png'], { type: 'image/png' }))
  })
  return { drawImage }
}

const pngFile = () => new File(['\x89PNG'], 'logo.png', { type: 'image/png' })

describe('SetupWizard container', () => {
  it('renders all six steps in the canvas order, M6 and M7 included', async () => {
    registerM1Stubs()
    render(<SetupWizard client={fakeClient()} locale="he" />)

    await screen.findByTestId('setup-rail-studio')
    const rail = screen.getByRole('list', { name: t('he', 'common.setup.progressLabel') })
    const labels = within(rail)
      .getAllByRole('button')
      .map((button) => button.getAttribute('data-testid'))
    expect(labels).toEqual(ALL_IDS.map((id) => `setup-rail-${id}`))
  })

  it('keeps an unregistered rail entry CLICKABLE, marked as elsewhere (2026-08-30)', async () => {
    // The reversal of the disable decision: a dead button under "belts" read as "belts
    // doesn't work" on the surface that had not registered it. The node opens a body
    // that says where the step is edited and still offers skip.
    registerM1Stubs()
    render(<SetupWizard client={fakeClient()} locale="he" />)
    const belts = await screen.findByTestId('setup-rail-belts')
    expect(belts).toBeEnabled()
    expect(belts).toHaveAttribute('data-registered', 'false')
    expect(screen.getByTestId('setup-rail-studio')).not.toHaveAttribute('data-registered')
  })

  it('states every step status in words, never by colour alone', async () => {
    registerM1Stubs()
    render(<SetupWizard client={fakeClient(progress({ studio: 'done', groups: 'skipped' }))} locale="he" />)
    expect(await screen.findByTestId('setup-rail-studio-status')).toHaveTextContent(
      t('he', 'common.setup.status.done'),
    )
    expect(screen.getByTestId('setup-rail-groups-status')).toHaveTextContent(
      t('he', 'common.setup.status.skipped'),
    )
  })

  it('resumes on the first unanswered step rather than on step 1', async () => {
    // §5.1 — 'progress is persisted so the wizard survives a closed app'. An owner sent
    // back to step 1 after finishing it concludes nothing was saved.
    registerM1Stubs()
    render(<SetupWizard client={fakeClient(progress({ studio: 'done' }))} locale="he" />)
    expect(await screen.findByTestId('stub-groups')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-studio')).not.toBeInTheDocument()
  })

  it('skips a step and advances to the next registered one', async () => {
    registerM1Stubs()
    const client = fakeClient()
    render(<SetupWizard client={client} locale="he" />)

    await userEvent.click(await screen.findByText('skip-studio'))
    expect(client.calls).toContain('studio:skipped')
    // NOT `belts` — M7 has not built it, and landing on an empty panel reads as a bug.
    expect(await screen.findByTestId('stub-groups')).toBeInTheDocument()
  })

  it('lets a skipped step be returned to', async () => {
    registerM1Stubs()
    render(<SetupWizard client={fakeClient(progress({ studio: 'skipped' }))} locale="he" />)
    await userEvent.click(await screen.findByTestId('setup-rail-studio'))
    expect(await screen.findByTestId('stub-studio')).toBeInTheDocument()
  })

  it('reports incomplete until every one of the six is done', async () => {
    registerM1Stubs()
    const four = progress({ studio: 'done', groups: 'done', staff: 'done', students: 'done' })
    render(<SetupWizard client={fakeClient(four)} locale="he" />)
    expect(await screen.findByTestId('setup-complete')).toHaveTextContent(
      t('he', 'common.setup.incomplete'),
    )
  })

  it('reports complete only when all six are done', async () => {
    registerM1Stubs()
    const all = progress(Object.fromEntries(ALL_IDS.map((id) => [id, 'done'])))
    render(<SetupWizard client={fakeClient(all)} locale="he" />)
    expect(await screen.findByTestId('setup-complete')).toHaveTextContent(
      t('he', 'common.setup.complete'),
    )
  })

  it('dismisses on both of §5.1 exits and reports which one was taken', async () => {
    registerM1Stubs()
    const client = fakeClient()
    const onExit = vi.fn()
    render(<SetupWizard client={client} locale="he" onExit={onExit} />)

    await userEvent.click(await screen.findByText(t('he', 'common.setup.openDashboard')))
    await waitFor(() => expect(onExit).toHaveBeenCalledWith('dashboard'))

    await userEvent.click(screen.getByText(t('he', 'common.setup.continueLater')))
    await waitFor(() => expect(onExit).toHaveBeenCalledWith('later'))
    expect(client.calls.filter((call) => call === 'dismiss')).toHaveLength(2)
  })

  it('dismissing does not claim the steps are done', async () => {
    registerM1Stubs()
    const client = fakeClient()
    render(<SetupWizard client={client} locale="he" />)
    await userEvent.click(await screen.findByText(t('he', 'common.setup.openDashboard')))
    await waitFor(() =>
      expect(screen.getByTestId('setup-complete')).toHaveTextContent(
        t('he', 'common.setup.incomplete'),
      ),
    )
  })

  it('says so rather than rendering an empty frame when progress cannot be loaded', async () => {
    registerM1Stubs()
    const broken = { ...fakeClient(), read: () => Promise.reject(new Error('offline')) }
    render(<SetupWizard client={broken} locale="he" />)
    // F1a — the failure now arrives through LoadFailed, whose retry is the point: a
    // refresh may serve the same failure from the service worker's cache.
    expect(await screen.findByTestId('load-failed')).toHaveTextContent(
      t('he', 'common.setup.loadFailed'),
    )
    expect(screen.getByTestId('load-failed-retry')).toBeInTheDocument()
  })

  it('carries the reassurance line from artboard 5c on every step', async () => {
    registerM1Stubs()
    render(<SetupWizard client={fakeClient()} locale="he" />)
    expect(await screen.findByText(t('he', 'common.setup.nothingSentYet'))).toBeInTheDocument()
  })

  it.each(DIRECTIONS)('renders in $locale ($dir) with no physical CSS', async ({ locale }) => {
    registerM1Stubs()
    const { container } = renderIn(<SetupWizard client={fakeClient()} locale={locale} />, { locale })
    await screen.findByTestId('setup-rail-studio')
    const styles = [...container.querySelectorAll<HTMLElement>('[style]')].map(
      (node) => node.getAttribute('style') ?? '',
    )
    for (const style of styles) {
      expect(style).not.toMatch(/margin-(left|right)|padding-(left|right)/)
    }
  })
})

// ── the seam ────────────────────────────────────────────────────────────────
describe('the setup-wizard slot is what M6 and M7 register through', () => {
  it('places a step registered at order 3 between groups and prices, container untouched', async () => {
    registerM1Stubs()
    // Exactly what M7 does: one registerSlot call, one file. Nothing in SetupWizard.tsx
    // knows this key exists.
    //
    // Belts sits at 3 rather than at the canvas's 2 because a ladder hangs off a class
    // and classes are created in `groups` — see WIZARD_STEP_ORDER. The seam is what this
    // test is about, and the seam does not care which number it is handed.
    registerSlot<WizardStepProps>('setup-wizard', {
      key: 'belts',
      order: 3,
      render: stubStep('belts'),
    })

    render(
      <SetupWizard
        client={fakeClient(progress({ studio: 'done', groups: 'done' }))}
        locale="he"
      />,
    )

    // It is reachable...
    expect(await screen.findByTestId('setup-rail-belts')).toBeEnabled()
    // ...and it is where the order puts it: resume lands on belts, not on prices.
    expect(await screen.findByTestId('stub-belts')).toBeInTheDocument()
  })

  it('advances into a later-lane step when one is registered', async () => {
    registerM1Stubs()
    registerSlot<WizardStepProps>('setup-wizard', {
      key: 'prices',
      order: 4,
      render: stubStep('prices'),
    })
    render(<SetupWizard client={fakeClient(progress({ studio: 'done', belts: 'done' }))} locale="he" />)

    await userEvent.click(await screen.findByText('skip-groups'))
    expect(await screen.findByTestId('stub-prices')).toBeInTheDocument()
  })
})

// ── the four M1 steps ───────────────────────────────────────────────────────
describe('step 1 · פרטי מועדון', () => {
  const details = {
    name: 'מכבי ג׳ודו רעננה',
    sport: 'judo',
    address: 'אחוזה 120',
    phone: '09-771-2233',
    parent_locales: ['he'],
    logo_url: null,
  }

  function studioClient(overrides = {}) {
    return {
      read: async () => details,
      update: vi.fn(async (fields) => ({ ...details, ...fields })),
      uploadLogo: vi.fn(async () => ({ logo_url: '/api/v1/studio/logo?v=1' })),
      ...overrides,
    }
  }

  it('renders every field artboard 5c draws, each with a label', async () => {
    const Step = makeStudioStep(studioClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    for (const key of ['name', 'sport', 'address', 'phone'] as const) {
      expect(
        await screen.findByLabelText(t('he', `common.setup.studio.${key}`)),
      ).toBeInTheDocument()
    }
  })

  it('does not ask which languages parents see — a club offers all three', async () => {
    // Owner request, 2026-08-29: "this should not be a choice but a default." Asking a
    // first-run owner to pick was asking them to guess which languages their future
    // parents read, and the server's default is now all three rather than one.
    const Step = makeStudioStep(studioClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByLabelText(t('he', 'common.setup.studio.name'))
    expect(
      screen.queryByRole('group', { name: t('he', 'common.setup.studio.parentLocales') }),
    ).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('does not write parent_locales, so a club that narrowed it keeps its choice', async () => {
    // The step used to send the checkbox column on every save. Now that it has no opinion,
    // sending the field at all would blank a deliberate narrowing made in the settings
    // panel — `exclude_unset` on the server only helps if the client omits it.
    const client = studioClient()
    const Step = makeStudioStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await userEvent.click(await screen.findByText(t('he', 'common.setup.continue')))
    await waitFor(() => expect(client.update).toHaveBeenCalled())
    expect(client.update.mock.calls[0]?.[0]).not.toHaveProperty('parent_locales')
  })

  it('saves and reports itself done — the container never infers it', async () => {
    const client = studioClient()
    const onDone = vi.fn()
    const Step = makeStudioStep(client)
    render(<Step locale="he" status="pending" onDone={onDone} onSkip={vi.fn()} />)

    await userEvent.click(await screen.findByText(t('he', 'common.setup.continue')))
    await waitFor(() => expect(client.update).toHaveBeenCalled())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('resizes to 512 and uploads, showing the result', async () => {
    stubCanvas()
    const client = studioClient()
    const Step = makeStudioStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)

    const input = await screen.findByLabelText(t('he', 'common.setup.studio.logoDrop'))
    await userEvent.upload(input, pngFile())
    await waitFor(() => expect(client.uploadLogo).toHaveBeenCalled())
    expect(await screen.findByAltText(t('he', 'common.setup.studio.logoAlt'))).toBeInTheDocument()
  })

  it('names the rule when the server refuses a logo', async () => {
    stubCanvas()
    // The browser file picker filters on `accept`, so a file declared image/svg+xml never
    // reaches onChange at all. The case that matters is the one that gets past it: bytes
    // the SERVER refuses after sniffing them.
    const client = studioClient({ uploadLogo: vi.fn(() => Promise.reject(new Error('415'))) })
    const Step = makeStudioStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)

    const input = await screen.findByLabelText(t('he', 'common.setup.studio.logoDrop'))
    await userEvent.upload(input, pngFile())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('he', 'common.setup.studio.logoRejected'),
    )
  })

  it('refuses SVG at the picker, before a byte is uploaded', async () => {
    stubCanvas()
    const client = studioClient()
    const Step = makeStudioStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)

    const input = await screen.findByLabelText(t('he', 'common.setup.studio.logoDrop'))
    await userEvent.upload(input, new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))
    expect(client.uploadLogo).not.toHaveBeenCalled()
  })

  it('letterboxes rather than crops — a wordmark must not lose an edge', async () => {
    const { drawImage } = stubCanvas({ width: 200, height: 100 })
    await resizeToSquarePng(pngFile())
    // scale = min(512/200, 512/100) = 2.56 → 512×256, centred vertically at y = 128.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 128, LOGO_EDGE, 256)
  })
})

describe('step 2 · קבוצות ולו״ז', () => {
  const structureClient = () => ({
    listClasses: async () => [{ id: 'c1', name: "ג'ודו" }],
    listGroups: async (): Promise<GroupRow[]> => [],
    listLocations: async () => [],
    createClass: vi.fn(async (name: string) => ({ id: 'c2', name })),
    createGroup: vi.fn(async (classId: string, name: string) => ({
      id: 'g1',
      name,
      class_id: classId,
    })),
    createLocation: vi.fn(async (name: string) => ({ id: 'l1', name })),
    ensureTrainingYear: vi.fn<() => Promise<void>>(async () => undefined),
    readSchedule: vi.fn<(groupId: string) => Promise<Slot[]>>(async () => []),
    // Typed through the generic rather than by naming parameters the body never reads:
    // `mock.calls` needs the tuple, and unused names are what the lint rule is for.
    putSchedule: vi.fn<(groupId: string, slots: Slot[], effectiveFrom: string) => Promise<void>>(
      async () => undefined,
    ),
  })

  /**
   * Add one group the way a manager does: press `+`, fill the dialog, save.
   *
   * The step used to be a name box and an add button on the page itself, with the hours
   * expanded inline underneath every group in the club. `extraSlots` presses "add a time"
   * inside the dialog, which is the only place slots are edited now.
   */
  async function addGroup(name: string, extraSlots = 0) {
    await userEvent.click(await screen.findByTestId('setup-add-group'))
    await userEvent.type(
      within(screen.getByTestId('group-dialog')).getByLabelText(
        t('he', 'common.setup.groups.groupName'),
      ),
      name,
    )
    for (let i = 0; i < extraSlots; i += 1) {
      await userEvent.click(screen.getByTestId('dialog-add-time'))
    }
    await userEvent.click(screen.getByTestId('group-dialog-save'))
  }

  it('creates a group through the class that already exists', async () => {
    const client = structureClient()
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByTestId('setup-add-group')
    await addGroup('מתחילים')
    await waitFor(() => expect(client.createGroup).toHaveBeenCalledWith('c1', 'מתחילים'))
  })

  it('puts the group in the class the manager SELECTED, not the first one ever made', async () => {
    // The bug this step was rebuilt around: `createGroup` was called with `classes[0]`
    // and there was no class picker anywhere on screen, so a club with ג'ודו and קרוספיט
    // could not put a single group under קרוספיט (reported 2026-08-29).
    const client = {
      ...structureClient(),
      listClasses: async () => [
        { id: 'c1', name: "ג'ודו" },
        { id: 'c2', name: 'קרוספיט' },
      ],
    }
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)

    await userEvent.click(await screen.findByTestId('setup-class-c2'))
    await addGroup('נבחרת')
    await waitFor(() => expect(client.createGroup).toHaveBeenCalledWith('c2', 'נבחרת'))
  })

  it('shows only the groups of the selected class', async () => {
    const client = {
      ...structureClient(),
      listClasses: async () => [
        { id: 'c1', name: "ג'ודו" },
        { id: 'c2', name: 'קרוספיט' },
      ],
      listGroups: async (): Promise<GroupRow[]> => [
        { id: 'g1', name: 'מתחילים', class_id: 'c1' },
        { id: 'g2', name: 'בוקר', class_id: 'c2' },
      ],
    }
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)

    expect(await screen.findByTestId('setup-group-g1')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-group-g2')).toBeNull()
    await userEvent.click(screen.getByTestId('setup-class-c2'))
    expect(await screen.findByTestId('setup-group-g2')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-group-g1')).toBeNull()
  })

  it('explains rather than 422s when there is no class to hang a group on', async () => {
    const client = { ...structureClient(), listClasses: async () => [] }
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByText(t('he', 'common.setup.groups.needClass'))).toBeInTheDocument()
  })

  it('writes nothing when the dialog is cancelled', async () => {
    // The slots live in the dialog, so an abandoned one must leave no group and no rules.
    const client = structureClient()
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await userEvent.click(await screen.findByTestId('setup-add-group'))
    await userEvent.type(
      within(screen.getByTestId('group-dialog')).getByLabelText(
        t('he', 'common.setup.groups.groupName'),
      ),
      'מתחילים',
    )
    await userEvent.click(screen.getByTestId('group-dialog-cancel'))
    expect(screen.queryByTestId('group-dialog')).toBeNull()
    expect(client.createGroup).not.toHaveBeenCalled()
    expect(client.putSchedule).not.toHaveBeenCalled()
  })

  it("sets each group's weekly times here, and writes them straight away", async () => {
    // This test asserted the OPPOSITE until 2026-08-29: that the step promised no
    // schedule, because the times lived only on the weekly board. The owner's decision is
    // that a club is not set up until its groups have hours, so the promise is kept rather
    // than withdrawn. A slot is a weekday and an hour range — it repeats every week and
    // carries no date.
    const client = structureClient()
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByTestId('setup-add-group')
    await addGroup('מתחילים')

    await waitFor(() => expect(client.putSchedule).toHaveBeenCalled())
    const [groupId, sent] = client.putSchedule.mock.calls.at(-1) ?? []
    expect(groupId).toBe('g1')
    // Sunday 17:00–18:00 by default: the commonest shape, so a manager edits rather than
    // fills in four blanks.
    expect(sent).toEqual([
      { weekday: 0, start_time: '17:00', end_time: '18:00', location_id: null },
    ])
  })

  it('sends the WHOLE set on every change, because PUT replaces rather than appends', async () => {
    // A partial send would delete the rows it omitted.
    const client = structureClient()
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByTestId('setup-add-group')
    await addGroup('מתחילים', 1)
    await waitFor(() => expect(client.putSchedule.mock.calls.at(-1)?.[1]).toHaveLength(2))
  })

  it('names the training year when that is why the save failed, and keeps the group', async () => {
    // `apply_schedule_change` reads the active training year BEFORE it writes anything, and
    // no setup step opens one — so during first-run setup this 404 is the normal case, not
    // a fault the manager can act on. Reported as pending rather than as a fault.
    const client = {
      ...structureClient(),
      putSchedule: vi.fn<(g: string, s: Slot[], e: string) => Promise<void>>(async () => {
        throw new Error('404')
      }),
    }
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByTestId('setup-add-group')
    await addGroup('מתחילים')

    const note = await screen.findByTestId('slot-failed-g1')
    expect(note).toHaveTextContent(t('he', 'common.setup.groups.needYear'))
    expect(note).toHaveAttribute('data-status', 'pending')
    // The group is still on screen to be edited.
    expect(screen.getByTestId('setup-group-g1')).toBeInTheDocument()
  })

  it('still reports a real failure as a failure', async () => {
    const client = {
      ...structureClient(),
      putSchedule: vi.fn<(g: string, s: Slot[], e: string) => Promise<void>>(async () => {
        throw new Error('500')
      }),
    }
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByTestId('setup-add-group')
    await addGroup('מתחילים')
    expect(await screen.findByTestId('slot-failed-g1')).toHaveAttribute('data-status', 'danger')
  })

  it('opens the season before the first write, and only then', async () => {
    // A weekly rule is not a lesson: it becomes lessons only when generated between two
    // dates, and those dates are the training year's. Nothing in the six steps opened one,
    // so a new club finished setup with a timetable that produced nothing. Opened here on
    // the first write — not on mount, which would create a year behind the back of a
    // manager who never touches this.
    const client = structureClient()
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByTestId('setup-add-group')
    expect(client.ensureTrainingYear).not.toHaveBeenCalled()

    await addGroup('מתחילים')
    await waitFor(() => expect(client.ensureTrainingYear).toHaveBeenCalled())
    await waitFor(() => expect(client.putSchedule).toHaveBeenCalled())
  })

  it('proposes September to August, which is the Israeli season', async () => {
    // From August onward the season being set up is the one about to START; before that,
    // the one already running.
    expect(defaultSeason(new Date('2026-09-15T12:00:00Z'))).toEqual({
      name: '2026–2027',
      starts_on: '2026-09-01',
      ends_on: '2027-08-31',
    })
    expect(defaultSeason(new Date('2026-03-15T12:00:00Z')).name).toBe('2025–2026')
  })

  it('shows the week the times would create, so an empty Wednesday is visible', async () => {
    const client = structureClient()
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByTestId('setup-week')).toHaveTextContent(
      t('he', 'common.setup.groups.weekEmpty'),
    )
    await addGroup('מתחילים')
    await waitFor(() => expect(screen.getByTestId('setup-week')).toHaveTextContent('מתחילים'))
  })
})


describe('step 5 · צוות', () => {
  const staffClient = () => ({
    listGroups: async () => [{ id: 'g1', name: 'מתחילים' }],
    listInvitations: async (): Promise<StaffInvite[]> => [],
    invite: vi.fn(async () => undefined),
  })

  it('invites a coach by email into the groups that were ticked', async () => {
    const client = staffClient()
    const Step = makeStaffStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)

    await userEvent.type(
      await screen.findByLabelText(t('he', 'common.setup.staff.email')),
      'coach@example.com',
    )
    await userEvent.click(screen.getByLabelText('מתחילים'))
    await userEvent.click(screen.getByText(t('he', 'common.setup.staff.invite')))
    await waitFor(() =>
      expect(client.invite).toHaveBeenCalledWith('coach@example.com', 'lead_coach', ['g1']),
    )
  })

  it('takes every group at once, because that is the commonest answer', async () => {
    // The group picker was a single `<select>`: a coach who takes all five groups could
    // be given one of them (reported 2026-08-29).
    const client = {
      ...staffClient(),
      listGroups: async () => [
        { id: 'g1', name: 'מתחילים' },
        { id: 'g2', name: 'נבחרת' },
      ],
    }
    const Step = makeStaffStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)

    await userEvent.type(
      await screen.findByLabelText(t('he', 'common.setup.staff.email')),
      'coach@example.com',
    )
    await userEvent.click(screen.getByTestId('staff-groups-all'))
    expect(screen.getByTestId('staff-groups-count')).toHaveTextContent('2')
    await userEvent.click(screen.getByText(t('he', 'common.setup.staff.invite')))
    await waitFor(() =>
      expect(client.invite).toHaveBeenCalledWith('coach@example.com', 'lead_coach', ['g1', 'g2']),
    )
  })

  it('clears the whole selection with the same control', async () => {
    const client = staffClient()
    const Step = makeStaffStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await userEvent.click(await screen.findByTestId('staff-groups-all'))
    expect(screen.getByTestId('staff-groups-count')).toHaveTextContent('1')
    await userEvent.click(screen.getByTestId('staff-groups-all'))
    expect(screen.getByTestId('staff-groups-count')).toHaveTextContent('0')
  })

  it('offers only the two coach roles — owner and manager come from the console', async () => {
    // The roles were a <select>; they are now two cards. Same rule, asked of the new shape:
    // a club must not be able to mint its own administrators.
    const Step = makeStaffStep(staffClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    const group = await screen.findByRole('radiogroup', {
      name: t('he', 'common.setup.staff.role'),
    })
    expect(within(group).getAllByRole('radio')).toHaveLength(2)
    expect(screen.queryByText(t('he', 'common.setup.staff.role.owner'))).toBeNull()
    expect(screen.queryByText(t('he', 'common.setup.staff.role.manager'))).toBeNull()
  })

  it('states what each role can and cannot do, where the choice is made', async () => {
    // A bare select labelled "role" left an owner inviting their first coach with no way
    // to know which to pick, and the difference is a real permission rather than a title.
    const Step = makeStaffStep(staffClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByTestId('staff-role-lead_coach')).toHaveTextContent(
      t('he', 'common.setup.staff.role.lead_coachWhat'),
    )
    expect(screen.getByTestId('staff-role-assistant_coach')).toHaveTextContent(
      t('he', 'common.setup.staff.role.assistant_coachWhat'),
    )
  })

  it('says an invitation is waiting rather than leaving it looking broken', async () => {
    const client = staffClient()
    const Step = makeStaffStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByText(t('he', 'common.setup.staff.noPending'))).toBeInTheDocument()
    await userEvent.type(
      screen.getByLabelText(t('he', 'common.setup.staff.email')),
      'coach@example.com',
    )
    await userEvent.click(screen.getByText(t('he', 'common.setup.staff.invite')))
    expect(await screen.findByText(t('he', 'common.setup.staff.awaiting'))).toBeInTheDocument()
  })

  it('lets a coach be invited before any group exists', async () => {
    // §3.3 — 'A person does not need a login', and a coach can precede the group.
    const client = { ...staffClient(), listGroups: async () => [] }
    const Step = makeStaffStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await userEvent.type(
      await screen.findByLabelText(t('he', 'common.setup.staff.email')),
      'coach@example.com',
    )
    await userEvent.click(screen.getByText(t('he', 'common.setup.staff.invite')))
    await waitFor(() =>
      expect(client.invite).toHaveBeenCalledWith('coach@example.com', 'lead_coach', []),
    )
  })
})

describe('step 6 · חניכים', () => {
  const studentsClient = () => ({
    summarise: async () => ({
      studioName: 'מכבי ג׳ודו רעננה',
      parentLocales: ['he', 'ru'],
      classCount: 2,
      groupCount: 5,
      locationCount: 1,
      invitedStaffCount: 2,
    }),
  })

  it('renders artboard 5f מה הוגדר עד כה', async () => {
    const Step = makeStudentsStep(studentsClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByTestId('setup-summary-groups')).toHaveTextContent('5')
    expect(screen.getByTestId('setup-summary-staff')).toHaveTextContent('2')
  })

  it('shows 0 students rather than hiding the row M3 will fill', async () => {
    const Step = makeStudentsStep(studentsClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByTestId('setup-summary-students')).toHaveTextContent('0')
  })

  it('carries no stale acquisition promise — M3.4 shipped the three routes (F8)', async () => {
    const Step = makeStudentsStep(studentsClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByTestId('setup-summary-students')
    expect(screen.queryByTestId('setup-students-acquisition-note')).toBeNull()
  })
})

describe('F6 — going back', () => {
  it('reopens an answered step in place, and the rail says pending again', async () => {
    registerM1Stubs()
    const client = fakeClient(progress({ studio: 'done' }))
    render(<SetupWizard client={client} locale="he" />)
    // The wizard resumes on the first pending step; navigate back to the answered one.
    await screen.findByTestId('setup-rail-studio')
    await userEvent.click(screen.getByTestId('setup-rail-studio'))
    await userEvent.click(await screen.findByTestId('setup-reopen'))
    expect(client.calls).toContain('studio:pending')
    expect(screen.getByTestId('setup-rail-studio-status')).toHaveTextContent(
      t('he', 'common.setup.status.pending'),
    )
    // Reopening stays on the step — the point is editing the answer.
    expect(screen.getByTestId('setup-rail-studio')).toHaveAttribute('aria-current', 'step')
  })

  it('offers an explicit Back beside the step body', async () => {
    registerM1Stubs()
    render(<SetupWizard client={fakeClient(progress({ studio: 'done' }))} locale="he" />)
    // Resumed past the first step, so Back exists and returns to it.
    await screen.findByTestId('setup-step-body')
    await userEvent.click(await screen.findByTestId('setup-back'))
    expect(screen.getByTestId('setup-rail-studio')).toHaveAttribute('aria-current', 'step')
  })
})

describe('setup step 1 · what the Stitch pass added (2026-08-29)', () => {
  const details = {
    name: '',
    sport: null,
    address: null,
    phone: null,
    parent_locales: ['he'],
    logo_url: null,
  }
  const studioClient = () => ({
    read: vi.fn(async () => details),
    update: vi.fn(async () => details),
    uploadLogo: vi.fn(),
  })

  it('says which field is required rather than only disabling the button', async () => {
    // The continue button disabling on an empty name told an owner THAT something was
    // wrong and never WHICH field. The hint is wired through aria-describedby, so it is
    // announced with the field rather than read out as "club name star".
    const Step = makeStudioStep(studioClient() as never)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    const name = await screen.findByLabelText(t('he', 'common.setup.studio.name'))
    expect(name).toBeRequired()
    expect(name).toHaveAccessibleDescription(t('he', 'common.setup.studio.requiredHint'))
  })

  it('marks the fields that can be left empty', async () => {
    const Step = makeStudioStep(studioClient() as never)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    const phone = await screen.findByLabelText(t('he', 'common.setup.studio.phone'))
    expect(phone).toHaveAccessibleDescription(t('he', 'common.setup.studio.optionalHint'))
    expect(phone).not.toBeRequired()
  })

  it('shows an example in each field, because a first-run form is one people hesitate over', async () => {
    const Step = makeStudioStep(studioClient() as never)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByPlaceholderText(t('he', 'common.setup.studio.namePlaceholder'))).toBeInTheDocument()
    expect(screen.getByPlaceholderText(t('he', 'common.setup.studio.sportPlaceholder'))).toBeInTheDocument()
  })

  it('keeps the native file input reachable while hiding the UA control', async () => {
    // The browser renders it as an English "Choose File / No file chosen" in the middle of
    // an RTL Hebrew screen. Hidden with clip-path, NOT display:none — the latter would take
    // it out of the accessibility tree along with the layout.
    const Step = makeStudioStep(studioClient() as never)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    const input = await screen.findByLabelText(t('he', 'common.setup.studio.logoDrop'))
    expect(input).toBeInTheDocument()
    expect(input).toHaveClass('studio-visually-hidden')
    expect(screen.getByRole('button', { name: t('he', 'common.setup.studio.logoChoose') })).toBeInTheDocument()
  })

  it('ranks the footer instead of leaving continue, skip and a status line at one rank', async () => {
    const Step = makeStudioStep(studioClient() as never)
    const { container } = render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByTestId('setup-step-studio')
    const bar = container.querySelector('.studio-actionbar')
    expect(bar).toHaveAttribute('data-align', 'between')
    // The status describes the step; it is not something to press.
    expect(bar).not.toContainElement(screen.getByTestId('setup-studio-status'))
  })

})

describe('SetupWizard chrome — artboards 5c–5f (2026-08-29)', () => {
  it('gives every step a node in three states, and never a circle alone', async () => {
    // `5d` draws done / current / upcoming. The circle is not the only carrier: each node
    // also states its status in words, off-screen, because the circle already says it to a
    // sighted reader (SC 1.4.1).
    registerM1Stubs()
    render(<SetupWizard client={fakeClient()} locale="he" />)
    const first = await screen.findByTestId('setup-rail-studio')
    expect(first).toHaveAttribute('data-state', 'current')
    expect(screen.getByTestId('setup-rail-groups')).toHaveAttribute('data-state', 'upcoming')
    expect(screen.getByTestId('setup-rail-studio-status')).toHaveClass('studio-visually-hidden')
  })

  it('keeps the reassurance visible on every step, not only the first', async () => {
    // `5c` shows it once and 5d–5f never show it again — but an owner abandons a wizard on
    // step 3, not step 1, which is exactly when they need to read that nothing is final.
    registerM1Stubs()
    const { container } = render(<SetupWizard client={fakeClient()} locale="he" />)
    await screen.findByTestId('setup-wizard')
    const rail = container.querySelector('.setup-rail')
    expect(rail).toHaveTextContent(t('he', 'common.setup.nothingSentYet'))
  })

  it('puts the step body FIRST in the DOM, whichever side the rail is drawn on', async () => {
    // The rail is placed into the inline-start track by CSS rather than by source order:
    // a keyboard user should reach what they came to fill in before a list of six links.
    registerM1Stubs()
    const { container } = render(<SetupWizard client={fakeClient()} locale="he" />)
    await screen.findByTestId('setup-wizard')
    const body = container.querySelector('.setup-body')
    const kids = [...(body?.children ?? [])].map((el) => el.tagName)
    expect(kids).toEqual(['MAIN', 'ASIDE'])
  })

  it('keeps both of §5.1 exits in the header', async () => {
    registerM1Stubs()
    render(<SetupWizard client={fakeClient()} locale="he" />)
    expect(await screen.findByTestId('setup-save-exit')).toBeInTheDocument()
    expect(screen.getByTestId('setup-open-dashboard')).toBeInTheDocument()
  })

  it('fills the progress bar by steps ANSWERED, not by where the manager is standing', async () => {
    // A manager who paged back to step 1 has not undone anything, and a bar that shrank
    // when they did would say they had.
    registerM1Stubs()
    render(<SetupWizard client={fakeClient()} locale="he" />)
    expect(await screen.findByTestId('setup-progress')).toHaveAttribute('data-done', '0')
  })
})

// ── the order is a contract in four places ──────────────────────────────────────────
describe('every wizard step registers at the position WIZARD_STEP_ORDER gives it', () => {
  it('registers M1 four steps at their own indices, with no two claiming one slot', async () => {
    // The 2026-08-29 swap (groups before belts, because a belt ladder needs a class) had
    // to be made in four places: `WIZARD_STEPS` on the server, `WIZARD_STEP_ORDER` here,
    // `register.ts`, and `BeltsWizardStep.tsx`. Missing one leaves two steps claiming the
    // same position — which is not a crash, just an owner landing on the wrong panel
    // after finishing the previous step. This test is that missed edit, caught.
    const { registerM1WizardSteps } = await import('./register')
    clearSlot('setup-wizard')
    registerM1WizardSteps(async () => new Response('{}'))

    const { result } = renderHook(() => useSlot<WizardStepProps>('setup-wizard'))
    const entries = result.current
    expect(entries).toHaveLength(4)
    for (const entry of entries) {
      expect(entry.order).toBe(WIZARD_STEP_ORDER.indexOf(entry.key as WizardStepId) + 1)
    }
    // No duplicates among the positions M1 claims — belts and prices fill the gaps.
    const orders = entries.map((entry) => entry.order)
    expect(new Set(orders).size).toBe(orders.length)
    expect(orders).not.toContain(WIZARD_STEP_ORDER.indexOf('belts') + 1)
  })
})

describe('the finish exit (2026-08-30)', () => {
  it('offers a way OUT once every step is answered — done and skipped alike', async () => {
    // 'After I finished there is no finish button to jump into the manager board.' A
    // wizard that ends with nowhere to go strands the owner on its last panel. Skipped
    // counts as answered: a club that sells nothing skipped items and is still finished.
    registerM1Stubs()
    const answered = progress({
      studio: 'done',
      groups: 'done',
      belts: 'done',
      prices: 'done',
      staff: 'done',
      students: 'done',
      items: 'skipped',
    })
    render(<SetupWizard client={fakeClient(answered)} locale="he" />)
    const finish = await screen.findByTestId('setup-finish')
    expect(finish).toHaveAttribute('href', '#/')
    expect(finish).toHaveTextContent(t('he', 'common.setup.finishCta'))
  })

  it('offers no exit while a step is still pending', async () => {
    registerM1Stubs()
    render(<SetupWizard client={fakeClient(progress({ studio: 'done' }))} locale="he" />)
    await screen.findByTestId('setup-complete')
    expect(screen.queryByTestId('setup-finish')).toBeNull()
  })
})

describe('a step this surface has not built (2026-08-30)', () => {
  it('is reachable from the rail, says where it is edited, links there, and can be skipped', async () => {
    // The staff app registers four of seven steps; a DISABLED rail button for the other
    // three read as "payments and belts don't work".
    registerM1Stubs()
    const client = fakeClient({
      ...progress(),
      dashboard_url: 'http://localhost:5175',
    } as SetupProgress)
    render(<SetupWizard client={client} locale="he" />)
    await userEvent.click(await screen.findByTestId('setup-rail-belts'))
    const body = await screen.findByTestId('setup-step-unbuilt')
    expect(body).toHaveTextContent(t('he', 'common.setup.stepInDashboard'))
    expect(screen.getByTestId('setup-unbuilt-dashboard')).toHaveAttribute(
      'href',
      'http://localhost:5175/#/setup',
    )
    await userEvent.click(screen.getByTestId('setup-skip-unbuilt'))
    await waitFor(() => expect(client.calls).toContain('belts:skipped'))
  })
})

describe('cross-app freshness (2026-08-30)', () => {
  it('re-reads progress when the window regains focus — a step finished on the other app appears', async () => {
    registerM1Stubs()
    const base = fakeClient()
    const read = vi.fn(base.read)
    render(<SetupWizard client={{ ...base, read }} locale="he" />)
    await screen.findByTestId('setup-wizard')
    const before = read.mock.calls.length
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(before))
  })
})
