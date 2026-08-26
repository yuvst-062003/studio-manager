import { useEffect } from 'react'
import { DIRECTION } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/**
 * Keep `<html lang>` and `<html dir>` in step with the locale the user chose.
 *
 * **The bug this closes was the whole RTL premise, quietly inverted.** All three apps hold
 * the locale in React state and hand it down as a prop, and `LanguagePicker` writes to that
 * state — but nothing ever wrote it back to the document. Each app's `index.html` ships
 * `<html lang="he" dir="rtl">` as a literal, so choosing English or Russian rendered LTR
 * copy inside an RTL document: punctuation drifted to the wrong end of a line, native
 * scrollbars and date pickers stayed mirrored, and a screen reader announced English words
 * with a Hebrew voice because `lang` still said `he`. WCAG 3.1.1 and 3.1.2, and the reason
 * W6's exit gate is phrased as "in Hebrew AND English".
 *
 * `LanguagePicker` already set `dir` on its own `<section>`, which is why this survived
 * review: the one screen anybody tested the language switch on looked right, and every
 * sibling under it — `SignIn`, `AppShell`, the whole app after login — did not.
 *
 * **Why the document and not a wrapper `<div dir>`.** Three things read the root and only
 * the root: the UA stylesheet's default `text-align`, native form controls, and
 * `document.documentElement.dir`, which is what `packages/ui/src/testing.tsx` asserts in
 * every primitive's `he`/`en` matrix. A wrapper would satisfy CSS and none of the rest.
 *
 * Idempotent and effect-based rather than render-time: writing to the DOM during render is
 * a side effect React may run twice under StrictMode, and this is a global.
 */
export function useDocumentLocale(locale: Locale): void {
  useEffect(() => {
    const root = globalThis.document?.documentElement
    if (!root) return
    root.lang = locale
    root.dir = DIRECTION[locale]
  }, [locale])
}
