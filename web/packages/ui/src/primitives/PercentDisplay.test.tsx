import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { PercentDisplay } from './PercentDisplay'
import { DIRECTIONS, renderIn } from '../testing'

describe('PercentDisplay', () => {
  it.each(DIRECTIONS)('renders the value in $locale', ({ locale }) => {
    renderIn(<PercentDisplay value={42} />, { locale })
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  /**
   * §3.3 — a percentage rendered as plain text next to a `MoneyDisplay`, with no
   * isolation of its own, let the bidi algorithm reorder the two digit runs into
   * `0%₪0` instead of the two amounts reading in the order they were written.
   */
  it('isolates the value from the surrounding text direction', () => {
    const { container } = renderIn(<PercentDisplay value={0} />, { locale: 'he' })
    const bdi = container.querySelector('bdi')
    expect(bdi).not.toBeNull()
    expect(bdi).toHaveTextContent('0%')
  })

  it('carries an accessible label when one is given', () => {
    renderIn(<PercentDisplay value={75} label="נגבה" />)
    expect(screen.getByLabelText('נגבה')).toBeInTheDocument()
  })
})
