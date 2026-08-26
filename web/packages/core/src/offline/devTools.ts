// §19.4's `📴 offline` and `🐌 slow` toggles — the *mechanism*, not the buttons.
//
// The buttons are a `registerSlot('dev-bar', …)` file in the staff app, because
// `@studio/ui` must not depend on `@studio/core` (`apps/staff/src/App.tsx` states that rule
// where it passes `apiFetch` into the wizard). What lives here is the one thing the toggles
// need and nothing else can provide: a module-level override the network monitor consults
// before it believes its own probes.
//
// **An override rather than a fake fetch.** §19.5 wants the dev bar to exercise the real
// code path, and monkey-patching `fetch` would exercise a different one — the app would be
// genuinely offline rather than *behaving as if* it were, so a bug in `reduce` would be
// invisible because no probe ever ran. Forcing the mode leaves every transition, every
// queue write and every flush exactly where they are.
//
// §19.6's restrictions apply: this shifts what the CLIENT believes, never what the server
// does. There is no request it can make the server treat differently.
import type { NetworkMode } from './types'

let forced: NetworkMode | null = null

const listeners = new Set<(mode: NetworkMode | null) => void>()

/** Pin the client's network mode, or `null` to hand control back to the probes. */
export function setForcedMode(mode: NetworkMode | null): void {
  if (mode === forced) return
  forced = mode
  for (const listener of listeners) listener(forced)
}

export function forcedMode(): NetworkMode | null {
  return forced
}

/** So the dev bar's own buttons can render their pressed state without polling. */
export function onForcedModeChange(listener: (mode: NetworkMode | null) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
