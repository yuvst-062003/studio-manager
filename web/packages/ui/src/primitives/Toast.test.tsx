import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Toast } from './Toast'

describe.each(DIRECTIONS)('Toast in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('announces politely as a status region', () => {
      // status, not alert: a save confirmation waits for a pause. An attendance save is
      // not an emergency, and role="alert" would interrupt whatever is being read.
      renderIn(<Toast message="הנוכחות נשמרה · 22 נוכחים" />, { locale, theme })
      expect(screen.getByRole('status')).toHaveTextContent('הנוכחות נשמרה')
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Toast', () => {
  it('is polite, not assertive — never role=alert', () => {
    renderIn(<Toast message="נשמר" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders an action as a real button and calls it', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()
    renderIn(<Toast action={{ label: 'ביטול', onAction }} message="נשמר" />)
    await user.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('renders without an action', () => {
    renderIn(<Toast message="נשמר" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('hides its decorative icon from assistive tech', () => {
    renderIn(<Toast message="נשמר" />)
    expect(screen.getByRole('status').querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
