// The exit gate of W6 is "every artboard passes in Hebrew AND English, light AND dark".
// Half of that sentence was unreachable: the locale lived in React state and never reached
// `<html>`, so English rendered inside an RTL document with `lang="he"` still on the root.
//
// These are the assertions that keep it reachable. They test the DOCUMENT, not a wrapper —
// native form controls, the UA stylesheet's default text-align and every primitive's own
// he/en matrix (packages/ui/src/testing.tsx) all read the root and nothing else.
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentLocale } from './useDocumentLocale'

function Harness({ locale }: { locale: 'he' | 'en' | 'ru' }) {
  useDocumentLocale(locale)
  return null
}

describe('useDocumentLocale', () => {
  beforeEach(() => {
    // The literal every app's index.html ships. Starting from it rather than from a blank
    // root is the point: the bug was that this value never changed.
    document.documentElement.lang = 'he'
    document.documentElement.dir = 'rtl'
  })

  it('leaves Hebrew right-to-left', () => {
    render(<Harness locale="he" />)
    expect(document.documentElement.lang).toBe('he')
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('flips the document to left-to-right for English', () => {
    render(<Harness locale="en" />)
    expect(document.documentElement.dir).toBe('ltr')
    // `lang` matters as much as `dir` and is the half that is easy to forget: a screen
    // reader picks its voice and its pronunciation rules from it, so English announced as
    // `he` is read with Hebrew phonetics.
    expect(document.documentElement.lang).toBe('en')
  })

  it('flips for Russian too, which is the locale nobody tests by hand', () => {
    render(<Harness locale="ru" />)
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.documentElement.lang).toBe('ru')
  })

  it('follows a change of locale rather than only the first render', () => {
    // The language picker mutates state on an already-mounted tree. A hook that only ran on
    // mount would look correct in every test above and do nothing in the product.
    const view = render(<Harness locale="he" />)
    view.rerender(<Harness locale="en" />)
    expect(document.documentElement.dir).toBe('ltr')
    view.rerender(<Harness locale="he" />)
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('he')
  })
})
