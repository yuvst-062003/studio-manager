import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { AttendanceMark } from './AttendanceMark'

const STATES = ['present', 'absent', 'notified', 'unmarked'] as const

describe.each(DIRECTIONS)('AttendanceMark in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each(STATES)('announces the %s state by name', (state) => {
      renderIn(<AttendanceMark label="נוכח" state={state} />, { locale, theme })
      expect(screen.getByRole('img', { name: 'נוכח' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('AttendanceMark', () => {
  it.each(STATES)('exposes %s through data-state', (state) => {
    renderIn(<AttendanceMark label="x" state={state} />)
    expect(screen.getByRole('img')).toHaveAttribute('data-state', state)
  })

  it('distinguishes the four states by SHAPE, not only by colour (SC 1.4.1)', () => {
    // A coach scanning a roster of thirty in a few seconds, or anyone with a colour
    // vision deficiency, must be able to tell them apart. 4h draws a check, a cross, an
    // outlined cross and a dot.
    const shapes = STATES.map((state) => {
      const { unmount } = renderIn(<AttendanceMark label="x" state={state} />)
      const shape = screen.getByRole('img').querySelector('svg')?.dataset.shape
      unmount()
      return shape
    })
    expect(shapes).not.toContain(undefined)
    expect(new Set(shapes).size).toBe(4)
  })

  it('hides the decorative svg from assistive tech — the label carries the meaning', () => {
    renderIn(<AttendanceMark label="נעדר" state="absent" />)
    expect(screen.getByRole('img').querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('hardcodes no colour — every state resolves through a token (G13)', () => {
    for (const state of STATES) {
      const { unmount } = renderIn(<AttendanceMark label="x" state={state} />)
      expect(screen.getByRole('img').getAttribute('style')).toBeNull()
      unmount()
    }
  })
})
