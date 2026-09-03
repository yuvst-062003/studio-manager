import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, renderIn } from '../testing'
import { ChipList } from './ChipList'

const GROUPS = ['נבחרת', 'קבוצה 1', 'קבוצה 2', 'קבוצה 3', 'קבוצה 4', 'קבוצה 5', 'קבוצה 6', 'קבוצה 7']

describe.each(DIRECTIONS)('ChipList in $locale ($dir)', ({ locale }) => {
  it('renders at most `max` chips and one +N chip whose accessible name lists the remainder', () => {
    renderIn(
      <ChipList items={GROUPS} max={3} moreLabel={(n) => `+${n}`} />,
      { locale },
    )
    const list = screen.getByRole('list')
    const chips = within(list).getAllByRole('listitem')
    // 3 visible chips + 1 "+N" chip.
    expect(chips).toHaveLength(4)
    expect(within(list).getByText('נבחרת')).toBeInTheDocument()
    expect(within(list).getByText('קבוצה 1')).toBeInTheDocument()
    expect(within(list).getByText('קבוצה 2')).toBeInTheDocument()
    expect(within(list).queryByText('קבוצה 3')).not.toBeInTheDocument()

    const more = within(list).getByText('+5')
    // Accessible name lists the remainder — a screen reader hears the actual overflow,
    // not just a count, and a mouse user gets the same text on hover via `title`.
    expect(more).toHaveAttribute(
      'aria-label',
      'קבוצה 3, קבוצה 4, קבוצה 5, קבוצה 6, קבוצה 7',
    )
    expect(more).toHaveAttribute('title', 'קבוצה 3, קבוצה 4, קבוצה 5, קבוצה 6, קבוצה 7')
  })
})

describe('ChipList', () => {
  it('renders every item as a plain chip when there are max or fewer', () => {
    renderIn(<ChipList items={['א', 'ב']} max={3} moreLabel={(n) => `+${n}`} />)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('renders nothing for an empty list', () => {
    const { container } = renderIn(<ChipList items={[]} max={3} moreLabel={(n) => `+${n}`} />)
    expect(container.querySelector('.studio-chip-list')).toBeNull()
  })

  it('defaults max to 3', () => {
    renderIn(<ChipList items={['א', 'ב', 'ג', 'ד']} moreLabel={(n) => `+${n}`} />)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(within(list).getByText('+1')).toBeInTheDocument()
  })
})
