// The join link, after the screen behind it was deleted (owner, 2026-10-13): "when a person
// presses copy joining link it should be copied straight away with a little message copied
// for 1-2 seconds". That sentence is the test.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { JoinLinkCopyRow } from './JoinLinkCopyRow'

const LINK = 'https://app.gladiatorclub.co.il/join/abc123'

function stubLink(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  )
}

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  })
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>
}

beforeEach(() => {
  stubLink({ active: true, url: LINK, families: 3 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the join-link row', () => {
  it('copies the link on the first tap — no screen in between', async () => {
    const writeText = stubClipboard(() => Promise.resolve())
    render(<JoinLinkCopyRow locale="he" />)

    await userEvent.click(await screen.findByTestId('join-link-copy'))

    expect(writeText).toHaveBeenCalledWith(LINK)
  })

  it('says הועתק, and stops saying it', async () => {
    stubClipboard(() => Promise.resolve())
    render(<JoinLinkCopyRow locale="he" />)

    await userEvent.click(await screen.findByTestId('join-link-copy'))
    expect(await screen.findByText(t('he', 'people.join.copyRow.copied'))).toBeInTheDocument()

    // Real timers rather than fake ones: the row's own `fetch` resolves on a microtask the
    // fake clock does not drive, and a test that has to fight the clock to see a 1.8s
    // confirmation is testing the clock. CONFIRM_MS is 1800, so 3s is the honest wait.
    await waitFor(
      () =>
        expect(screen.queryByText(t('he', 'people.join.copyRow.copied'))).not.toBeInTheDocument(),
      { timeout: 3000 },
    )
  })

  it('says so when the clipboard refuses, rather than showing a tick over nothing', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')))
    render(<JoinLinkCopyRow locale="he" />)

    await userEvent.click(await screen.findByTestId('join-link-copy'))

    expect(await screen.findByText(t('he', 'people.join.copyRow.failed'))).toBeInTheDocument()
  })

  it('renders nothing at all when the club has no live link to copy', async () => {
    stubLink({ active: false, url: null, families: 0 })
    const { container } = render(<JoinLinkCopyRow locale="he" />)

    await waitFor(() => expect(container.querySelector('button')).toBeNull())
  })
})
