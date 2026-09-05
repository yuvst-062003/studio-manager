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
import { describe, expect, it, vi } from 'vitest'
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
