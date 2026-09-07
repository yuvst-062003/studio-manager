// §18.1's console and §18.3's operations board.
//
// The assertions that matter here pin RULES rather than renderings, because every one of
// them is a thing a later edit could quietly reverse into a screen that looks fine and
// says the wrong thing:
//
//   * a job that has never run reads as a finding, not as a blank cell
//   * a job scheduled in another environment is never red
//   * "email alerts are not configured" is stated, because an empty inbox looks the same
//     whether nothing is wrong or nothing can reach you
//   * a non-operator gets a refusal, not an empty console
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { OpsHealthPanel, jobState } from './OpsHealthPanel'
import { PlatformSection } from './PlatformSection'
import { makePlatformClient } from './client'
import type { JobHealth, OpsHealth, PlatformClient, PlatformStudio } from './client'

// The section builds its own client out of `apiFetch` when App.tsx gives it none, so the
// only way to exercise that configuration is to own `apiFetch`. `vi.hoisted` because
// `vi.mock` is lifted above every import.
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@studio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@studio/core')>()),
  apiFetch,
}))

const job = (overrides: Partial<JobHealth> = {}): JobHealth => ({
  name: 'billing-run',
  schedule: '30 8 * * *',
  environment: 'production',
  max_silence_minutes: 1800,
  last_run_at: '2026-08-30T05:30:00Z',
  last_success_at: '2026-08-30T05:30:00Z',
  last_status: 'succeeded',
  overdue: false,
  failing: false,
  scheduled_here: true,
  ...overrides,
})

const health = (overrides: Partial<OpsHealth> = {}): OpsHealth => ({
  status: 'ok',
  checked_at: '2026-08-30T06:00:00Z',
  env: 'production',
  jobs: [job()],
  signals: [
    { id: 'api.unhandled_exceptions', status: 'ok', value: 0, since: '2026-08-29T06:00:00Z' },
    { id: 'billing.zero_charge_run', status: 'ok', value: 0, since: '2026-08-23T06:00:00Z' },
    { id: 'upay.callback_silence', status: 'unknown', value: null, since: null },
  ],
  email_configured: true,
  ...overrides,
})

const studio = (overrides: Partial<PlatformStudio> = {}): PlatformStudio => ({
  id: 'st-1',
  name: 'גלדיאטור',
  slug: 'gladiator',
  timezone: 'Asia/Jerusalem',
  default_locale: 'he',
  status: 'active',
  is_demo: false,
  created_at: '2026-08-01T00:00:00Z',
  ...overrides,
})

function stubClient(overrides: Partial<PlatformClient> = {}): PlatformClient {
  return {
    health: vi.fn(() => Promise.resolve(health())),
    listStudios: vi.fn(() => Promise.resolve([studio()])),
    createStudio: vi.fn(() => Promise.resolve(studio())),
    inviteOwner: vi.fn(() =>
      Promise.resolve({
        id: 'inv-1',
        email: 'owner@example.invalid',
        expires_at: '2026-09-06T00:00:00Z',
        token: 'the-one-and-only-token',
      }),
    ),
    suspend: vi.fn(() => Promise.resolve(studio({ status: 'suspended' }))),
    ...overrides,
  }
}

describe('jobState', () => {
  it('calls a job in another environment elsewhere, even when it looks overdue', () => {
    // The ordering matters and is the reason this is a function rather than three
    // ternaries in the JSX: seven of the nine declared jobs are production's, and read on
    // staging every one of them has been silent for ever.
    expect(jobState(job({ scheduled_here: false, overdue: true }))).toBe('elsewhere')
  })

  it('ranks a failing run above an overdue one', () => {
    // They need different fixes. "It ran and threw" is a bug; "it never ran" is a
    // question about the scheduler, and only the second is what this board was built for.
    expect(jobState(job({ failing: true, overdue: true }))).toBe('failing')
  })

  it('is ok only when it is scheduled here, not failing and not overdue', () => {
    expect(jobState(job())).toBe('ok')
    expect(jobState(job({ overdue: true }))).toBe('overdue')
  })
})

