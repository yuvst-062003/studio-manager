// The unfinished-setup nudge (2026-08-28).
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { SetupIncompleteBanner } from './SetupIncompleteBanner'
import type { SetupClient } from './SetupWizard'

function client(read: SetupClient['read']): SetupClient {
  return { read, setStep: vi.fn(), dismiss: vi.fn() } as unknown as SetupClient
}

const STEPS = (done: number, total = 6) =>
  Array.from({ length: total }, (_, index) => ({
    key: `step-${index}`,
    status: index < done ? 'done' : 'pending',
  }))

describe('SetupIncompleteBanner', () => {
  it('names the progress and jumps back into the wizard', async () => {
    const onOpen = vi.fn()
    render(
      <SetupIncompleteBanner
        client={client(
          vi.fn(async () => ({ steps: STEPS(2), complete: false, dismissed_at: null }) as never),
        )}
        locale="he"
        onOpen={onOpen}
      />,
    )
    expect(await screen.findByTestId('setup-incomplete-progress')).toHaveTextContent(
      'הושלמו 2 מתוך 6 שלבים',
    )
    await userEvent.click(screen.getByTestId('setup-incomplete-resume'))
    expect(onOpen).toHaveBeenCalled()
  })

  it('shows even after the wizard was DISMISSED — that is the state it exists for', async () => {
    render(
      <SetupIncompleteBanner
        client={client(
          vi.fn(
            async () =>
              ({ steps: STEPS(3), complete: false, dismissed_at: '2026-08-27T10:00:00Z' }) as never,
          ),
        )}
        locale="he"
        onOpen={vi.fn()}
      />,
    )
    expect(await screen.findByTestId('setup-incomplete')).toBeInTheDocument()
  })

  it('renders nothing once setup is complete', async () => {
    const read = vi.fn(async () => ({ steps: STEPS(6), complete: true, dismissed_at: null }) as never)
    render(<SetupIncompleteBanner client={client(read)} locale="he" onOpen={vi.fn()} />)
    await waitFor(() => expect(read).toHaveBeenCalled())
    expect(screen.queryByTestId('setup-incomplete')).toBeNull()
  })

  it('renders nothing on a failed read — a nudge is never worth an alarm', async () => {
    const read = vi.fn(async () => {
      throw new TypeError('offline')
    })
    render(<SetupIncompleteBanner client={client(read)} locale="he" onOpen={vi.fn()} />)
    await waitFor(() => expect(read).toHaveBeenCalled())
    expect(screen.queryByTestId('setup-incomplete')).toBeNull()
  })

  it('speaks from i18n', async () => {
    render(
      <SetupIncompleteBanner
        client={client(
          vi.fn(async () => ({ steps: STEPS(0), complete: false, dismissed_at: null }) as never),
        )}
        locale="he"
        onOpen={vi.fn()}
      />,
    )
    expect(await screen.findByText(t('he', 'common.setup.incomplete.title'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.setup.incomplete.resume'))).toBeInTheDocument()
  })
})
