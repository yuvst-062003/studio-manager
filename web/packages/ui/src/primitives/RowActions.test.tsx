import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, renderIn } from '../testing'
import { RowActions } from './RowActions'
import type { RowAction } from './RowActions'

function actions(overrides?: Partial<RowAction>[]): RowAction[] {
  return [
    { id: 'rename', label: 'שינוי שם', onSelect: vi.fn() },
    { id: 'archive', label: 'העברה לארכיון', onSelect: vi.fn() },
    { id: 'end', label: 'סיום העסקה', onSelect: vi.fn(), destructive: true },
    ...(overrides ?? []),
  ] as RowAction[]
}

describe.each(DIRECTIONS)('RowActions in $locale ($dir)', ({ locale }) => {
  it('opens a labelled menu from a named trigger', async () => {
    renderIn(<RowActions actions={actions()} triggerLabel="פעולות עבור לביא טמיר" />, { locale })
    const trigger = screen.getByRole('button', { name: 'פעולות עבור לביא טמיר' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'פעולות עבור לביא טמיר' })
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'שינוי שם',
      'העברה לארכיון',
      'סיום העסקה',
    ])
  })
})

describe('RowActions', () => {
  it('puts the destructive action last, separated, and marks it destructive', async () => {
    // Order in the input is deliberately NOT already-sorted, so this proves RowActions
    // enforces the placement rather than trusting the caller's array order.
    const list = [
      { id: 'end', label: 'סיום העסקה', onSelect: vi.fn(), destructive: true },
      { id: 'rename', label: 'שינוי שם', onSelect: vi.fn() },
    ]
    renderIn(<RowActions actions={list} triggerLabel="פעולות" />)
    await userEvent.click(screen.getByRole('button', { name: 'פעולות' }))
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['שינוי שם', 'סיום העסקה'])
    const destructiveItem = screen.getByRole('menuitem', { name: 'סיום העסקה' })
    expect(destructiveItem).toHaveAttribute('data-destructive', 'true')
    // A visible separator sits between the regular items and the destructive one.
    expect(within(menu).getByRole('separator')).toBeInTheDocument()
  })

  it('calls the action and closes the menu on click', async () => {
    const list = actions()
    renderIn(<RowActions actions={list} triggerLabel="פעולות" />)
    await userEvent.click(screen.getByRole('button', { name: 'פעולות' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'שינוי שם' }))
    expect(list[0]!.onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('is keyboard-operable: Enter opens the trigger, focus lands on the first item, Enter activates it', async () => {
    const list = actions()
    renderIn(<RowActions actions={list} triggerLabel="פעולות" />)
    const trigger = screen.getByRole('button', { name: 'פעולות' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // Same contract as every other popup in this repo (`useModalDialog`): focus moves into
    // it on open, to the first tabbable child — a keyboard user should not have to Tab in.
    expect(screen.getByRole('menuitem', { name: 'שינוי שם' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(list[0]!.onSelect).toHaveBeenCalledTimes(1)
  })

  it('Tab moves from the first item to the second, and never escapes the menu', async () => {
    renderIn(<RowActions actions={actions()} triggerLabel="פעולות" />)
    await userEvent.click(screen.getByRole('button', { name: 'פעולות' }))
    await userEvent.tab()
    expect(screen.getByRole('menuitem', { name: 'העברה לארכיון' })).toHaveFocus()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    renderIn(<RowActions actions={actions()} triggerLabel="פעולות" />)
    const trigger = screen.getByRole('button', { name: 'פעולות' })
    await userEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})