describe('the operations board', () => {
  it('says a job has never run rather than leaving the cell blank', () => {
    // The whole feature in one assertion. Four workers were scheduled nowhere for a
    // milestone; an empty cell reads as a screen still loading, and this has to read as a
    // finding.
    render(
      <OpsHealthPanel
        health={health({ jobs: [job({ last_success_at: null, last_run_at: null, overdue: true })] })}
        locale="he"
      />,
    )
    expect(screen.getByTestId('job-never-billing-run')).toBeInTheDocument()
  })

  it('says out loud when email delivery is not configured', () => {
    render(<OpsHealthPanel health={health({ email_configured: false })} locale="he" />)
    expect(screen.getByTestId('ops-email-off')).toBeInTheDocument()
  })

  it('does not claim alerts are off when they are on', () => {
    render(<OpsHealthPanel health={health({ email_configured: true })} locale="he" />)
    expect(screen.queryByTestId('ops-email-off')).not.toBeInTheDocument()
    expect(screen.getByTestId('ops-email-on')).toBeInTheDocument()
  })

  it('renders every signal, including the unknown one', () => {
    // `unknown` is a real answer, not a soft ok: an environment that has never taken a
    // payment has not lost its payment provider. Dropping it from the list would make the
    // absence invisible, which is the same defect one level up.
    render(<OpsHealthPanel health={health()} locale="he" />)
    expect(screen.getByTestId('ops-signal-upay.callback_silence')).toBeInTheDocument()
  })

  it('lays the cron expression out left to right', () => {
    // `*/15 * * * *` laid out right-to-left is a different expression.
    const { container } = render(<OpsHealthPanel health={health()} locale="he" />)
    const ltr = [...container.querySelectorAll('[dir="ltr"]')].map((node) => node.textContent)
    expect(ltr).toContain('30 8 * * *')
  })

  it('shows the jobs table caption as this panel\'s own visible heading', () => {
    // The Card around this Table carries no caption of its own (see the comment at
    // OpsHealthPanel.tsx:148) — the Table's <caption> IS the section's only visible
    // title, so it must opt into `captionVisible` rather than take Table's default.
    //
    // `getByText` alone would pass whether the caption is visible or clipped — the text
    // is in the DOM either way, since Table's clipping (like the theme control's
    // off-screen radio before it) keeps the caption in the accessibility tree on
    // purpose. The class is what actually differs between the two states, so that is
    // what this test has to assert. Same distinction Table.test.tsx itself draws between
    // its `captionVisible` cases.
    const { container } = render(<OpsHealthPanel health={health()} locale="he" />)
    const caption = container.querySelector('table caption')
    expect(caption).not.toBeNull()
    expect(caption).not.toHaveClass('studio-visually-hidden')
  })
})

describe('the platform console', () => {
  it('refuses a caller who is not a platform admin', async () => {
    const client = stubClient()
    render(<PlatformSection client={client} isPlatformAdmin={false} locale="he" />)

    expect(screen.queryByTestId('platform-console')).not.toBeInTheDocument()
    // And it must not have ASKED. A screen that fetches and then hides the answer has
    // still made the request.
    expect(client.health).not.toHaveBeenCalled()
    expect(client.listStudios).not.toHaveBeenCalled()
  })

  it('shows the board and the clubs to an operator', async () => {
    render(<PlatformSection client={stubClient()} isPlatformAdmin locale="he" />)

    expect(await screen.findByTestId('platform-console')).toBeInTheDocument()
    expect(await screen.findByTestId('ops-health')).toBeInTheDocument()
    expect(await screen.findByTestId('platform-studios')).toBeInTheDocument()
  })

  it('shows the invitation token once, with the warning that it is the only time', async () => {
    // Only the SHA-256 is stored, so a screen that does not put this in front of the
    // operator immediately has lost it and the only recovery is issuing a second one.
    const client = stubClient()
    render(<PlatformSection client={client} isPlatformAdmin locale="he" />)

    await userEvent.click(await screen.findByTestId('invite-owner-gladiator'))
    await userEvent.type(screen.getByLabelText('דוא״ל'), 'owner@example.invalid')
    await userEvent.type(screen.getByLabelText('שם פרטי'), 'יובל')
    await userEvent.type(screen.getByLabelText('שם משפחה'), 'כהן')
    await userEvent.click(screen.getByTestId('platform-invite-submit'))

    const token = await screen.findByTestId('platform-invite-token')
    expect(token).toHaveTextContent('the-one-and-only-token')
    expect(screen.getByText(/פעם אחת בלבד/)).toBeInTheDocument()
  })

  it('provisions a club through the endpoint §5.1 reserves for the operator', async () => {
    const client = stubClient()
    render(<PlatformSection client={client} isPlatformAdmin locale="he" />)

    await userEvent.click(await screen.findByTestId('platform-create-open'))
    await userEvent.type(screen.getByLabelText('שם המועדון'), 'מועדון חדש')
    await userEvent.type(screen.getByLabelText('מזהה באנגלית'), 'new-club')
    await userEvent.click(screen.getByTestId('platform-create-submit'))

    await waitFor(() =>
      expect(client.createStudio).toHaveBeenCalledWith({
        name: 'מועדון חדש',
        slug: 'new-club',
        // G3 — a rendering timezone, never a storage one.
        timezone: 'Asia/Jerusalem',
        default_locale: 'he',
      }),
    )
  })

  it('names a slug that is already taken rather than saying only that it failed', async () => {
    // `studio.slug` is UNIQUE. The insert used to reach the constraint and leave a 500,
    // and the console renders one generic refusal for anything with no code — so an
    // operator whose identifier was taken was told nothing and retried the same value.
    // The form stays open with what they typed, because the fix is one field away.
    const client = stubClient({
      createStudio: vi.fn(() => Promise.reject(Object.assign(new Error('409'), { status: 409 }))),
    })
    render(<PlatformSection client={client} isPlatformAdmin locale="he" />)

    await userEvent.click(await screen.findByTestId('platform-create-open'))
    await userEvent.type(screen.getByLabelText('שם המועדון'), 'מועדון חדש')
    await userEvent.type(screen.getByLabelText('מזהה באנגלית'), 'gladiator')
    await userEvent.click(screen.getByTestId('platform-create-submit'))

    expect(
      await screen.findByText(t('he', 'common.platform.new.slugTaken')),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('מזהה באנגלית')).toHaveValue('gladiator')
  })

  it('asks before suspending, and does nothing when the answer is no', async () => {
    // Suspension removes the club from every studio switcher its members have. A large
    // effect from a small button is the one place a confirm earns its keep.
    const client = stubClient()
    render(<PlatformSection client={client} isPlatformAdmin locale="he" />)

    await userEvent.click(await screen.findByTestId('suspend-gladiator'))
    expect(await screen.findByTestId('platform-suspend-confirm')).toBeInTheDocument()
    // Opening the dialog must not itself be the action.
    expect(client.suspend).not.toHaveBeenCalled()

    await userEvent.click(screen.getByTestId('platform-suspend-no'))
    expect(client.suspend).not.toHaveBeenCalled()
  })

  it('suspends once the operator confirms', async () => {
    // The other direction. Without it, a dialog wired to nothing would pass the test
    // above perfectly.
    const client = stubClient()
    render(<PlatformSection client={client} isPlatformAdmin locale="he" />)

    await userEvent.click(await screen.findByTestId('suspend-gladiator'))
    await userEvent.click(await screen.findByTestId('platform-suspend-yes'))

    await waitFor(() => expect(client.suspend).toHaveBeenCalledWith('st-1'))
  })

  it('reports a failed load instead of rendering an empty console', async () => {
    const client = stubClient({ health: vi.fn(() => Promise.reject(new Error('403'))) })
    render(<PlatformSection client={client} isPlatformAdmin locale="he" />)

    expect(await screen.findByTestId('load-failed')).toBeInTheDocument()
  })
})

