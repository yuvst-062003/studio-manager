// §6.1 step 1's language choice, as ONE button rather than three.
//
// **Why this replaces `LanguagePicker` on the join route.** That component is a plain
// inline row of three buttons, and the join shell rendered it directly above `JoinWizard` —
// whose header is `position: fixed; top: 0` with a high stacking order. So it was painted
// underneath the header: present in the DOM, reachable by a screen reader, and invisible to
// everyone else. Reported 2026-09-12 as "I don't have an option to change language in the
// wizard", which was exactly right.
//
// A fixed button of its own is the fix, because the thing it has to survive is another
// element's `position: fixed` — no amount of ordering inside normal flow gets past that.
// `AccessibilityMenu` already had to solve the same problem and this deliberately mirrors
// it: same 44px circle, same scrim, same centred dialog. Two floating controls that look
// like one family, not two inventions.
//
// **It shows the current language rather than a globe.** A globe says "language settings
// live here"; `עב` says "you are reading Hebrew" as well, which is the more useful half for
// the person who opened the app and cannot read it.
import { useEffect, useRef, useState } from 'react'
import { LOCALES, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ENDONYM } from './LanguagePicker'

export function LanguageButton({
  locale,
  onChoose,
}: {
  locale: Locale
  onChoose: (next: Locale) => void
}) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  //: Focus moves INTO the dialog when it opens. Without it the reader's focus stays on the
  //: button behind the scrim — `aria-modal` tells a screen reader the page is inert while
  //: the keyboard says otherwise.
  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  //: Escape closes it, the one keyboard affordance a dialog may not omit.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className="studio-lang__fab"
        data-testid="language-open"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span aria-hidden="true">{t(locale, `common.language.short.${locale}`)}</span>
        <span className="studio-visually-hidden">{t(locale, 'common.language.button')}</span>
      </button>

      {open ? (
        <>
          <div
            className="studio-a11y__scrim"
            data-testid="language-scrim"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="language-title"
            className="studio-a11y__panel"
            data-testid="language-panel"
            ref={dialogRef}
            tabIndex={-1}
          >
            <h2 id="language-title" className="studio-a11y__title">
              {t(locale, 'common.language.title')}
            </h2>
            <div className="studio-lang__options">
              {LOCALES.map((option) => (
                <button
                  key={option}
                  type="button"
                  //: `aria-pressed` and not a radiogroup: each of these ACTS on press —
                  //: the app re-renders in that language — rather than staging a choice
                  //: some later button commits.
                  aria-pressed={option === locale}
                  className="studio-lang__option"
                  data-testid={`language-${option}`}
                  onClick={() => {
                    onChoose(option)
                    setOpen(false)
                  }}
                >
                  {/* Each language named IN that language: someone who cannot read the
                      current locale still has to recognise their own. */}
                  {ENDONYM[option]}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
