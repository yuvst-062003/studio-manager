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

  it('separates the title, the count and the button instead of running them together', async () => {
    // Staging printed `הקמת המועדוןעדיין לא הושלמההושלמו 1 מתוך 6 שלבים` — two sentences
    // and a count as one word, on the first screen a manager sees. Alert renders its
    // children in a single <p>, so with no layout the three are inline siblings and JSX
    // strips the whitespace between them. The assertion is the structure that prevents
    // it, because the failure is in layout and the text nodes were always distinct.
    const { container } = render(
      <SetupIncompleteBanner
        client={client(
          vi.fn(async () => ({ steps: STEPS(1), complete: false, dismissed_at: null }) as never),
        )}
        locale="he"
        onOpen={vi.fn()}
      />,
    )
    await screen.findByTestId('setup-incomplete-progress')
    const text = container.querySelector('.studio-setup-nudge__text')
    expect(text).not.toBeNull()
    // Title and count live together in the text column…
    expect(text).toContainElement(screen.getByTestId('setup-incomplete-progress'))
    // …and the button is outside it, so it can be pushed to the far edge.
    expect(text).not.toContainElement(screen.getByTestId('setup-incomplete-resume'))
    // No <div> inside the <p>: that would close the paragraph early in a real browser.
    expect(container.querySelector('.studio-alert__body div')).toBeNull()
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

describe('naming the gap (2026-08-30)', () => {
  it('says WHICH steps are left — a skipped step counts as left, not finished', async () => {
    const progress = {
      steps: [
        { id: 'studio', order: 1, status: 'done' as const, at: null },
        { id: 'items', order: 5, status: 'skipped' as const, at: null },
      ],
      complete: false,
      dismissed_at: null,
    }
    render(
      <SetupIncompleteBanner
        client={{ read: async () => progress } as never}
        locale="he"
        onOpen={() => undefined}
      />,
    )
    expect(await screen.findByTestId('setup-incomplete-missing')).toHaveTextContent(
      t('he', 'common.setup.step.items'),
    )
  })
})
