// The modal mechanics the prototype has none of, written once so all four of step 1's
// popups get them: focus trap, Escape, focus restore, background scroll lock.
//
// §14.3 -- the prototype's modals are a positioned <div> with a backdrop click handler and
// nothing else. Porting the markup means porting the responsibility that @studio/ui was
// carrying for the rest of this app.
import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useDialog(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  //: Where focus was before the dialog opened, so it can be put back. A dialog that
  //: closes and drops focus to <body> strands a keyboard user at the top of the page.
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    restoreTo.current = document.activeElement as HTMLElement | null

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    //: Focus the dialog itself rather than its first control: the reader should hear the
    //: title before the close button, and `tabIndex={-1}` on the panel makes that possible
    //: without adding it to the tab order.
    dialogRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
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
      document.body.style.overflow = previousOverflow
      restoreTo.current?.focus?.()
    }
  }, [isOpen, onClose])

  return dialogRef
}
