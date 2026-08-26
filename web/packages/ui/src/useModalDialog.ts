import { useCallback, useEffect, useRef } from 'react'

/**
 * Can this element actually take focus, given where it sits.
 *
 * A hidden element is still in the DOM and still matches the tabbable selector, so focusing
 * one silently does nothing — which a user reads as Tab being broken.
 *
 * **Not `offsetParent === null`, which is the usual shorthand.** jsdom performs no layout,
 * so `offsetParent` is `null` for every element in it: that test excludes the entire dialog
 * under test and makes the trap untestable while looking correct. It cost this hook a full
 * round of red tests. Walking `display`/`visibility`/`hidden` up to the dialog root is
 * slightly more work and is true in a real browser AND in the test environment, which is the
 * only combination worth having.
 */
function isFocusable(element: HTMLElement, root: HTMLElement): boolean {
  let node: HTMLElement | null = element
  while (node) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false
    const style = globalThis.getComputedStyle?.(node)
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false
    if (node === root) break
    node = node.parentElement
  }
  return true
}

/**
 * Make a `role="dialog"` element behave like the modal it claims to be.
 *
 * **`aria-modal="true"` is a promise, not a behaviour.** It tells assistive technology that
 * everything outside the dialog is unavailable. The browser does nothing to make that true —
 * so a dialog that sets the attribute and stops there tells a screen-reader user the page is
 * inert while a sighted keyboard user can still Tab straight through it into the form behind.
 * Both users are then acting on a description of the page that does not match the page.
 *
 * The four sites this was written for had the same three gaps between them: focus never
 * entered the dialog (so a screen reader stayed on the now-hidden trigger and announced
 * nothing), Tab was never trapped, and Escape did nothing. Two of them wrapped irreversible
 * bulk writes — a group belt promotion and an exam-result save.
 *
 * ── What it does ─────────────────────────────────────────────────────────────────────
 * 1. **Remembers what was focused** before the dialog opened, and restores it on close.
 *    Without this, dismissing a dialog drops focus to `<body>` and a keyboard user restarts
 *    from the top of the document — which on a dashboard screen is a long way back.
 * 2. **Moves focus into the dialog**, to its first tabbable child, or to the dialog itself
 *    when it has none. The container therefore needs `tabIndex={-1}`.
 * 3. **Traps Tab and Shift+Tab** at the ends, cycling within the dialog.
 * 4. **Closes on Escape** — SC 2.1.2, and the thing people try first.
 *
 * ── What it deliberately does NOT do ─────────────────────────────────────────────────
 * It does not set `inert` or `aria-hidden` on the rest of the document. Both are global
 * mutations that leak if two dialogs ever overlap or if a render throws between open and
 * close, and the failure mode is a permanently unreachable page. The trap above gives
 * keyboard users the same guarantee without touching anything it does not own.
 *
 * @param open   whether the dialog is currently rendered
 * @param onClose called on Escape. Stable identity is not required.
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  // Held in a ref so changing the handler between renders never re-runs the key-listener
  // effect. Callers pass an inline arrow — `() => setOpen(false)` — which is a new identity
  // every render, and an effect keyed on it would tear down and re-add the listener
  // constantly.
  //
  // Written in an effect rather than during render: a ref mutation during render is a side
  // effect React may run twice under StrictMode, and `react-hooks/refs` refuses it.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  const tabbables = useCallback((): HTMLElement[] => {
    const root = dialogRef.current
    if (!root) return []
    const candidates = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    return [...candidates].filter((element) => isFocusable(element, root))
  }, [])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    restoreTo.current = previous instanceof HTMLElement ? previous : null

    const first = tabbables()[0]
    ;(first ?? dialogRef.current)?.focus()

    return () => {
      // Guarded: the trigger may have been unmounted by the very action the dialog
      // confirmed, and focusing a detached node throws in some engines and no-ops in others.
      const target = restoreTo.current
      if (target?.isConnected) target.focus()
    }
  }, [open, tabbables])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = tabbables()
      if (focusable.length === 0) {
        // Nothing to move to, so Tab must not escape the dialog either.
        event.preventDefault()
        return
      }
      // `at()` and an explicit guard rather than `focusable[0]!`: the array is non-empty by
      // the check above, but `noUncheckedIndexedAccess` is on and a non-null assertion here
      // would be the one place this file asks to be trusted rather than checked.
      const first = focusable.at(0)
      const last = focusable.at(-1)
      if (!first || !last) return
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, tabbables])

  return dialogRef
}
