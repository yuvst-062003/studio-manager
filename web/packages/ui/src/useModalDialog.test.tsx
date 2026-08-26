// `aria-modal="true"` is a claim about the whole page, and until W6 nothing in this repo
// made it true. Four dialogs set the attribute (or drew a full-viewport backdrop) and then
// let Tab walk straight out into the form behind — including two wrapping irreversible bulk
// writes, a group belt promotion and an exam-result save.
//
// These assertions are the behaviour, not the attribute. A test that checked for
// `aria-modal` would have passed against every one of those four.
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useModalDialog } from './useModalDialog'

function Harness() {
  const [open, setOpen] = useState(false)
  const dialogRef = useModalDialog(open, () => setOpen(false))
  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        open
      </button>
      <button type="button">outside</button>
      {open ? (
        <div aria-label="confirm" aria-modal="true" ref={dialogRef} role="dialog" tabIndex={-1}>
          <button type="button">first</button>
          <button type="button">last</button>
        </div>
      ) : null}
    </div>
  )
}

describe('useModalDialog', () => {
  it('moves focus into the dialog when it opens', async () => {
    // Without this a screen reader stays on the trigger, which the dialog has just covered,
    // and announces nothing at all — the user presses a button and the app goes silent.
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()
  })

  it('wraps Tab from the last control back to the first', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()
    // The load-bearing negative: focus never reaches the page the dialog claims is
    // unavailable.
    expect(screen.getByRole('button', { name: 'outside' })).not.toHaveFocus()
  })

  it('wraps Shift+Tab backwards from the first control', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus()
  })

  it('closes on Escape', async () => {
    // SC 2.1.2, and the key everybody tries first.
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('restores focus to whatever opened it', async () => {
    // Otherwise dismissing a dialog drops focus to <body>, and a keyboard user restarts from
    // the top of the document — on a dashboard screen that is a long way back.
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'open' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })
})
