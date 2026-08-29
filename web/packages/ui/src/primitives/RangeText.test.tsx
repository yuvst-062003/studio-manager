import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { RangeText } from './RangeText'

describe.each(DIRECTIONS)('RangeText in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('reads from-then-to and flows in the document direction', () => {
      renderIn(<RangeText from="16:00" to="17:00" />, { locale, theme })
      expect(screen.getByText('16:00–17:00')).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
      expect(document.documentElement.dataset.theme).toBe(theme)
    })
  })
})

describe('RangeText', () => {
  // The bug this primitive exists for is invisible to textContent: the DOM order is
  // from-then-to either way, and only the bidi layout reverses. So the assertions are the
  // mechanism — ONE element, explicitly ltr, holding both ends and the separator.
  it('is a single ltr island, not two isolated ends', () => {
    const { container } = renderIn(<RangeText from="2026-09-01" to="2027-09-01" />)
    const range = container.querySelector('.studio-range')
    expect(range?.tagName).toBe('BDI')
    expect(range).toHaveAttribute('dir', 'ltr')
    expect(range?.textContent).toBe('2026-09-01–2027-09-01')
  })

  it('nests nothing inside itself — a per-end <bdi> is the failure, not the fix', () => {
    const { container } = renderIn(<RangeText from="16:00" to="17:00" />)
    expect(container.querySelectorAll('.studio-range bdi')).toHaveLength(0)
  })

  it('takes a separator, because not every range is joined by a dash', () => {
    renderIn(<RangeText from="14" separator=" / " to="20" />)
    expect(screen.getByText('14 / 20')).toBeInTheDocument()
  })

  it('forwards a className so a screen can size it without reopening this file', () => {
    const { container } = renderIn(<RangeText className="tabular" from="1" to="2" />)
    expect(container.querySelector('.studio-range')).toHaveClass('tabular')
  })
})
