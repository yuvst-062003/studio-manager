// How a new build reaches a running PWA (update pass 2026-08-27).
//
// The service worker downloads every update in the background on its own; what this
// module decides is WHEN the downloaded version takes over. Two rules:
//
// * **At launch, silently.** If the new version is already waiting when the app opens
//   (or is found within the first seconds, before anyone has done anything), it is
//   applied immediately — the user just sees the current build, which is the whole
//   point. Unsynced offline work is safe across this reload: pending_ops live in
//   IndexedDB, and what §10.6's 'never reload underneath a coach' rule protects is
//   in-flight SCREEN state, which at launch does not exist yet.
//
// * **Mid-session, by invitation.** After the grace window the update becomes a toast
//   (UpdateToast) and nothing moves until the user taps it. A coach halfway through a
//   roster keeps their screen; the update lands on the next launch at the latest.
//
// Each app's registerSW.ts feeds this from `virtual:pwa-register` — that import is
// per-app (each app has its own service worker), so the policy lives here and the
// wiring stays in the app.

/** Same declared-in-both-packages contract style as core's ACT_AS_EVENT: the apps
 *  dispatch (via onSwUpdateReady) and UpdateToast listens. */
export const SW_UPDATE_EVENT = 'studio:sw-update-ready'

/** How long after launch an update may still apply itself without asking. */
export const SW_LAUNCH_GRACE_MS = 3_000

/** How often a long-running session re-asks the server whether a new build exists.
 *  Without this, an app that is never fully closed never even downloads one. */
export const SW_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1_000

export type SwUpdateDetail = { apply: () => void }

/**
 * Called by an app's registerSW.ts when a new service worker is downloaded and
 * waiting. `apply` must activate it and reload the page (vite-plugin-pwa's
 * `updateSW(true)`); `sinceLaunchMs` is how old this page is.
 */
export function onSwUpdateReady(apply: () => void, sinceLaunchMs: number): void {
  if (sinceLaunchMs <= SW_LAUNCH_GRACE_MS) {
    apply()
    return
  }
  globalThis.dispatchEvent(
    new CustomEvent<SwUpdateDetail>(SW_UPDATE_EVENT, { detail: { apply } }),
  )
}
