import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PullToRefresh } from './PullToRefresh'

// jsdom has no touch and no scrolling, so both are faked — the events the component
// listens for, and the one page property it reads.
let offset = 0

function touch(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }],
  })
  act(() => {
    globalThis.dispatchEvent(event)
  })
  return event
}

/** A pull of `dy` real pixels, which the component halves before comparing to its
 *  threshold — so 200 here is 100 of travel against a 36 threshold. */
async function pullBy(dy: number, dx = 0) {
  touch('touchstart', 100, 100)
  touch('touchmove', 100 + dx, 100 + dy)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  offset = 0
  Object.defineProperty(globalThis, 'scrollY', { configurable: true, get: () => offset })
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('coarse'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PullToRefresh', () => {
  it('renders nothing until a pull starts', () => {
    render(<PullToRefresh locale="he" onRefresh={vi.fn()} />)
    expect(screen.queryByTestId('pull-to-refresh')).toBeNull()
  })

  it('shows the indicator once the finger is pulling down from the top', async () => {
    render(<PullToRefresh locale="he" onRefresh={vi.fn()} />)
    await pullBy(40)
    expect(screen.getByTestId('pull-to-refresh')).toBeInTheDocument()
  })

  it('refreshes when the pull passes the threshold', async () => {
    const onRefresh = vi.fn()
    render(<PullToRefresh locale="he" onRefresh={onRefresh} />)
    await pullBy(200)
    touch('touchend', 100, 300)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh on a short pull — a tap must never reload the app', async () => {
    const onRefresh = vi.fn()
    render(<PullToRefresh locale="he" onRefresh={onRefresh} />)
    await pullBy(20)
    touch('touchend', 100, 120)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('ignores a pull that starts anywhere but the top of the page', async () => {
    // Otherwise reading down a list and dragging further would reload it out from under
    // the reader.
    const onRefresh = vi.fn()
    offset = 400
    render(<PullToRefresh locale="he" onRefresh={onRefresh} />)
    await pullBy(200)
    touch('touchend', 100, 300)
    expect(onRefresh).not.toHaveBeenCalled()
    expect(screen.queryByTestId('pull-to-refresh')).toBeNull()
  })

  it('leaves a sideways swipe to the strip it belongs to', async () => {
    // The children chips and the week strip both scroll horizontally across the top of
    // בית, which is exactly where this gesture lives.
    // Deliberately FAR past the threshold vertically, so the only thing that can stop it
    // is the guard: a version without one refreshes here.
    const onRefresh = vi.fn()
    render(<PullToRefresh locale="he" onRefresh={onRefresh} />)
    await pullBy(200, 300)
    touch('touchend', 400, 300)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does nothing at all on a mouse — the browser already has a reload', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const onRefresh = vi.fn()
    render(<PullToRefresh locale="he" onRefresh={onRefresh} />)
    await pullBy(200)
    touch('touchend', 100, 300)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('refreshes once, however long the finger stays down afterwards', async () => {
    const onRefresh = vi.fn()
    render(<PullToRefresh locale="he" onRefresh={onRefresh} />)
    await pullBy(200)
    touch('touchend', 100, 300)
    await pullBy(200)
    touch('touchend', 100, 300)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
