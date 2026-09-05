// Ported from ProfileScreen.tsx (lines 208-470): the header, APP PREFERENCES (language +
// theme), the quick-contact button, and ACCOUNT & BILLING. See types.ts's header comment for
// the three things the prototype does that this must not (a card-details modal, a printed
// national id, an invented season label).
import {
  Globe,
  Monitor,
  Moon,
  Sliders,
  Sun,
  User,
} from 'lucide-react'
import { PROFILE, fill } from './content'

const THEME_OPTIONS = ['light', 'dark', 'system'] as const


/* ── What is left of the stacked screen ───────────────────────────────────────────────
 *
 * This file exported ONE `ProfileTop` holding the header, the preferences, a contact button
 * and a billing block. Two owner reviews on 2026-09-06 took it apart: the first reordered
 * the screen, the second replaced the stack with a card of button-rows.
 *
 * TWO of the four survive, and they are the two the menu still renders — the header, which
 * is the only thing above the card, and the preferences, which the הגדרות sheet opens. The
 * billing block went with the review that rejected a charged-versus-paid summary in favour
 * of one sentence about coverage (`PaymentsSheet`), and the contact button became a menu
 * row. Both are deleted rather than kept for later: an unrendered component is where a
 * stale link hides, and `routes.reachable.test.ts` cannot tell the difference.
 */

export function ProfileHeader({ familyName }: { familyName: string | null }) {
  return (
    <div className="flex flex-col space-y-4 text-start">
      {/* Header */}
      <header className="flex items-center justify-between" data-testid="profile-header">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl bg-[#001849] dark:bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm"
            aria-hidden="true"
          >
            {familyName ? familyName.charAt(0) : <User className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
              {familyName !== null
                ? fill(PROFILE.familyTitle, { name: familyName })
                : PROFILE.familyTitleUnknown}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{PROFILE.familySubtitle}</p>
          </div>
        </div>
      </header>

    </div>
  )
}

export function ProfilePreferences({
  locale,
  locales,
  localeLabel,
  onChooseLocale,
  theme,
  onChooseTheme,
}: {
  locale: string
  locales: readonly string[]
  localeLabel: (code: string) => string
  onChooseLocale: (code: string) => void
  theme: 'light' | 'dark' | 'system'
  onChooseTheme: (next: 'light' | 'dark' | 'system') => void
}) {
  const themeActiveClass: Record<(typeof THEME_OPTIONS)[number], string> = {
    light: 'bg-white dark:bg-slate-700 text-amber-600 shadow-xs',
    dark: 'bg-slate-900 text-blue-300 shadow-xs border border-slate-700',
    system: 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs',
  }
  const themeIcons: Record<(typeof THEME_OPTIONS)[number], typeof Sun> = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  }
  const themeIconTint: Record<(typeof THEME_OPTIONS)[number], string> = {
    light: 'text-amber-500',
    dark: 'text-blue-400',
    system: 'text-indigo-400',
  }
  const themeLabels: Record<(typeof THEME_OPTIONS)[number], string> = {
    light: PROFILE.themeLight,
    dark: PROFILE.themeDark,
    system: PROFILE.themeAuto,
  }
  const ThemeIcon = themeIcons[theme]

  return (
    <div className="flex flex-col space-y-4 text-start">
      {/* ========================================================================= */}
      {/* APP PREFERENCES: language + theme, both single-choice, both real radios    */}
      {/* ========================================================================= */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-100 dark:border-slate-800 shadow-xs space-y-3.5 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
            <Sliders className="w-4 h-4 text-[#0056c5] dark:text-blue-400" />
            <span>{PROFILE.preferencesTitle}</span>
          </div>
        </div>

        {/* 1. Language Selector */}
        <fieldset className="space-y-1.5 m-0 border-0 p-0">
          <legend className="w-full flex items-center justify-between text-[11px] p-0">
            <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{PROFILE.languageLabel}</span>
            </span>
            {/* The language's OWN name, not its code. The theme legend beside it says
                "אוטומטי" — a word — and `HE` in a monospace face was the only machine-facing
                string on the screen. `lang` so a reader switches voice for "Русский". */}
            <span className="text-[10px] text-slate-400 font-medium" lang={locale}>
              {localeLabel(locale)}
            </span>
          </legend>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl">
            {locales.map((code) => {
              const active = code === locale
              return (
                <label
                  key={code}
                  data-testid={`profile-language-${code}`}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#0056c5] ${
                    active
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="profile-language"
                    value={code}
                    checked={active}
                    onChange={() => onChooseLocale(code)}
                    className="sr-only"
                  />
                  <span lang={code}>{localeLabel(code)}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* 2. Theme Mode Selector (light / dark / system) */}
        <fieldset className="space-y-1.5 pt-1 m-0 border-0 p-0 border-t border-slate-100 dark:border-slate-800/80">
          <legend className="w-full flex items-center justify-between text-[11px] p-0">
            <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <ThemeIcon className={`w-3.5 h-3.5 ${themeIconTint[theme]}`} />
              <span>{PROFILE.themeLabel}</span>
            </span>
            <span className="text-[10px] text-slate-400 capitalize">{themeLabels[theme]}</span>
          </legend>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl">
            {THEME_OPTIONS.map((mode) => {
              const active = theme === mode
              const Icon = themeIcons[mode]
              return (
                <label
                  key={mode}
                  data-testid={`profile-theme-${mode}`}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#0056c5] ${
                    active
                      ? themeActiveClass[mode]
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="profile-theme"
                    value={mode}
                    checked={active}
                    onChange={() => onChooseTheme(mode)}
                    className="sr-only"
                  />
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{themeLabels[mode]}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </section>
    </div>
  )
}

