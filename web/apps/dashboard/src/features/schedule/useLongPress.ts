import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** Long enough not to fire on a normal tap, short enough not to feel broken. */
export const LONG_PRESS_MS = 500

/** How far a finger may drift and still count as a press rather than a scroll. */
const SLOP_PX = 10

/**
 * A press held down, rather than a click.
 *
 * Picking a session up off the board is a **pointer** idiom, and it is deliberately not
 * built on the HTML5 drag-and-drop API: that API is unusable with a screen reader, does
 * not fire on touch at all without a polyfill, and would make the board's one destructive-
 * ish gesture the least accessible thing on the screen. Long-press-then-choose-a-slot
 * works with a mouse, a finger and a stylus, and leaves the popover's own date fields as
 * the keyboard path to the same PATCH.
 *
 * The timer is cancelled by movement past `SLOP_PX`, which is what keeps a scroll on a
 * tablet from being read as a press — a manager checking cover on a train would otherwise
 * pick up a class every time they flicked the grid.
 *
 * The returned `onClick` SWALLOWS the click that follows a long press — a pointerup is
 * followed by a click regardless of how long the button was held, so without this the
 * popover would open on top of the move the manager just started.
 *
 * It is a click handler and not a pointerup one on purpose: a keyboard Enter fires a click
 * with no pointer events at all, so routing the short press through `onClick` is what keeps
 * the block operable from the keyboard. `fired` can only be true after a real pointer
 * sequence, so the keyboard path always passes through.
 */
export function useLongPress({
  onLongPress,
  onClick,
  ms = LONG_PRESS_MS,
}: {
  onLongPress: () => void
  onClick?: () => void
  ms?: number
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const origin = useRef<{ x: number; y: number } | null>(null)

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      // Secondary buttons open the browser's own menu; a right-click is not a press.
      if (event.button !== 0 && event.pointerType === 'mouse') return
      fired.current = false
      origin.current = { x: event.clientX, y: event.clientY }
      clear()
      timer.current = setTimeout(() => {
        fired.current = true
        timer.current = null
        onLongPress()
      }, ms)
    },
    [clear, ms, onLongPress],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const from = origin.current
      if (!from || timer.current === null) return
      if (Math.abs(event.clientX - from.x) > SLOP_PX || Math.abs(event.clientY - from.y) > SLOP_PX) {
        clear()
      }
    },
    [clear],
  )

  const onPointerUp = useCallback(() => {
    clear()
    origin.current = null
  }, [clear])

  const handleClick = useCallback(() => {
    if (fired.current) {
      // The click that trails a long press. Swallow it once, then forget.
      fired.current = false
      return
    }
    onClick?.()
  }, [onClick])

  const onPointerLeave = useCallback(() => {
    clear()
    origin.current = null
  }, [clear])

  return {
    onClick: handleClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onPointerCancel: onPointerLeave,
  }
}
