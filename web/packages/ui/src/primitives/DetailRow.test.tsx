import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DetailRow } from './DetailRow'

describe('DetailRow', () => {
  it('renders the label beside its value', () => {
    render(<DetailRow label="Belt">Orange</DetailRow>)
    expect(screen.getByText('Belt')).toBeInTheDocument()
    expect(screen.getByText('Orange')).toBeInTheDocument()
  })

  it('makes the WHOLE row the target when it goes somewhere', () => {
    // Same rule StatTile follows: a person reaching for a row on a phone should not have
    // to find a caption-sized link inside it.
    render(
      <DetailRow href="#/plan/st1" label="Plan" testId="plan-row">
        Three times a week
      </DetailRow>,
    )
    const row = screen.getByTestId('plan-row')
    expect(row.tagName).toBe('A')
    expect(row).toHaveAttribute('href', '#/plan/st1')
    // The row's own text is its accessible name — the chevron never speaks. Matched
    // loosely because jsdom computes no layout, so the accname algorithm cannot apply the
    // inter-block spacing a real browser inserts between the two flex children.
    expect(row).toHaveAccessibleName(/Plan.*Three times a week/)
    expect(row).toHaveAccessibleName(expect.not.stringContaining('chevron'))
  })

  it('renders an action at the far end of a row that does not navigate', () => {
    render(
      <DetailRow action={<button type="button">Fill in</button>} label="Health" testId="h">
        Missing
      </DetailRow>,
    )
    expect(screen.getByTestId('h').tagName).toBe('DIV')
    expect(screen.getByRole('button', { name: 'Fill in' })).toBeInTheDocument()
  })

  it('never nests a control inside a link row', () => {
    // An <a> containing a <button> is invalid HTML and fails silently — the row still
    // renders and the inner control stops being reachable. The prop type is what stops
    // it; this asserts the rendering half, since a type is not a runtime guarantee for
    // JavaScript callers.
    render(
      <DetailRow href="#/payments" label="Debt" testId="d">
        240₪
      </DetailRow>,
    )
    expect(screen.getByTestId('d').querySelector('button')).toBeNull()
  })

  it('carries a semantic tone on the value, never on the whole row', () => {
    // D2/G13 — the tone means "this is money owed", not "make this red". Toning the row
    // would colour the label too, and the label is not the thing with the meaning.
    render(
      <DetailRow label="Debt" testId="d" tone="debt">
        240₪
      </DetailRow>,
    )
    const row = screen.getByTestId('d')
    expect(row).not.toHaveAttribute('data-tone')
    expect(row.querySelector('[data-tone="debt"]')).toHaveTextContent('240₪')
  })
})
