// Types for push-sw.mjs, which is plain JavaScript for the same reason splash-screens.mjs
// is: a bare `node` script and three Vite configs all import it. Hand-written rather than
// generated — the module is small, and the alternative (`@ts-expect-error` at every import)
// silences real errors at those call sites too.

/** Which app's hash router a notification's tap target is written against. */
export type PushApp = 'parent' | 'staff'

export type PushRouting = {
  /** Kind prefix → hash route. A route may name payload fields as `:student_id`. */
  readonly routes: Readonly<Record<string, string>>
  /** Where a tap goes when no route matches, or a named payload field is missing. */
  readonly fallback: string
}

export declare const PUSH_ROUTING: Readonly<Record<PushApp, PushRouting>>
export declare const PUSH_SW_FILENAME: string

/** The handler with `app`'s routing table prepended — the exact bytes the browser gets. */
export declare function pushServiceWorkerSource(app: PushApp): string

/** A Vite plugin. Typed loosely so this file need not depend on Vite's types. */
export declare function pushServiceWorkerPlugin(app: PushApp): {
  name: string
  apply: 'build'
  generateBundle: (this: unknown) => void
}
