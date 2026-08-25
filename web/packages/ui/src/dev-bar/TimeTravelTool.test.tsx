import { afterEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { t } from '@studio/i18n'
import { DIRECTIONS, renderIn } from '../testing'
import { TimeTravelTool } from './TimeTravelTool'
import { getDevNow, setDevNow } from './api'

afterEach(() => setDevNow(null))

describe('TimeTravelTool', () => {
  it.each(DIRECTIONS)('renders in $locale ($dir) — §13', ({ locale, dir }) => {
    renderIn(<TimeTravelTool locale={locale} />, { locale })
    expect(document.documentElement.dir).toBe(dir)
    expect(
      screen.getByRole('button', { name: t(locale, 'common.dev.timeTravel.plusMonth') }),
    ).toBeInTheDocument()
  })

  it('moves the clock forward by a month', async () => {
    renderIn(<TimeTravelTool locale="en" />)
    await userEvent.click(screen.getByRole('button', { name: '+1 month' }))
    expect(getDevNow()).not.toBeNull()
    expect(new Date(getDevNow()!).getTime()).toBeGreaterThan(Date.now())
  })

  it('goes back to now, so a session is not stuck in the future', async () => {
    renderIn(<TimeTravelTool locale="en" />)
    await userEvent.click(screen.getByRole('button', { name: '+1 month' }))
    await userEvent.click(screen.getByRole('button', { name: 'back to now' }))
    expect(getDevNow()).toBeNull()
  })

  it('shows where the clock is, because a shift that failed looks like no shift', async () => {
    renderIn(<TimeTravelTool locale="en" />)
    await userEvent.click(screen.getByRole('button', { name: '+1 month' }))
    expect(screen.getByTestId('dev-now')).toHaveTextContent(/\d{4}-\d{2}-\d{2}/)
  })
})
