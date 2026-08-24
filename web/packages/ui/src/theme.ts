export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'studio.theme'

/**
 * The `--ground` value per theme, so a manifest and a meta tag cannot drift from
 * the CSS. Task 8's manifests read this rather than repeating the literal.
 */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f7f5f1',
  dark: '#141311',
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
