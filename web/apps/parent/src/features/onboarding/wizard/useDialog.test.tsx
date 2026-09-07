// The bug this guards: `StudentFormSheet.requestClose` is a `useCallback` whose deps
// include `dirty`, which flips false -> true on the FIRST keystroke into a fresh add
// form. Before the fix, `useDialog`'s effect depended on `onClose` (`[isOpen, onClose]`),
// so a new `requestClose` identity re-ran the whole effect: the cleanup restored focus to
// whatever was active a moment ago and the new run called `dialogRef.current?.focus()`,
// stealing focus back from the field the parent is mid-word in. One character in, the
// input loses focus and every keystroke after the first is lost.
//
// The harness below mirrors that exactly: a NEW `onClose` identity every render (as
// `requestClose` gets whenever `dirty` changes), driven by real `userEvent.type` rather
// than `fireEvent.change`, because the bug only shows up character-by-character.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDialog } from './useDialog'

describe('useDialog', () => {
  it('keeps focus in an input while typing, even when the caller hands it a new onClose identity on every render', async () => {
    const user = userEvent.setup()

    function Wrapper() {
      const [, setDirty] = useState(false)
      // A new closure every render -- the same thing `requestClose` gets from its
      // `useCallback(..., [dirty, isEditing, onClose])` on the render where `dirty`
      // flips false -> true, because it is not memoized against a value that held still.
      const onClose = () => {}
      const dialogRef = useDialog(true, onClose)
      return (
        <div ref={dialogRef} role="dialog" tabIndex={-1}>
          <input
            aria-label="first name"
            onChange={(event) => {
              if (event.target.value.length > 0) setDirty(true)
            }}
          />
        </div>
      )
    }

    render(<Wrapper />)
    const input = screen.getByLabelText('first name')
    await user.click(input)
    expect(input).toHaveFocus()

    await user.type(input, 'נועה')

    expect(input).toHaveValue('נועה')
    expect(document.activeElement).toBe(input)
  })

  it('still closes on Escape, calling the CURRENT handler rather than the one captured on mount', async () => {
    const user = userEvent.setup()
    const firstHandler = vi.fn()
    const secondHandler = vi.fn()

    function Wrapper() {
      const [handler, setHandler] = useState(() => firstHandler)
      const dialogRef = useDialog(true, handler)
      return (
        <div>
          <div ref={dialogRef} role="dialog" tabIndex={-1}>
            <input aria-label="first name" />
          </div>
          <button aria-label="swap handler" onClick={() => setHandler(() => secondHandler)} />
        </div>
      )
    }

    render(<Wrapper />)
    await user.click(screen.getByRole('button', { name: 'swap handler' }))

    await user.keyboard('{Escape}')

    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------------
// Two dialogs open at once, closed in the wrong order — reported from staging
// 2026-09-07 as "on the home I can't scroll down or up".
//
// `ShopScreen` runs TWO of these hooks in one component (the product customiser and the
// cart), and each one saved its own snapshot of `body.overflow` and restored it on the way
// out. Close them in the order they were opened rather than the reverse and the snapshots
// are stale: the first to close restores '' while the second is still open, and the second
// then restores the 'hidden' IT had captured — onto a page with no dialog on it at all.
//
// The lock is an inline style on <body> and this is a single-page app, so nothing ever
// clears it. The parent leaves the shop, goes back to בית, and the page will not move.
// ---------------------------------------------------------------------------------
describe('the scroll lock, with more than one dialog', () => {
  function Dialog({ open }: { open: boolean }) {
    useDialog(open, () => {})
    return null
  }
  /** Both hooks in one component, as ShopScreen has them. */
  function Shop({ customiser, cart }: { customiser: boolean; cart: boolean }) {
    return (
      <>
        <Dialog open={customiser} />
        <Dialog open={cart} />
      </>
    )
  }

  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('holds the lock while either dialog is open', () => {
    const { rerender } = render(<Shop customiser={false} cart={false} />)
    expect(document.body.style.overflow).toBe('')

    rerender(<Shop customiser cart={false} />)
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<Shop customiser cart />)
    expect(document.body.style.overflow).toBe('hidden')

    // The customiser closes first — the cart is still open, so the page must stay locked.
    rerender(<Shop customiser={false} cart />)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('releases it when the LAST one closes, whatever order they closed in', () => {
    const { rerender } = render(<Shop customiser cart={false} />)
    rerender(<Shop customiser cart />)
    rerender(<Shop customiser={false} cart />)
    rerender(<Shop customiser={false} cart={false} />)
    // The bug: 'hidden', on a page showing no dialog, for the rest of the session.
    expect(document.body.style.overflow).toBe('')
  })

  it('releases it when the dialogs UNMOUNT out of order too', () => {
    const { rerender } = render(<Shop customiser cart />)
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<></>)
    expect(document.body.style.overflow).toBe('')
  })
})
