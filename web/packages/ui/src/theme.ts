export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'studio.theme'

/** Which palette a surface wears. See `docs/design/decisions.md`. */
export type Surface = 'inward' | 'outward'

/**
 * The `--ground` value per theme, so a manifest and a meta tag cannot drift from
 * the CSS. Task 8's manifests read this rather than repeating the literal.
 *
 * **Per surface as well as per theme.** Outward-facing surfaces wear the club's brand and
 * their ground is a different colour, so one record could only ever have been right for
 * two of the three apps — and the half it got wrong is the half nobody looks at in a
 * browser tab: the status bar of an installed PWA and the splash screen behind it.
 *
 * `tokens.audit.test.ts` asserts these four against the stylesheet's own `--ground`
 * declarations, which is what makes the "cannot drift" in the first paragraph true rather
 * than aspirational.
 */
export const GROUND_COLOR: Record<Surface, Record<ResolvedTheme, string>> = {
  inward: {
    light: '#f7f5f1',
    dark: '#141311',
  },
  outward: {
    light: '#fcf9f8',
    dark: '#141519',
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
  return element?.dataset.surface === 'outward' ? 'outward' : 'inward'
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