// -- the seam, with no `client` prop -------------------------------------------------
//
// Every test above hands `PlatformSection` a stub client, which is one stable object for
// the life of the render. `App.tsx` hands it nothing, so the section builds its own — and
// that is the ONE configuration the deployed console runs in and the one nothing covered.
// CLAUDE.md: "Test the seam, not just the component."
describe('the console App.tsx actually mounts', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            path.includes('/platform/health')
              ? health()
              : path.endsWith('/platform/studios')
                ? { items: [studio()] }
                : studio(),
          ),
      } as unknown as Response),
    )
  })

  it('loads once rather than re-requesting for ever', async () => {
    // A default parameter is re-evaluated on EVERY render, so a client built there is a
    // new object each time — which changes `load`'s identity, which re-runs the effect,
    // which sets state, which renders again. The console then hammers the API for as long
    // as it is open, and the first response that fails unmounts the panel and takes
    // whatever the operator had typed into the create form with it.
    render(<PlatformSection isPlatformAdmin locale="he" />)

    await screen.findByTestId('platform-studios')
    // Deliberately NOT `act`: a console stuck in this loop never settles, so an `act`
    // that waits for it to go quiet times out and reports a timeout rather than the
    // defect. Two real-time sleeps and a count is what names it.
    const settled = apiFetch.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(apiFetch.mock.calls.length).toBe(settled)
  })

  it('carries the refusal status on the error it throws', async () => {
    // The screen can only tell 409 from 422 if the client hands it something to read.
    // `new Error('409')` is a string a rendering would have to parse, and the panel's
    // `error.status` read against it was always `undefined` — so every refusal rendered
    // the same "the action failed".
    apiFetch.mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({}) })
    const client = makePlatformClient(apiFetch as never)

    await expect(
      client.createStudio({
        name: 'x',
        slug: 'gladiator',
        timezone: 'Asia/Jerusalem',
        default_locale: 'he',
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('provisions a club through its own client, not only through a stub', async () => {
    render(<PlatformSection isPlatformAdmin locale="he" />)

    await userEvent.click(await screen.findByTestId('platform-create-open'))
    await userEvent.type(screen.getByLabelText('שם המועדון'), 'מועדון חדש')
    await userEvent.type(screen.getByLabelText('מזהה באנגלית'), 'new-club')
    await userEvent.click(screen.getByTestId('platform-create-submit'))

    await waitFor(() => {
      // Indexed rather than destructured: `mock.calls` is `any[][]`, and TypeScript will
      // not narrow an `any[]` into a two-element tuple.
      const posted = apiFetch.mock.calls.find(
        (call) => call[0] === '/api/v1/platform/studios' && call[1]?.method === 'POST',
      )
      expect(posted).toBeDefined()
      expect(JSON.parse(String(posted?.[1]?.body))).toEqual({
        name: 'מועדון חדש',
        slug: 'new-club',
        timezone: 'Asia/Jerusalem',
        default_locale: 'he',
      })
    })
  })
})
