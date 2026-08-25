// §6.1 step 1 — 'שפה: device locale → he / en / ru (BEFORE login — she may not read
// Hebrew)'.
//
// The ordering is the whole point and §6.1 states the reason outright: "language before
// login, because a Russian-speaking parent cannot read a Hebrew consent screen." A picker
// after sign-in would be a picker the person who needs it most cannot find.
import type { CSSProperties } from 'react'
import { DIRECTION, LOCALES, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const listStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
}

/** Each language named IN that language — someone who cannot read the current locale
 *  still has to recognise their own. */
const ENDONYM: Record<Locale, string> = {
  he: 'עברית',
  en: 'English',
  ru: 'Русский',
}

export function LanguagePicker({
  locale,
  onChoose,
}: {
  locale: Locale
  onChoose: (locale: Locale) => void
}) {
  return (
    <section aria-label={t(locale, 'common.language.title')} dir={DIRECTION[locale]}>
      <h2>{t(locale, 'common.language.title')}</h2>
      <div style={listStyle}>
        {LOCALES.map((option) => (
          <button
            key={option}
            type="button"
            lang={option}
            aria-pressed={option === locale}
            onClick={() => onChoose(option)}
          >
            {ENDONYM[option]}
          </button>
        ))}
      </div>
    </section>
  )
}
