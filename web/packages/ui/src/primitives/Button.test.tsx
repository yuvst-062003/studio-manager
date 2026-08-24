import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Button } from './Button'

const VARIANTS = ['primary', 'secondary', 'ghost', 'destructive'] as const

describe.each(DIRECTIONS)('Button in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each(VARIANTS)('renders the %s variant as a real button with its label', (variant) => {
      renderIn(<Button variant={variant}>שמור</Button>, { locale, theme })
      expect(screen.getByRole('button', { name: 'שמור' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Button', () => {
  it('defaults to the primary variant', () => {
    renderIn(<Button>x</Button>)
    // data-variant is the documented API the stylesheet selects on. jsdom applies no
    // stylesheet rules, so the attribute is the only observable form of the variant.
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary')
  })

  it.each(VARIANTS)('exposes %s through data-variant', (variant) => {
    renderIn(<Button variant={variant}>x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', variant)
  })

  it('defaults to type=button, so it never submits a form by accident', () => {
    renderIn(<Button>x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('honours an explicit type', () => {
    renderIn(<Button type="submit">x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    renderIn(<Button onClick={onClick}>x</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <Button disabled onClick={onClick}>
        x
      </Button>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is reachable by keyboard and activates on Enter', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    renderIn(<Button onClick={onClick}>x</Button>)
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('takes its label as a prop — the primitive never reaches into i18n (G4)', () => {
    renderIn(<Button>caller-supplied</Button>)
    expect(screen.getByRole('button', { name: 'caller-supplied' })).toBeInTheDocument()
  })
})
