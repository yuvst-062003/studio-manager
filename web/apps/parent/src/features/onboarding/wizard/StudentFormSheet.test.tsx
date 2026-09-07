// Discarding an edit — and the browser dialog that used to ask about it.
//
// `requestClose` called `window.confirm()`: a grey iOS system dialog with the app's own URL
// printed across the top, which is the loudest possible announcement that the thing you are
// holding is a web page. It could not be styled, could not be translated past its message,
// and put the destructive choice at the same weight as the safe one.
//
// The first test is the one that keeps it gone.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentFormSheet } from './StudentFormSheet'
import { studentFormCopy } from './copy'
import { emptyStudent } from './types'

const COPY = studentFormCopy('he')

/** `isEditing` is `initial !== null && initial.firstName !== ''`, and the confirmation only
 *  exists for an EDIT — a new child has an autosaved draft behind it, so closing loses
 *  nothing. So this fixture has to carry a name. */
const EXISTING = { ...emptyStudent('child-1'), firstName: 'איתי', lastName: 'גולן' }

beforeEach(() => {
  // `validate` scrolls a failed part into view, and jsdom has no scrollTo.
  Element.prototype.scrollTo = vi.fn()
})

function renderSheet(onClose = vi.fn()) {
  render(
    <StudentFormSheet
      locale="he"
      initial={EXISTING}
      groups={[]}
      plans={[]}
      healthSchema={{ sections: [] } as never}
      onClose={onClose}
      onSave={vi.fn()}
    />,
  )
  return onClose
}

/** Type one character into the first text field, which is all `dirty` needs. */
async function dirtyIt(user: ReturnType<typeof userEvent.setup>) {
  const first = screen.getAllByRole('textbox')[0]!
  await user.type(first, 'x')
}

describe('discarding an edit', () => {
  it('never calls window.confirm', async () => {
    // The assertion that keeps the system dialog gone. A spy rather than a deletion: if the
    // component reached for it, this would record the call AND the panel below would be
    // missing, so the test fails for the real reason rather than by crashing.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderSheet()

    await dirtyIt(user)
    await user.click(screen.getByRole('button', { name: COPY.close }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByTestId('discard-confirm')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('closes without asking when nothing was edited', async () => {
    const user = userEvent.setup()
    const onClose = renderSheet()

    await user.click(screen.getByRole('button', { name: COPY.close }))

    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByTestId('discard-confirm')).not.toBeInTheDocument()
  })

  it('keeps the work when the answer is "back to editing"', async () => {
    const user = userEvent.setup()
    const onClose = renderSheet()

    await dirtyIt(user)
    await user.click(screen.getByRole('button', { name: COPY.close }))
    await user.click(screen.getByTestId('discard-keep'))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByTestId('discard-confirm')).not.toBeInTheDocument()
    // Still on the form, with the field the parent was typing in.
    expect(screen.getAllByRole('textbox')[0]).toBeInTheDocument()
  })

  it('closes when the answer is "discard"', async () => {
    const user = userEvent.setup()
    const onClose = renderSheet()

    await dirtyIt(user)
    await user.click(screen.getByRole('button', { name: COPY.close }))
    await user.click(screen.getByTestId('discard-confirm-button'))

    expect(onClose).toHaveBeenCalled()
  })

  it('offers keeping the work before losing it', async () => {
    // Order matters on a phone: the safe choice is the filled button and the destructive
    // one is the quiet link underneath. The system dialog gave them equal weight.
    const user = userEvent.setup()
    renderSheet()

    await dirtyIt(user)
    await user.click(screen.getByRole('button', { name: COPY.close }))

    const panel = await screen.findByTestId('discard-confirm')
    const buttons = [...panel.querySelectorAll('button')].map((b) => b.textContent)
    expect(buttons).toEqual([COPY.discardKeep, COPY.discardConfirm])
  })
})
