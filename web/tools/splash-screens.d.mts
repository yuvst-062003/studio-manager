// Types for splash-screens.mjs, which is plain JavaScript so that a bare `node` script and
// the Vite config can both import it. Hand-written rather than generated: the module is
// small, and the alternative — an `@ts-expect-error` at every import — silences real errors
// at those call sites too.

export type SplashScreen = {
  readonly width: number
  readonly height: number
  readonly ratio: number
  readonly note: string
}

export type SplashScheme = 'light' | 'dark'

export declare const SPLASH_SCREENS: readonly SplashScreen[]
export declare const SPLASH_SCHEMES: readonly SplashScheme[]
export declare const SPLASH_DIR: string

export declare function splashFile(screen: SplashScreen, scheme: SplashScheme): string
export declare function splashMedia(screen: SplashScreen, scheme: SplashScheme): string
export declare function splashLinks(): { href: string; media: string }[]
/** A Vite plugin. Typed loosely so this file need not depend on Vite's types. */
export declare function splashLinksPlugin(): { name: string; transformIndexHtml: () => unknown[] }
