// SPEC §5.1's setup wizard.
//
// The test that matters most here is the LAST one: a fake step registers into
// 'setup-wizard' and lands in the right position without SetupWizard.tsx being touched.
// Without it, "M6 and M7 add a step without reopening the container" is a claim rather
// than a guarantee — and both of those milestones are waves away from finding out.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { clearSlot, registerSlot } from '../slots'
import { renderIn, DIRECTIONS } from '../testing'
import { SetupWizard } from './SetupWizard'
import type { SetupClient } from './SetupWizard'
import { LOGO_EDGE, makeStudioStep, resizeToSquarePng } from './StudioStep'
import { makeGroupsStep } from './GroupsStep'
import { makeStaffStep } from './StaffStep'
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
  registerSlot<WizardStepProps>('setup-wizard', { key: 'groups', order: 3, render: stubStep('groups') })
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

  it('disables a rail entry no lane has registered yet', async () => {
    registerM1Stubs()
    render(<SetupWizard client={fakeClient()} locale="he" />)
    // belts is M7's and prices is M6's. Reachable-looking-but-empty is worse than
    // visibly not ready.
    expect(await screen.findByTestId('setup-rail-belts')).toBeDisabled()
    expect(screen.getByTestId('setup-rail-prices')).toBeDisabled()
    expect(screen.getByTestId('setup-rail-studio')).toBeEnabled()
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
  it('places a step registered at order 2 between studio and groups, container untouched', async () => {
    registerM1Stubs()
    // Exactly what M7 will do: one registerSlot call, one file. Nothing in
    // SetupWizard.tsx knows this key exists.
    registerSlot<WizardStepProps>('setup-wizard', {
      key: 'belts',
      order: 2,
      render: stubStep('belts'),
    })

    render(<SetupWizard client={fakeClient(progress({ studio: 'done' }))} locale="he" />)

    // It is reachable...
    expect(await screen.findByTestId('setup-rail-belts')).toBeEnabled()
    // ...and it is where the canvas puts it: resume now lands on belts, not on groups.
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

  it('offers the three languages §9 ships and no more', async () => {
    const Step = makeStudioStep(studioClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByLabelText(t('he', 'common.setup.studio.locale.he'))
    const group = screen.getByRole('group', { name: t('he', 'common.setup.studio.parentLocales') })
    expect(within(group).getAllByRole('checkbox')).toHaveLength(3)
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

describe('step 3 · קבוצות ולו״ז', () => {
  const structureClient = () => ({
    listClasses: async () => [{ id: 'c1', name: "ג'ודו" }],
    listGroups: async () => [],
    listLocations: async () => [],
    createClass: vi.fn(async (name: string) => ({ id: 'c2', name })),
    createGroup: vi.fn(async (_classId: string, name: string) => ({ id: 'g1', name })),
    createLocation: vi.fn(async (name: string) => ({ id: 'l1', name })),
  })

  it('creates a group through the class that already exists', async () => {
    const client = structureClient()
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)

    await userEvent.type(
      await screen.findByLabelText(t('he', 'common.setup.groups.groupName')),
      'מתחילים',
    )
    await userEvent.click(screen.getByText(t('he', 'common.setup.groups.addGroup')))
    await waitFor(() => expect(client.createGroup).toHaveBeenCalledWith('c1', 'מתחילים'))
  })

  it('explains rather than 422s when there is no class to hang a group on', async () => {
    const client = { ...structureClient(), listClasses: async () => [] }
    const Step = makeGroupsStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByText(t('he', 'common.setup.groups.needClass'))).toBeInTheDocument()
  })

  it('carries no stale schedule promise — the weekly schedule shipped in W2 (F8)', async () => {
    const Step = makeGroupsStep(structureClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    await screen.findByTestId('setup-groups')
    expect(screen.queryByTestId('setup-groups-schedule-note')).toBeNull()
  })
})

describe('step 5 · צוות', () => {
  const staffClient = () => ({
    listGroups: async () => [{ id: 'g1', name: 'מתחילים' }],
    listInvitations: async () => [],
    invite: vi.fn(async () => undefined),
  })

  it('invites a coach by email into a group', async () => {
    const client = staffClient()
    const Step = makeStaffStep(client)
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)

    await userEvent.type(
      await screen.findByLabelText(t('he', 'common.setup.staff.email')),
      'coach@example.com',
    )
    await userEvent.selectOptions(
      screen.getByLabelText(t('he', 'common.setup.staff.group')),
      'g1',
    )
    await userEvent.click(screen.getByText(t('he', 'common.setup.staff.invite')))
    await waitFor(() =>
      expect(client.invite).toHaveBeenCalledWith('coach@example.com', 'lead_coach', 'g1'),
    )
  })

  it('offers only the two coach roles — owner and manager come from the console', async () => {
    const Step = makeStaffStep(staffClient())
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    const select = await screen.findByLabelText(t('he', 'common.setup.staff.role'))
    expect(within(select).getAllByRole('option')).toHaveLength(2)
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
      expect(client.invite).toHaveBeenCalledWith('coach@example.com', 'lead_coach', null),
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
