// One scroll position per screen, the way a native tab bar keeps one per tab.
//
// **The behaviour this replaces.** Hash navigation does not move the page: a link to
// `#/shop` names no element, so the browser leaves the scroll offset exactly where it was
// and React swaps the content underneath it. Verified rather than assumed (2026-09-06,
// emulated iPhone: 1500px before the tab tap, 1500px after). So scrolling halfway down
// בית and tapping חנות landed the reader in the middle of the shop, and going back to בית
// started them at the top of a list they had already read. Both halves are wrong, and they
// are the same missing mechanism.
//
// **Keyed on the hash, not on a tab.** A student card and the payments history are screens
// too, and each deserves its own position — "the four tabs remember" would be a rule with
// arbitrary edges. `#/` and `#/shop` are simply two keys.
//
// **Nothing is persisted.** The map lives as long as the shell. A position restored from a
// previous session would point into a list that has since changed, which is worse than the
// top of the page.
//
// **In @studio/core, beside `lockViewportZoom`, and for the same reason** (moved here
// 2026-09-07): both phone apps route on `location.hash` and both had the identical hole,
// and the staff app's is the worse of the two — a coach scrolls a register of thirty
// children, taps טיימר to start a round, and comes back to the top of a list they were
// halfway through marking. The dashboard does not import it: it is the manager's desktop
// tool and the browser already restores its scroll on a real page navigation.
import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * How long a restore keeps trying, in frames (~500ms at 60Hz).
 *
 * A restore is attempted the instant the new screen commits, when its list is usually still
 * in flight — the page is a few hundred pixels tall and the browser clamps the offset to
 * what exists. So the offset is re-applied while the content arrives. The window is bounded
 * because the alternative — waiting for a height that never comes — is a page that yanks
 * itself down a second after the reader started reading it.
 */
const RESTORE_FRAMES = 30

/** The events that mean the reader has taken over. A restore in progress gives way. */
const READER_MOVED = ['wheel', 'touchstart', 'keydown'] as const

export function useScrollMemory(hash: string): void {
  const positions = useRef(new Map<string, number>())
  /** The screen the recorder is currently attributing scroll to. */
  const recording = useRef(hash)

  useEffect(() => {
    let frame = 0
    const record = () => {
      // The guard that makes the recorder safe. Between the hash changing and the restore
      // below running, the browser can clamp the offset and dispatch a scroll event — and
      // recording that would overwrite the OUTGOING screen's position with a number from
      // the incoming one. Comparing against the live hash rather than against a flag we
      // set ourselves means the guard is reading the same truth the router is.
      if (globalThis.location.hash !== recording.current) return
      positions.current.set(recording.current, globalThis.scrollY)
    }
    const onScroll = () => {
      // One write per frame. `scroll` fires far faster than anything needs to read this.
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        record()
      })
    }
    globalThis.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      globalThis.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  // Layout effect, not effect: this runs after the DOM is updated and before the browser
  // paints, so the reader never sees the new screen at the old offset first.
  useLayoutEffect(() => {
    recording.current = hash
    const target = positions.current.get(hash) ?? 0

    // `!==` rather than an unconditional call: jsdom implements scrollTo as a warning, and
    // a hook that logged "Not implemented" on every navigation in every test would train
    // people to ignore the test output.
    if (globalThis.scrollY !== target) globalThis.scrollTo(0, target)
    if (target === 0) return undefined

    let frames = 0
    let raf = 0
    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(raf)
      for (const event of READER_MOVED) globalThis.removeEventListener(event, stop)
    }
    const attempt = () => {
      if (stopped) return
      if (globalThis.scrollY < target) globalThis.scrollTo(0, target)
      frames += 1
      if (globalThis.scrollY >= target || frames >= RESTORE_FRAMES) {
        stop()
        return
      }
      raf = requestAnimationFrame(attempt)
    }
    raf = requestAnimationFrame(attempt)
    for (const event of READER_MOVED) globalThis.addEventListener(event, stop, { passive: true })
    return stop
  }, [hash])
}
