import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  LAUNCH_ENTER_MS,
  LaunchCover,
  LaunchScreen,
  launchReady,
  riseStyle,
  useLaunchEntrance,
} from './LaunchScreen'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('LaunchScreen', () => {
  it('stays up while the app is not ready, even after its own entrance has finished', async () => {
    const onUncover = vi.fn()
    render(<LaunchScreen locale="he" ready={false} onUncover={onUncover} onGone={vi.fn()} />)
    await pause(LAUNCH_ENTER_MS + 150)
    expect(screen.getByTestId('launch-screen')).toBeInTheDocument()
    expect(onUncover).not.toHaveBeenCalled()
  })

  it('finishes its entrance before it leaves, then uncovers first and reports gone after the fade', async () => {
    const onUncover = vi.fn()
    const onGone = vi.fn()
    render(<LaunchScreen locale="he" ready={true} onUncover={onUncover} onGone={onGone} />)
    // Ready from the first frame — and still not gone in the first frame.
    expect(onUncover).not.toHaveBeenCalled()
    await waitFor(() => expect(onUncover).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(onGone).not.toHaveBeenCalled()
    expect(screen.getByTestId('launch-screen')).toHaveAttribute('data-leaving', 'true')
    await waitFor(() => expect(onGone).toHaveBeenCalledTimes(1), { timeout: 1500 })
  })

  it('takes over from the pre-paint index.html drew, in the same frame it mounts', () => {
    const prepaint = document.createElement('div')
    prepaint.id = 'launch'
    document.body.append(prepaint)
    render(<LaunchScreen locale="he" ready={false} onUncover={vi.fn()} onGone={vi.fn()} />)
    expect(document.getElementById('launch')).toBeNull()
  })
})

describe('launchReady', () => {
  const signedIn = (parent: boolean) => ({
    status: 'signed-in' as const,
    access: { staff: false, parent },
  })

  it('is false while the session is still resolving', () => {
    expect(launchReady({ status: 'loading', access: { parent: false } }, null, null, 'loading')).toBe(false)
  })

  it('is true for a signed-out visitor — the sign-in screen is a real first screen', () => {
    expect(launchReady({ status: 'anonymous', access: { parent: false } }, null, null, 'loading')).toBe(true)
  })

  it('waits for the family list AND the consent gate when a parent is signed in', () => {
    expect(launchReady(signedIn(true), null, null, 'loading')).toBe(false)
    // The list is here but the gate under it still renders nothing — not a screen yet.
    expect(launchReady(signedIn(true), [], null, 'loading')).toBe(false)
    expect(launchReady(signedIn(true), [], null, 'open')).toBe(true)
    // A gate that is HOLDING is a real screen: it asks something.
    expect(launchReady(signedIn(true), [], null, 'holding')).toBe(true)
  })

  it('does not wait for a list that will never be fetched: no parent access, or an invitation', () => {
    expect(launchReady(signedIn(false), null, null, 'loading')).toBe(true)
    expect(launchReady(signedIn(true), null, { id: 'st-1', name: null }, 'loading')).toBe(true)
  })
})

describe('useLaunchEntrance', () => {
  function Probe() {
    const entered = useLaunchEntrance()
    return <div data-testid="probe" data-entered={entered ? 'true' : 'false'} style={riseStyle(entered, 0)} />
  }

  it('a block mounted under the cover is hidden, and rises once the cover starts to lift', async () => {
    const { rerender } = render(
      <LaunchCover.Provider value="up">
        <Probe />
      </LaunchCover.Provider>,
    )
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'false')
    expect(screen.getByTestId('probe').style.opacity).toBe('0')
    rerender(
      <LaunchCover.Provider value="lifting">
        <Probe />
      </LaunchCover.Provider>,
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'true'))
    expect(screen.getByTestId('probe').style.opacity).toBe('1')
  })

  it('a block that mounts while the cover is still dissolving rises with it', async () => {
    render(
      <LaunchCover.Provider value="lifting">
        <Probe />
      </LaunchCover.Provider>,
    )
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'false')
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'true'))
  })

  it('a block mounted with no cover over it is simply there — a tab switch is not a launch', () => {
    render(<Probe />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'true')
  })
})
