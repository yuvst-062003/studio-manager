// The update policy: silent at launch, an invitation mid-session, never a rug-pull.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { UpdateToast } from './UpdateToast'
import { SW_LAUNCH_GRACE_MS, SW_UPDATE_EVENT, onSwUpdateReady } from './swUpdate'
import type { SwUpdateDetail } from './swUpdate'

const announce = (apply: () => void) =>
  globalThis.dispatchEvent(
    new CustomEvent<SwUpdateDetail>(SW_UPDATE_EVENT, { detail: { apply } }),
  )

describe('onSwUpdateReady', () => {
  it('applies silently when the update was waiting at launch', () => {
    // The whole point of automatic updates: nobody who just opened the app should be
    // asked to press a button to get the build the server already gave them.
    const apply = vi.fn()
    const heard = vi.fn()
    globalThis.addEventListener(SW_UPDATE_EVENT, heard)
    onSwUpdateReady(apply, SW_LAUNCH_GRACE_MS - 1)
    globalThis.removeEventListener(SW_UPDATE_EVENT, heard)
    expect(apply).toHaveBeenCalledOnce()
    expect(heard).not.toHaveBeenCalled()
  })

  it('asks instead of reloading once a session is under way', () => {
    // §10.6's rule survives in this branch: a coach mid-roster is never reloaded
    // underneath — the update becomes UpdateToast's offer and waits.
    const apply = vi.fn()
    const heard = vi.fn()
    globalThis.addEventListener(SW_UPDATE_EVENT, heard)
    onSwUpdateReady(apply, SW_LAUNCH_GRACE_MS + 1)
    globalThis.removeEventListener(SW_UPDATE_EVENT, heard)
    expect(apply).not.toHaveBeenCalled()
    expect(heard).toHaveBeenCalledOnce()
  })
})

describe('UpdateToast', () => {
  it('renders nothing until an update is announced', () => {
    const { container } = render(<UpdateToast locale="he" />)
    expect(container.firstChild).toBeNull()
  })

  it('applies the update on the one tap', async () => {
    const apply = vi.fn()
    render(<UpdateToast locale="he" />)
    announce(apply)
    await userEvent.click(await screen.findByTestId('update-toast-reload'))
    expect(apply).toHaveBeenCalledOnce()
  })

  it('dismisses without applying — the next launch picks it up anyway', async () => {
    const apply = vi.fn()
    render(<UpdateToast locale="he" />)
    announce(apply)
    expect(await screen.findByText(t('he', 'common.update.available'))).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('update-toast-dismiss'))
    expect(screen.queryByTestId('update-toast')).toBeNull()
    expect(apply).not.toHaveBeenCalled()
  })
})
