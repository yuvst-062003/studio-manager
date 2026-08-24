import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HelloProof } from './HelloProof'
import { ThemeProvider } from './ThemeProvider'

const renderProof = () =>
  render(
    <ThemeProvider>
      <HelloProof appNameKey="common.appName.staff" />
    </ThemeProvider>,
  )

describe('the hello screen proves the three things M0.1 claims', () => {
  it('sets dir=rtl on the document root for the Hebrew locale (SPEC §9)', () => {
    renderProof()
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('he')
  })

  it('renders the font proof string covering Hebrew, Latin and base Cyrillic (D6)', () => {
    renderProof()
    // If Rubik ever loses a subset, this is the string that shows tofu on screen.
    const text = screen.getByTestId('font-proof').textContent ?? ''
    expect(text).toMatch(/[֐-׿]/)
    expect(text).toMatch(/[Ѐ-џ]/)
    expect(text).toMatch(/[A-Za-z]/)
  })

  it('applies a resolved theme to the document root (D4)', () => {
    renderProof()
    expect(['light', 'dark']).toContain(document.documentElement.dataset.theme)
  })

  it('takes every visible string from i18n, never inlined (G4)', () => {
    renderProof()
    expect(screen.getByRole('heading')).toHaveTextContent('הבסיס עובד')
  })

  it('offers all three D4 theme options, with pressed state announced', () => {
    renderProof()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })
})
