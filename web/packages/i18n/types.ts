export const LOCALES = ['he', 'en', 'ru'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * One namespace per feature vertical. Seam 3 of the parallel plan: a lane owns
 * `<locale>/<its vertical>.ts` in all three locales and nothing else, so two lanes
 * never touch the same file. A single he.ts would conflict on every wave.
 */
export const NAMESPACES = [
  'common', 'schedule', 'people', 'health',
  'attendance', 'billing', 'events', 'comms', 'reports',
] as const
export type Namespace = (typeof NAMESPACES)[number]

export type Bundle = Record<string, string>

/** SPEC §9 — Hebrew is RTL; English and Russian are LTR. */
export const DIRECTION: Record<Locale, 'rtl' | 'ltr'> = {
  he: 'rtl',
  en: 'ltr',
  ru: 'ltr',
}

/** Missing keys in en/ru fall back to he and are reported per-locale (SPEC §9). */
export const REFERENCE_LOCALE: Locale = 'he'
