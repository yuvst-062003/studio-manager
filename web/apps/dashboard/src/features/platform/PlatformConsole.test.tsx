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
import { describe, expect, it, vi } from 'vitest'
import { OpsHealthPanel, jobState } from './OpsHealthPanel'
import { PlatformSection } from './PlatformSection'
import type { JobHealth, OpsHealth, PlatformClient, PlatformStudio } from './client'

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
