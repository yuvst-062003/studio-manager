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
  it('refuses all three WebKit pinch gestures, and the double tap', () => {
    const target = spyTarget()
    lockViewportZoom(target)
    expect(target.added.map((a) => a.type)).toEqual([
      'gesturestart',
      'gesturechange',
      'gestureend',
      // iOS Safari zooms on a double tap whatever the viewport meta says, and
      // `touch-action` is specified to stop it but has never been reliable on the root
      // there. Reported 2026-09-12 as the wizard still zooming on an iPhone.
      'touchend',
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

  /** One tap at a point in time, as `blockDoubleTap` reads it. */
  function tap(target: ReturnType<typeof spyTarget>, x: number, y: number) {
    const handler = target.added.find((a) => a.type === 'touchend')!.fn
    const event = {
      changedTouches: [{ clientX: x, clientY: y }],
      preventDefault: vi.fn(),
    } as unknown as TouchEvent
    handler(event)
    return event
  }

  describe('the double tap', () => {
    it('cancels a second tap in the same spot, which is what zooms', () => {
      const target = spyTarget()
      lockViewportZoom(target)
      tap(target, 100, 100)
      const second = tap(target, 104, 98)
      expect(second.preventDefault).toHaveBeenCalled()
    })

    it('leaves two taps on DIFFERENT controls alone', () => {
      // The regression this bound exists for. Cancelling every quick second tap cancels a
      // parent tapping two buttons in a hurry -- and cancelling `touchend` cancels the
      // click the app needed. Two taps more than a fingertip apart are two taps.
      const target = spyTarget()
      lockViewportZoom(target)
      tap(target, 100, 100)
      const elsewhere = tap(target, 100, 300)
      expect(elsewhere.preventDefault).not.toHaveBeenCalled()
    })

    it('leaves a slow second tap alone', () => {
      vi.useFakeTimers()
      try {
        const target = spyTarget()
        lockViewportZoom(target)
        tap(target, 100, 100)
        vi.advanceTimersByTime(1_000)
        const later = tap(target, 100, 100)
        expect(later.preventDefault).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not cancel a THIRD tap just because the second was cancelled', () => {
      // Without resetting the clock on a block, a finger resting on one spot would have
      // every tap after the first cancelled forever.
      const target = spyTarget()
      lockViewportZoom(target)
      tap(target, 100, 100)
      tap(target, 100, 100)
      const third = tap(target, 100, 100)
      expect(third.preventDefault).not.toHaveBeenCalled()
    })

    it('ignores a touchend carrying no touch', () => {
      const target = spyTarget()
      lockViewportZoom(target)
      const handler = target.added.find((a) => a.type === 'touchend')!.fn
      expect(() => handler({ changedTouches: [] } as unknown as TouchEvent)).not.toThrow()
    })
  })
})
