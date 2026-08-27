import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { LoadFailed } from './LoadFailed'

describe.each(DIRECTIONS)('LoadFailed in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('renders the danger alert and a retry button', () => {
      renderIn(<LoadFailed locale={locale} onRetry={() => {}} />, { locale, theme })
      expect(screen.getByTestId('load-failed')).toBeVisible()
      expect(screen.getByTestId('load-failed-retry')).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('LoadFailed', () => {
  it('calls onRetry when the button is pressed', async () => {
    const onRetry = vi.fn()
    renderIn(<LoadFailed locale="he" onRetry={onRetry} />)
    await userEvent.click(screen.getByTestId('load-failed-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders screen-specific copy through detail instead of the generic body', () => {
    renderIn(
      <LoadFailed detail="לא הצלחנו לטעון את ההתקדמות. נסו לרענן." locale="he" onRetry={() => {}} />,
    )
    expect(screen.getByText(/לטעון את ההתקדמות/)).toBeVisible()
    expect(screen.queryByText('לא הצלחנו לטעון את הנתונים.')).toBeNull()
  })

  it('distinguishes offline from broken', () => {
    renderIn(<LoadFailed locale="he" offline onRetry={() => {}} />)
    expect(screen.getByTestId('load-failed')).toHaveAttribute('data-offline', 'true')
    expect(screen.getByText(/אין חיבור לרשת/)).toBeVisible()
  })
})
