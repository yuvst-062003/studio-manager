// Pull down at the top of a screen to reload — the gesture every native app has and a web
// page does not (owner request, 2026-09-07).
//
// **Why it has to be built rather than enabled.** Chrome's own pull-to-refresh only exists
// in a browser tab, never in an installed PWA, and iOS has never had one at all. So the
// parent app's most-used device — an installed app on an iPhone — has no way to say "get me
// today's data" short of closing and reopening it. (`overscroll-behavior: none` in
// app-viewport.css also switches Chrome's off deliberately, because the frame bouncing is
// the thing that reads as a web page; this replaces it with the part worth keeping.)
//
// **It reloads the document.** Not a per-screen re-fetch: this shell holds a dozen
// independent reads across five tabs, and a refresh that quietly missed one would be worse
// than none — the parent would be looking at a stale number believing they had just asked
// for it. `location.reload()` re-runs every one of them, and against a precached shell it
// costs a few hundred milliseconds.
//
// **Touch only.** A mouse or keyboard already has a reload; this exists for the finger.
import { useEffect, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { backgroundScrollLocked } from '../onboarding/wizard/useDialog'

/** How far the finger must travel before the pull commits, in real pixels of movement. */
const THRESHOLD = 72
/** The indicator stops following the finger here, so a long drag does not push it down the
 *  screen. Native bars do the same, and it makes "it is not going any further" legible. */
const MAX_PULL = 96
/** Below this the gesture is not yet a pull — it is a tap, or the start of a horizontal
 *  swipe on the children strip, and claiming it early makes both feel broken. */
const SLOP = 10

export function PullToRefresh({
  locale,
  onRefresh,
}: {
  locale: Locale
  /** Overridable so a test never actually reloads the runner. */
  onRefresh?: () => void
}) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)
  const refreshRef = useRef(onRefresh)
  // Synced from an effect, not during render: `useDialog`'s header explains the same rule
  // and `react-hooks/refs` enforces it. A render can happen for a commit that never lands,
  // and a ref written there leaks into the wrong one.
  useEffect(() => {
    refreshRef.current = onRefresh
  })

  useEffect(() => {
    // Touch devices only. `matchMedia` and not a UA sniff, and read once: a mouse does not
    // grow a finger mid-session.
    if (!globalThis.matchMedia?.('(pointer: coarse)').matches) return undefined

    let startY: number | null = null
    let startX = 0
    let committed = false
    /** Real finger travel, which is what THRESHOLD is expressed in. */
    let pulled = 0
    let frame = 0

    const paint = (value: number) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setPull(value)
      })
    }

    const reset = () => {
      startY = null
      committed = false
      pulled = 0
    }

    const onStart = (event: TouchEvent) => {
      // One finger, at the very top, with no dialog holding the page. A sheet's own scroll
      // starts at zero too, and arming a reload behind an open sheet is how a parent loses
      // a half-filled form.
      if (refreshingRef.current || event.touches.length !== 1) return reset()
      if (globalThis.scrollY > 0 || backgroundScrollLocked()) return reset()
      startY = event.touches[0]!.clientY
      startX = event.touches[0]!.clientX
      committed = false
    }

    const onMove = (event: TouchEvent) => {
      if (startY === null || refreshingRef.current) return
      const touch = event.touches[0]
      if (!touch) return
      const dy = touch.clientY - startY
      const dx = Math.abs(touch.clientX - startX)

      if (!committed) {
        if (dy < SLOP) return
        // The children strip and the week strip both scroll sideways across the top of
        // בית. A drag that is more across than down belongs to them.
        if (dx > dy) return reset()
        committed = true
      }

      // The page may have scrolled under the finger between frames.
      if (globalThis.scrollY > 0) {
        paint(0)
        return reset()
      }

      // Non-passive, so this is allowed: it stops the browser treating the same drag as a
      // scroll and fighting the indicator.
      event.preventDefault()
      // Halved, so the indicator lags the finger. That resistance is what tells a thumb it
      // is pulling against something rather than dragging a loose element.
      pulled = dy
      paint(Math.min(MAX_PULL, dy / 2))
    }

    const onEnd = () => {
      if (committed && pulled >= THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        setPull(MAX_PULL / 2)
        // `?? reload` at call time, not at mount: a test swaps the prop in.
        ;(refreshRef.current ?? (() => globalThis.location.reload()))()
      } else {
        paint(0)
      }
      reset()
    }

    globalThis.addEventListener('touchstart', onStart, { passive: true })
    globalThis.addEventListener('touchmove', onMove, { passive: false })
    globalThis.addEventListener('touchend', onEnd, { passive: true })
    globalThis.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      globalThis.removeEventListener('touchstart', onStart)
      globalThis.removeEventListener('touchmove', onMove)
      globalThis.removeEventListener('touchend', onEnd)
      globalThis.removeEventListener('touchcancel', onEnd)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  if (pull <= 0 && !refreshing) return null

  const ready = refreshing || pull >= THRESHOLD / 2 // `pull` is the halved, visual offset
  return (
    <div
      data-testid="pull-to-refresh"
      data-ready={ready || undefined}
      aria-hidden={!refreshing}
      className="tw-scope fixed inset-inline-0 top-0 z-50 flex justify-center pointer-events-none"
      style={{ transform: `translateY(${pull}px)`, transition: refreshing ? 'transform 150ms' : 'none' }}
    >
      <div
        role="status"
        aria-live="polite"
        className="mt-2 w-9 h-9 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-md flex items-center justify-center"
      >
        <RotateCw
          className={`w-4 h-4 ${ready ? 'text-[#0056c5] dark:text-blue-300' : 'text-slate-400'} ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }}
          aria-hidden="true"
        />
        <span className="studio-visually-hidden">
          {t(locale, refreshing ? 'common.pull.refreshing' : 'common.pull.label')}
        </span>
      </div>
    </div>
  )
}
