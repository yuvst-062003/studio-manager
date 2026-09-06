import { describe, expect, it, vi } from 'vitest'
import { lockViewportZoom } from './lockViewportZoom'

/** Records what was registered, so the two things that silently break can be asserted. */
function spyTarget() {
  const added: { type: string; fn: EventListener; options?: unknown }[] = []
  const removed: { type: string; fn: EventListener }[] = []
  return {
    added,
    removed,
    addEventListener: vi.fn((type: string, fn: EventListener, options?: unknown) => {
      added.push({ type, fn, options })
    }),
    removeEventListener: vi.fn((type: string, fn: EventListener) => {
      removed.push({ type, fn })
    }),
  }
}

describe('lockViewportZoom', () => {
  it('refuses all three WebKit pinch gestures', () => {
    const target = spyTarget()
    lockViewportZoom(target)
    expect(target.added.map((a) => a.type)).toEqual([
      'gesturestart',
      'gesturechange',
      'gestureend',
    ])
  })

  it('registers non-passive, or preventDefault is ignored and the page zooms anyway', () => {
    // The failure this pins has no error and no visible symptom in a test: a passive
    // listener still runs, still calls preventDefault(), and the browser still zooms. Only
    // the option distinguishes a working lock from a decorative one.
    const target = spyTarget()
    lockViewportZoom(target)
    for (const added of target.added) {
      expect(added.options, added.type).toEqual({ passive: false })
    }
  })

  it('actually calls preventDefault on the gesture', () => {
    const target = spyTarget()
    lockViewportZoom(target)
    const event = { preventDefault: vi.fn() } as unknown as Event
    target.added[0]!.fn(event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('removes the same listener references it added', () => {
    // Not `toHaveBeenCalledTimes(3)`: removeEventListener matches on identity, so a
    // disposer that passed a fresh closure would call it three times and detach nothing.
    const target = spyTarget()
    lockViewportZoom(target)()
    expect(target.removed).toEqual(target.added.map(({ type, fn }) => ({ type, fn })))
  })
})
