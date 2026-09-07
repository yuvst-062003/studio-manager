// The modal mechanics the prototype has none of, written once so all four of step 1's
// popups get them: focus trap, Escape, focus restore, background scroll lock.
//
// §14.3 -- the prototype's modals are a positioned <div> with a backdrop click handler and
// nothing else. Porting the markup means porting the responsibility that @studio/ui was
// carrying for the rest of this app.
import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// -- the background scroll lock, counted rather than snapshotted --------------------
//
// **Reported from staging 2026-09-07: "on the home I can't scroll down or up".**
//
// Each dialog used to save `body.style.overflow` on the way in and write it back on the
// way out. That is correct for one dialog and wrong for two, and `ShopScreen` runs two of
// these hooks in one component — the product customiser and the cart. Open the customiser
// (saves ''), open the cart (saves 'hidden'), then close the CUSTOMISER first: it restores
// '' underneath an open cart, and when the cart finally closes it writes back the 'hidden'
// it captured — onto a page with no dialog on it. The lock is an inline style and this is
// a single-page app, so nothing ever cleared it: the parent left the shop and בית would
// not move for the rest of the session.
//
// A depth count has no ordering to get wrong. The first dialog in locks and the last one
// out unlocks, whichever they happen to be — and the value restored is the one from before
// ANY dialog opened, captured once.
let lockDepth = 0
let overflowBeforeAnyDialog = ''

/** Locks background scrolling and returns the release. Calling the release twice is a
 *  no-op: React runs an effect cleanup exactly once, but a hook that could double-release
 *  would drive the count negative and unlock while a dialog is still open. */
function lockBackgroundScroll(): () => void {
  if (lockDepth === 0) {
    overflowBeforeAnyDialog = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockDepth += 1

  let released = false
  return () => {
    if (released) return
    released = true
    lockDepth -= 1
    if (lockDepth === 0) document.body.style.overflow = overflowBeforeAnyDialog
  }
}

export function useDialog(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  //: Where focus was before the dialog opened, so it can be put back. A dialog that
  //: closes and drops focus to <body> strands a keyboard user at the top of the page.
  const restoreTo = useRef<HTMLElement | null>(null)

  //: `onClose` is not always stable -- `StudentFormSheet.requestClose` is a `useCallback`
  //: keyed on `dirty`, which flips on the first keystroke into a fresh add form. If the
  //: effect below depended on `onClose` directly, that flip re-ran it: the cleanup fired
  //: (restoring focus to whatever was active a moment ago) and the new run re-focused the
  //: panel, stealing focus from the field the parent was mid-word in and re-capturing
  //: `restoreTo` to the input instead of whatever opened the dialog. Reading through a ref
  //: at event time means the effect only cares about `isOpen`, so a caller re-rendering
  //: with a new handler identity every keystroke can no longer tear the dialog down.
  //:
  //: The ref is synced from an effect rather than during render -- render can run more
  //: than once for a commit that never happens, and a ref mutated there would leak into
  //: the wrong one.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!isOpen) return

    restoreTo.current = document.activeElement as HTMLElement | null

    const releaseScroll = lockBackgroundScroll()

    //: Focus the dialog itself rather than its first control: the reader should hear the
    //: title before the close button, and `tabIndex={-1}` on the panel makes that possible
    //: without adding it to the tab order.
    dialogRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const panel = dialogRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      )
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement

      // Wrapping both ways is what makes it a trap rather than a suggestion.
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      releaseScroll()
      restoreTo.current?.focus?.()
    }
  }, [isOpen])

  return dialogRef
}
