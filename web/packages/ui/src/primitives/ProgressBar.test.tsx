import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { ProgressBar } from './ProgressBar'

const fill = () => screen.getByRole('progressbar').querySelector('.studio-progress__fill')

describe.each(DIRECTIONS)('ProgressBar in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is a labelled progressbar carrying its value', () => {
      renderIn(<ProgressBar label="נוכחות" max={25} readout="18/25" value={18} />, { locale, theme })
      const bar = screen.getByRole('progressbar', { name: 'נוכחות' })
      expect(bar).toHaveAttribute('aria-valuenow', '18')
      expect(bar).toHaveAttribute('aria-valuemax', '25')
      expect(bar).toHaveAttribute('aria-valuemin', '0')
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('ProgressBar', () => {
  it('shows the readout as text, so the value is not carried by width alone', () => {
    renderIn(<ProgressBar label="x" max={25} readout="18/25" value={18} />)
    expect(screen.getByText('18/25')).toBeVisible()
  })

  it('sets the fill as a percentage of max', () => {
    renderIn(<ProgressBar label="x" max={25} value={18} />)
    // Inline, because the width IS the data. 18/25 = 72%, which is what 4h draws.
    expect(fill()).toHaveStyle({ inlineSize: '72%' })
  })

  it('clamps out-of-range values rather than overflowing the track', () => {
    renderIn(<ProgressBar label="x" max={10} value={99} />)
    expect(fill()).toHaveStyle({ inlineSize: '100%' })
  })

  it('clamps a negative value to empty', () => {
    renderIn(<ProgressBar label="x" max={10} value={-4} />)
    expect(fill()).toHaveStyle({ inlineSize: '0%' })
  })

  it('treats max=0 as empty rather than dividing by zero', () => {
    renderIn(<ProgressBar label="x" max={0} value={0} />)
    expect(fill()).toHaveStyle({ inlineSize: '0%' })
  })

  it('renders without a readout', () => {
    renderIn(<ProgressBar label="x" max={10} value={5} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
