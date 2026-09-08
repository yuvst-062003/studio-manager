export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'studio.theme'

/** Which palette a surface wears. See `docs/design/decisions.md`. */
export type Surface = 'inward' | 'outward' | 'staff'

/**
 * The `--ground` value per theme, so a manifest and a meta tag cannot drift from
 * the CSS. Task 8's manifests read this rather than repeating the literal.
 *
 * **Per surface as well as per theme.** A surface that re-values `--ground` needs its
 * own entry here, or one record could only ever have been right for the surfaces it
 * didn't cover — and the half it got wrong is the half nobody looks at in a browser
 * tab: the status bar of an installed PWA and the splash screen behind it. `staff`
 * exists because the staff app stopped sharing the dashboard's warm neutral palette and
 * needed a cool blue-grey one of its own; without an entry here the installed staff app
 * would open on the old warm splash and only turn blue once React mounts.
 *
 * `tokens.audit.test.ts` asserts these six against the stylesheet's own `--ground`
 * declarations, which is what makes the "cannot drift" in the first paragraph true rather
 * than aspirational.
 */
/** What the loading screen paints, per app.
 *
 * **Read by two things that must not disagree**: `first-run/splash.css`, which paints it in
 * the browser, and each app's `manifest.config.ts`, whose `background_color` is what the
 * OPERATING SYSTEM paints before a single line of JavaScript runs. When those two differed,
 * opening the installed app showed two loading screens in two colours, one after the other
 * — which is what the owner reported on 2026-09-08.
 *
 * CSS cannot import this file, so `splash.contract.test.ts` reads the stylesheet and asserts
 * the literals match. That test is the only thing keeping them together.
 */
export const SPLASH_GROUND = {
  parent: '#001849',
  staff: '#14306b',
  dashboard: '#101828',
} as const

export const GROUND_COLOR: Record<Surface, Record<ResolvedTheme, string>> = {
  inward: {
    light: '#f7f5f1',
    dark: '#141311',
  },
  outward: {
    light: '#fcf9f8',
    dark: '#141519',
  },
  staff: {
    light: '#f6f9fd',
    dark: '#090d16',
  },
}

/** The inward palette, kept under its original name for the two apps that wear it. */
export const THEME_COLOR: Record<ResolvedTheme, string> = GROUND_COLOR.inward

/**
 * Read off the same attribute that drives the CSS, rather than passed in. A prop would be
 * a second declaration of which surface this is, and the two would eventually disagree —
 * with the stylesheet winning silently, because it is the one you can see.
 */
export function surfaceOf(element: { dataset: DOMStringMap } | null | undefined): Surface {
  const surface = element?.dataset.surface
  if (surface === 'outward') return 'outward'
  if (surface === 'staff') return 'staff'
  return 'inward'
}

/**
 * D4 — three options. "System" follows the OS, which both iOS and Android already
 * schedule by hour, rather than duplicating a scheduler the user has configured.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}
