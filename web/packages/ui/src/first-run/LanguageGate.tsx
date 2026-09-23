// §6.1 step 1, as the first thing anybody sees: the language gate.
//
// **Why a gate and not the existing controls.** `LanguagePicker` is an inline row of three
// chips and `LanguageButton` is a floating control — both are things you find if you are
// looking. Neither asks. So the default won: a parent opened the app, got Hebrew because
// `useState<Locale>('he')` said so, and went through the whole join wizard in a language
// they could not read, because nothing ever put the question. This puts the question, once.
//
// **The design decision that carries it: every word is on screen three times.** The welcome
// and the instruction are rendered in Hebrew, English and Russian simultaneously, read with
// an explicit locale rather than the active one. A greeting in a single language is
// unreadable to exactly the person the §6.1 ordering exists to protect, which would make
// this screen a decoration.
//
// **And it cannot be dismissed by missing.** No scrim click, no escape key. A tap-anywhere
// dismiss records "Hebrew" for someone who was reaching for the list — a wrong answer
// stored silently, which is worse than an unanswered question. The only way out is
// `Continue`, and `Continue` reports the locale that is on screen when it is pressed.
//
// Shape from a Stitch exploration (2026-09-15): tri-lingual welcome, full-width 56px rows
// rather than chips, an edge accent plus a check on the selected row, an explicit primary
// action, and a line saying the choice is not final. Colours and spacing are this app's own
// tokens rather than Stitch's palette.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { DIRECTION, LOCALES, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ENDONYM } from './LanguagePicker'

const scrim: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(8, 14, 26, 0.62)',
  display: 'grid',
  placeItems: 'center',
  padding: 'var(--space-4, 16px)',
  zIndex: 1000,
}

const card: CSSProperties = {
  width: 'min(100%, 380px)',
  maxHeight: '92dvh',
  overflowY: 'auto',
  background: 'var(--surface)',
  color: 'var(--fg)',
  borderRadius: 12,
  boxShadow: '0 18px 48px rgba(8, 14, 26, 0.28)',
  padding: '22px 20px 18px',
  //: The card is a focus TARGET (so a screen reader lands inside the dialog rather than
  //: behind the scrim), not a control. Its ring is drawn by the programmatic `.focus()`
  //: below and communicates nothing to a sighted user, so it is suppressed here — every
  //: actual control inside keeps its own `:focus-visible` ring.
  outline: 'none',
}

const greetRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  marginBottom: 16,
  textAlign: 'center',
}

const rowsWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  margin: '14px 0 16px',
  border: 0,
  padding: 0,
}

function rowStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 56,
    width: '100%',
    padding: '0 14px',
    cursor: 'pointer',
    background: active ? 'var(--ground)' : 'var(--surface)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    //: The edge accent is on the INLINE start, so it sits on the correct side in both
    //: directions without a second rule.
    borderInlineStartWidth: active ? 4 : 1,
    borderRadius: 10,
    font: 'inherit',
    fontSize: 17,
    fontWeight: active ? 700 : 500,
    color: 'inherit',
  }
}

const continueStyle: CSSProperties = {
  width: '100%',
  minHeight: 48,
  borderRadius: 10,
  border: 0,
  cursor: 'pointer',
  background: 'var(--accent, #003874)',
  color: 'var(--on-accent, #ffffff)',
  font: 'inherit',
  fontSize: 16,
  fontWeight: 700,
}

export function LanguageGate({
  locale,
  onChoose,
  onDone,
}: {
  locale: Locale
  /** Fires on every tap, so the screen re-renders in the tapped language at once — the
   *  parent sees the result before committing to it. */
  onChoose: (next: Locale) => void
  /** Fires only on Continue, with the locale showing at that moment. */
  onDone: (chosen: Locale) => void
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  //: One id per mount so two gates could never share a radio group.
  const [group] = useState(() => `language-gate-${Math.random().toString(36).slice(2, 8)}`)

  //: Focus moves into the dialog on open, or the reader's focus stays behind the scrim
  //: while `aria-modal` claims the page is inert.
  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  //: **No body-scroll lock here, and that is a decision rather than an omission.** One was
  //: added on 2026-09-15 and removed the same hour. It went in because the gate LOOKED
  //: clipped on the staff setup wizard at 414px; measuring it showed the scrim at x=0
  //: width=414 and the card centred at x=17 width=380, with `visualViewport.offsetLeft`
  //: zero — the offset was an artifact of capturing a screenshot of an RTL document that
  //: overflows to x=-88 (the wizard is ~502px wide at that viewport, which is a real but
  //: separate bug of its own). So the lock fixed nothing a user sees, and it broke the
  //: staff install-banner test by leaving `body.style.overflow` set across tests. A
  //: mitigation for a non-problem that costs a working test is a bad trade.

  return (
    <div style={scrim} data-testid="language-gate-scrim">
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${group}-title`}
        dir={DIRECTION[locale]}
        tabIndex={-1}
        style={card}
        data-testid="language-gate"
      >
        <div style={greetRow}>
          {/*: Read with an EXPLICIT locale, not the active one — see the module header. */}
          <span lang="he" dir="rtl" style={{ fontSize: 19, fontWeight: 700 }}>
            {t('he', 'common.language.gate.welcome')}
          </span>
          <span lang="en" dir="ltr" style={{ fontSize: 17, fontWeight: 600, opacity: 0.82 }}>
            {t('en', 'common.language.gate.welcome')}
          </span>
          <span lang="ru" dir="ltr" style={{ fontSize: 17, fontWeight: 600, opacity: 0.72 }}>
            {t('ru', 'common.language.gate.welcome')}
          </span>
        </div>

        <p
          id={`${group}-title`}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '2px 8px',
            margin: 0,
            fontSize: 13,
            opacity: 0.66,
          }}
        >
          <span lang="he" dir="rtl">
            {t('he', 'common.language.gate.choose')}
          </span>
          <span aria-hidden="true">·</span>
          <span lang="en" dir="ltr">
            {t('en', 'common.language.gate.choose')}
          </span>
          <span aria-hidden="true">·</span>
          <span lang="ru" dir="ltr">
            {t('ru', 'common.language.gate.choose')}
          </span>
        </p>

        {/*: `aria-label` rather than a visually-hidden <legend>: the instruction is already
            on screen three times above, and a fourth copy in the DOM is a duplicate a
            screen reader reads twice and a test cannot disambiguate. */}
        <fieldset style={rowsWrap} aria-label={t(locale, 'common.language.gate.choose')}>
          {LOCALES.map((option) => {
            const active = option === locale
            return (
              <label key={option} style={rowStyle(active)} lang={option} dir={DIRECTION[option]}>
                <input
                  type="radio"
                  name={group}
                  lang={option}
                  value={option}
                  checked={active}
                  onChange={() => onChoose(option)}
                  aria-label={ENDONYM[option]}
                  style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                />
                <span>{ENDONYM[option]}</span>
                <span aria-hidden="true" style={{ opacity: active ? 1 : 0.3, fontWeight: 700 }}>
                  {active ? '✓' : '›'}
                </span>
              </label>
            )
          })}
        </fieldset>

        <button
          type="button"
          style={continueStyle}
          onClick={() => onDone(locale)}
          data-testid="language-gate-continue"
        >
          {t(locale, 'common.language.gate.continue')}
        </button>

        <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 12, opacity: 0.6 }}>
          {t(locale, 'common.language.gate.later')}
        </p>
      </div>
    </div>
  )
}
