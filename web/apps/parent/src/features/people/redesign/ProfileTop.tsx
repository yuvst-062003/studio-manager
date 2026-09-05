// Ported from ProfileScreen.tsx (lines 208-470): the header, APP PREFERENCES (language +
// theme), the quick-contact button, and ACCOUNT & BILLING. See types.ts's header comment for
// the three things the prototype does that this must not (a card-details modal, a printed
// national id, an invented season label).
import {
  ChevronLeft,
  CreditCard,
  Globe,
  Monitor,
  MessageCircle,
  Moon,
  Sliders,
  Sun,
  User,
} from 'lucide-react'
import type { ProfileBilling } from './types'
import { PROFILE, fill } from './content'

const THEME_OPTIONS = ['light', 'dark', 'system'] as const


/* ── The page, taken apart ────────────────────────────────────────────────────────────
 *
 * This file used to export ONE `ProfileTop` holding the header, the preferences, the
 * contact button and the billing block in that order. Owner review, 2026-09-06, reordered
 * the whole screen — attendance to the top, language and brightness to the bottom, contact
 * last of all — and a single component cannot be reordered from outside.
 *
 * So each block is its own export and `ProfileScreen` composes them. The markup inside each
 * is unchanged; only the seams are new.
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

export function ProfileContactCta({ onOpenContact }: { onOpenContact: () => void }) {
  return (
    <div className="flex flex-col space-y-4 text-start">
      {/* Quick Contact Button */}
      <button
        type="button"
        data-testid="profile-contact"
        onClick={onOpenContact}
        className="w-full flex items-center justify-between p-3.5 bg-gradient-to-r from-blue-900 via-[#001849] to-blue-950 dark:from-blue-950 dark:via-slate-900 dark:to-blue-950 text-white rounded-3xl shadow-md hover:shadow-lg active:scale-98 transition-all cursor-pointer group border border-blue-800/40"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/15 dark:bg-blue-600/30 flex items-center justify-center text-white shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div className="text-start">
            <div className="text-sm font-bold">{PROFILE.contactCta}</div>
            <div className="text-[11px] text-blue-200 dark:text-blue-300">{PROFILE.contactSub}</div>
          </div>
        </div>
        <ChevronLeft
          className="w-5 h-5 text-blue-200 group-hover:scale-110 transition-transform"
          aria-hidden="true"
        />
      </button>

    </div>
  )
}

export function ProfileBillingBlock({
  billing,
  money,
}: {
  billing: ProfileBilling | null
  money: (agorot: number) => string
}) {
  const openChargeLabel = (count: number) =>
    count === 1 ? PROFILE.openChargeOne : fill(PROFILE.openCharges, { count })

  return (
    <div className="flex flex-col space-y-4 text-start">
      {/* Account & Billing */}
      <section
        aria-labelledby="profile-billing-heading"
        data-testid="profile-billing"
        className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-100 dark:border-slate-800 shadow-xs space-y-3 text-start transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
            <CreditCard className="w-4 h-4 text-[#0056c5] dark:text-blue-400" />
            <span id="profile-billing-heading">{PROFILE.billingTitle}</span>
          </div>
          {billing !== null && billing.balanceAgorot <= 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{PROFILE.balanceSettled}</span>
            </span>
          )}
        </div>

        {billing === null ? (
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
            {PROFILE.loading}
          </div>
        ) : (
          <>
            {/* Totals — always shown, regardless of balance state */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="text-start">
                <div className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                  {money(billing.chargedAgorot)}
                </div>
                <div className="text-[10px] text-slate-400">{PROFILE.chargedTotal}</div>
              </div>
              <div className="text-end">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {PROFILE.paidTotal}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {money(billing.paidAgorot)}
                </div>
              </div>
            </div>

            {/* Payment method — a link to the real payment setup, never a card form here */}
            <a
              href="#/payments"
              data-testid="profile-method"
              className="w-full flex items-center justify-between p-3 bg-blue-50/60 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded-2xl text-start transition-all group active:scale-98 cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#0056c5] dark:bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div className="text-start">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {billing.methodLabel ?? PROFILE.paymentMethodNone}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {PROFILE.paymentMethod}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-[#0056c5] dark:text-blue-400">
                <span>{PROFILE.paymentMethodUpdate}</span>
                <ChevronLeft
                  className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                  aria-hidden="true"
                />
              </div>
            </a>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1">
              {PROFILE.paymentMethodHint}
            </p>

            {/* Owed state — no card form, just the balance and a link to the real payment page */}
            {billing.balanceAgorot > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl flex items-center justify-between">
                <a
                  href="#/payments"
                  data-testid="profile-pay"
                  className="px-3 py-1.5 bg-[#ba1a1a] hover:bg-red-800 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  {PROFILE.payNow}
                </a>
                <div className="text-end">
                  <div className="text-xs font-bold text-red-950 dark:text-red-200">
                    {PROFILE.balanceOwed} · {money(billing.balanceAgorot)}
                  </div>
                  <div className="text-[10px] text-red-700 dark:text-red-300">
                    {openChargeLabel(billing.openChargeCount)}
                  </div>
                </div>
              </div>
            )}

            <a
              href="#/payments/history"
              data-testid="profile-history"
              className="w-full flex items-center justify-center gap-1 py-2 text-xs font-bold text-[#0056c5] dark:text-blue-400 hover:underline"
            >
              {PROFILE.paymentHistory}
            </a>
          </>
        )}
      </section>
    </div>
  )
}
