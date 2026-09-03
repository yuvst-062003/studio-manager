import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

describe('A2 — an <a class="studio-btn"> gets a non-inline display, so it does not overflow into whatever follows it', () => {
  // The cropped screenshot of #/students: the black "הוספת חניך" link-button painted
  // across the "חיפוש חניך" field label below it, underline still on. `<button>` is fine —
  // the user agent defaults it to inline-block — but `<a>` defaults to `display: inline`,
  // and block padding on an inline box overflows the line box instead of growing it.
  it('renders the failing shape: an anchor wearing the button class', () => {
    renderIn(
      <a className="studio-btn" href="#">
        הוספת חניך
      </a>,
    )
    expect(screen.getByRole('link', { name: 'הוספת חניך' })).toHaveClass('studio-btn')
  })

  it('declares a non-inline display in primitives.css', () => {
    // Not asserted via getComputedStyle: this suite's jsdom never loads primitives.css (no
    // test here imports it, and vitest.setup.ts does not either), so
    // `getComputedStyle(anchor).display` reports the browser's inline-by-default value no
    // matter what the stylesheet says — verified directly, rendering the anchor above and
    // reading it returns 'inline' both before and after this rule gains
    // `display: inline-flex`. SegmentedControl.test.tsx documents the same limitation for
    // this suite; tokens.test.ts is this repo's precedent for asserting on the raw CSS
    // source instead. So the real assertion is on the rule text.
    const raw = readFileSync(
      resolve(process.cwd(), 'packages/ui/src/primitives/primitives.css'),
      'utf-8',
    )
    // Strip comments first (tokens.test.ts's precedent) — the rule's own comment names
    // the bug it fixes and would otherwise be indistinguishable from a real declaration.
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    // The bare `.studio-btn { ... }` block only — the trailing `\s*\{` excludes its
    // `[data-variant="..."]` siblings, which open with `[` rather than whitespace or `{`.
    const block = css.match(/\.studio-btn\s*\{([^}]*)\}/)?.[1] ?? ''
    const display = block.match(/display:\s*([a-z-]+)/)?.[1]
    expect(display).toBeDefined()
    expect(display).not.toBe('inline')
  })
})
