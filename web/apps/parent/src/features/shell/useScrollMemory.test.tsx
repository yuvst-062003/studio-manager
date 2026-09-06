import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollMemory } from './useScrollMemory'

// jsdom never scrolls: `scrollY` is a getter fixed at 0 and `scrollTo` is a warning. So the
// page is faked here — one number, moved by `scrollTo`, read by `scrollY` — which is
// exactly the surface the hook uses and nothing more.
let offset = 0
/** How tall the fake page is. Below this the browser clamps, which is what the retry
 *  window exists for: the list arrives after the screen commits. */
let height = 10_000

function Probe({ hash }: { hash: string }) {
  useScrollMemory(hash)
  return <div data-testid="probe">{hash}</div>
}

const setHash = (hash: string) => {
  globalThis.location.hash = hash
}

/** Runs the queued animation frames, which is where the recorder and the retries live. */
const frames = async (count = 1) => {
  for (let i = 0; i < count; i += 1) {
    await vi.advanceTimersByTimeAsync(17)
  }
}

const scrollTo = vi.fn((_x: number, y: number) => {
  offset = Math.min(y, height)
  globalThis.dispatchEvent(new Event('scroll'))
})

beforeEach(() => {
  vi.useFakeTimers()
  offset = 0
  height = 10_000
  scrollTo.mockClear()
  vi.stubGlobal('scrollTo', scrollTo)
  Object.defineProperty(globalThis, 'scrollY', { configurable: true, get: () => offset })
  // rAF is left to vitest's fake timers, which fake it by default — stubbing it with
  // setTimeout produced ids that cancelAnimationFrame then refused to clear.
  setHash('#/')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** The reader scrolls: move the page and fire the event the browser would. */
const readerScrollsTo = async (y: number) => {
  offset = y
  globalThis.dispatchEvent(new Event('scroll'))
  await frames()
}

describe('useScrollMemory', () => {
  it('opens a screen it has never seen at the top', async () => {
    const { rerender } = render(<Probe hash="#/" />)
    await readerScrollsTo(1500)

    setHash('#/shop')
    rerender(<Probe hash="#/shop" />)
    expect(globalThis.scrollY).toBe(0)
  })

  it('puts the reader back where they were when they return', async () => {
    // The whole point. Without this, going back to בית restarts a list already read.
    const { rerender } = render(<Probe hash="#/" />)
    await readerScrollsTo(1500)

    setHash('#/shop')
    rerender(<Probe hash="#/shop" />)
    await readerScrollsTo(300)

    setHash('#/')
    rerender(<Probe hash="#/" />)
    expect(globalThis.scrollY).toBe(1500)

    setHash('#/shop')
    rerender(<Probe hash="#/shop" />)
    expect(globalThis.scrollY).toBe(300)
  })

  it('keeps reaching for the offset while the list is still loading', async () => {
    // The failure without the retry: the screen commits empty, the browser clamps 1500 to
    // 400, and the reader lands near the top of a list they had scrolled through.
    const { rerender } = render(<Probe hash="#/" />)
    await readerScrollsTo(1500)
    setHash('#/shop')
    rerender(<Probe hash="#/shop" />)

    height = 400 // the incoming screen has only its header so far
    setHash('#/')
    rerender(<Probe hash="#/" />)
    expect(globalThis.scrollY).toBe(400) // clamped, as the browser would

    height = 10_000 // the fetch lands
    await frames(3)
    expect(globalThis.scrollY).toBe(1500)
  })

  it('gives up once the reader starts scrolling themselves', async () => {
    // A page that yanks itself down a second after someone started reading is worse than
    // one that never restored at all.
    const { rerender } = render(<Probe hash="#/" />)
    await readerScrollsTo(1500)
    setHash('#/shop')
    rerender(<Probe hash="#/shop" />)

    height = 400
    setHash('#/')
    rerender(<Probe hash="#/" />)
    globalThis.dispatchEvent(new Event('touchstart'))

    height = 10_000
    await frames(5)
    expect(globalThis.scrollY).toBe(400)
  })

  it('stops reaching after a bounded window rather than forever', async () => {
    const { rerender } = render(<Probe hash="#/" />)
    await readerScrollsTo(1500)
    setHash('#/shop')
    rerender(<Probe hash="#/shop" />)

    height = 400
    setHash('#/')
    rerender(<Probe hash="#/" />)
    await frames(40) // past RESTORE_FRAMES

    height = 10_000
    await frames(5)
    expect(globalThis.scrollY).toBe(400)
  })

  it('does not credit the outgoing screen with the incoming screen\'s clamp', async () => {
    // The recorder's guard. Between the hash changing and the restore running, the browser
    // can clamp and dispatch a scroll event; attributing it to the screen being LEFT would
    // quietly erase the position this hook exists to keep.
    const { rerender } = render(<Probe hash="#/" />)
    await readerScrollsTo(1500)

    setHash('#/shop') // the hash moves first, as it does in a real navigation
    offset = 0
    globalThis.dispatchEvent(new Event('scroll'))
    await frames()
    rerender(<Probe hash="#/shop" />)

    setHash('#/')
    rerender(<Probe hash="#/" />)
    expect(globalThis.scrollY).toBe(1500)
  })
})
