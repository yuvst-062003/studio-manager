// One signal that says "re-read everything on screen", and the hook a loader subscribes
// with (owner, 2026-09-08).
//
// **What this replaces, and why the old answer was defensible.** Pull-to-refresh called
// `location.reload()`. `PullToRefresh.tsx` argued for it in as many words: the shell holds a
// dozen independent reads across five tabs, and "a refresh that quietly missed one would be
// worse than none — the parent would be looking at a stale number believing they had just
// asked for it". A document reload cannot miss one, so it was the safe choice.
//
// It is also a document reload. The app restarts: the launch screen, the default tab, the
// top of the list — "it regenerates the screen from the start", which is the report this
// module exists to answer. A refresh is supposed to update what you are looking at, not
// take it away and rebuild it around you.
//
// **So the missed-read risk has to be handled by construction rather than by reloading.**
// Two things do that, and neither is optional:
//
//   * `useRefreshSignal()` returns a number that changes on every request. A loader adds it
//     to the dependency array of the effect it already has — there is no second code path
//     to keep in step with the first, and a loader cannot subscribe "partly".
//   * `tools/__tests__/refresh-coverage.test.ts` fails when a screen-level loader does not
//     use it. A read that silently opts out is exactly the failure the old comment feared,
//     so it is a build error rather than a convention.
//
// **A loader must not blank its own data to refresh it.** The point of the change is that
// the screen stays on screen with a spinner over it; a loader that sets its state to `null`
// first reproduces the very flash this replaces, one screen at a time.
import { useSyncExternalStore } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()

/** Bumped once per request. Module-level so a listener that mounts late still sees that a
 *  refresh has happened rather than starting from a private zero. */
let generation = 0

/**
 * Ask every subscribed loader to re-read. Safe to call from anywhere, including outside
 * React — the pull gesture handler is a DOM listener, not a component.
 *
 * Returns the generation it published, so a caller that wants to know when the round has
 * settled has something to compare against.
 */
export function requestRefresh(): number {
  generation += 1
  // A copy, because a listener is allowed to unsubscribe while being notified — removing
  // from the live Set mid-iteration would skip the next listener in it.
  for (const listener of [...listeners]) listener()
  return generation
}

/** For tests and for anything that needs the current value without subscribing. */
export function refreshGeneration(): number {
  return generation
}

/**
 * The number to put in a loader's dependency array.
 *
 * ```ts
 * const refreshSignal = useRefreshSignal()
 * useEffect(() => { void load() }, [client, refreshSignal])
 * ```
 *
 * Deliberately a number and not a callback: a callback has to be wired to something, and
 * wiring is what gets forgotten. A value in the dependency array cannot be half-connected.
 */
export function useRefreshSignal(): number {
  // `useSyncExternalStore` and not `useState` + an effect. This is exactly the problem it
  // exists for — a value that lives outside React and changes without React's knowledge —
  // and it settles two things a hand-rolled subscription gets wrong. A refresh published
  // between render and the subscribing effect is not missed, because React re-reads the
  // snapshot after subscribing; and no state is set from inside an effect, which is what
  // `react-hooks/set-state-in-effect` refuses and is right to.
  return useSyncExternalStore(subscribe, refreshGeneration, refreshGeneration)
}

/** The store half of the hook above. Returns its own unsubscribe, as the API requires. */
function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
