import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Switch } from './Switch'

const stateLabels = { on: 'מופעל', off: 'כבוי' }

describe.each(DIRECTIONS)('Switch in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each([true, false])('shows a visible state label when checked=%s', (checked) => {
      // 4h: "מתגים ובחירה — תמיד עם תווית מצב". An Arbox reviewer specifically reported
      // being unable to tell whether a toggle was on or off (research/02).
      renderIn(
        <Switch checked={checked} label="תזכורות" onCheckedChange={() => {}} stateLabels={stateLabels} />,
        { locale, theme },
      )
      expect(screen.getByText(checked ? stateLabels.on : stateLabels.off)).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Switch', () => {
  it('is a switch with its checked state in the accessibility tree', () => {
    renderIn(
      <Switch checked label="תזכורות" onCheckedChange={() => {}} stateLabels={stateLabels} />,
    )
    expect(screen.getByRole('switch', { name: 'תזכורות' })).toHaveAttribute('aria-checked', 'true')
  })

  it('reports the NEXT value, not the current one', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <Switch checked={false} label="x" onCheckedChange={onCheckedChange} stateLabels={stateLabels} />,
    )
    await user.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('reports false when switching off', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <Switch checked label="x" onCheckedChange={onCheckedChange} stateLabels={stateLabels} />,
    )
    await user.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('is operable from the keyboard', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <Switch checked={false} label="x" onCheckedChange={onCheckedChange} stateLabels={stateLabels} />,
    )
    await user.tab()
    expect(screen.getByRole('switch')).toHaveFocus()
    await user.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('does not fire when disabled', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <Switch
        checked={false}
        disabled
        label="x"
        onCheckedChange={onCheckedChange}
        stateLabels={stateLabels}
      />,
    )
    await user.click(screen.getByRole('switch'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('requires stateLabels — a state label that can be omitted is a rule that gets broken', () => {
    // Only source can be checked for a REQUIRED prop; TypeScript is the real gate. This
    // asserts the signature has not quietly grown a default.
    const signature = /\{([^}]*)\}/.exec(Switch.toString())?.[1] ?? ''
    expect(signature).toContain('stateLabels')
    expect(signature).not.toMatch(/stateLabels\s*=/)
  })
})
