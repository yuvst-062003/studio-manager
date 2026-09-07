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
import { PartHealth } from './parts/PartHealth'
import type { TemplateSchema } from '../../health/healthClient'
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
      belts={[{ id: 'belt-white', name: 'חגורה לבנה' }]}
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

describe("the belt picker (bug #10)", () => {
  function renderWith(belts: { id: string; name: string }[]) {
    render(
      <StudentFormSheet
        locale="he"
        initial={EXISTING}
        groups={[]}
        plans={[]}
        belts={belts}
        healthSchema={{ sections: [] } as never}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )
  }

  it("offers the club's own ranks, not a list compiled into the app", () => {
    // The owner's #10. The picker shipped the same eight belts for every club in the
    // product, so a club that had built its own ladder in `5b` watched families register
    // against belts it does not award.
    renderWith([
      { id: 'r1', name: 'חגורה לבנה' },
      { id: 'r2', name: 'חגורה לבנה עם פס צהוב' },
    ])
    const picker = screen.getByLabelText(COPY.belt)
    expect([...picker.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      COPY.beltPlaceholder,
      'חגורה לבנה',
      'חגורה לבנה עם פס צהוב',
    ])
  })

  it('asks nothing at all when the club has no ladder', () => {
    // The field is optional, so an absent one costs a family nothing — while a picker with
    // no options is a control that cannot be answered, which is the shape #9 was about.
    renderWith([])
    expect(screen.queryByLabelText(COPY.belt)).toBeNull()
  })
})

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

describe('the three questions the wizard asks itself (owner-reported 2026-09-07)', () => {
  it('does not draw health_fund, emergency_contact or special_notes from the template', () => {
    // They were asked twice — once by the template here, once by the wizard's own better
    // controls in step 5 — and `adapters.ts` then OVERWROTE the template's answer with the
    // wizard's, so the first answer was collected and discarded.
    const schema: TemplateSchema = {
      sections: [
        {
          id: 'other',
          title: 'נוסף',
          questions: [
            { id: 'other', type: 'boolean', label: 'משהו נוסף?', flag: true },
            { id: 'health_fund', type: 'text', label: 'קופת חולים', required: true },
            { id: 'emergency_contact', type: 'phone', label: 'טלפון לשעת חירום', required: true },
          ],
        },
        {
          id: 'declaration',
          title: 'הצהרה',
          questions: [
            { id: 'special_notes', type: 'text', label: 'הערות בריאות מיוחדות', required: false },
          ],
        },
      ],
    }

    render(
      <PartHealth
        locale="he"
        schema={schema}
        student={emptyStudent('c1')}
        onChange={() => {}}
        presetError={null}
        answersError={null}
        clauseError={null}
      />,
    )

    expect(screen.queryByLabelText('קופת חולים')).toBeNull()
    expect(screen.queryByLabelText('טלפון לשעת חירום')).toBeNull()
    expect(screen.queryByLabelText('הערות בריאות מיוחדות')).toBeNull()
    // The section's OTHER question still renders — the filter is per question, not
    // per section, or a club adding a real question beside these would lose it.
    expect(screen.getByText('משהו נוסף?')).toBeInTheDocument()
  })
})
