import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { t } from '@studio/i18n'
import { DIRECTIONS, renderIn } from '../testing'
import { ResetDemoTool } from './ResetDemoTool'

afterEach(() => vi.restoreAllMocks())

describe('ResetDemoTool', () => {
  it.each(DIRECTIONS)('renders in $locale ($dir) — §13', ({ locale, dir }) => {
    renderIn(<ResetDemoTool locale={locale} />, { locale })
    expect(document.documentElement.dir).toBe(dir)
    expect(
      screen.getByRole('button', { name: t(locale, 'common.dev.tool.resetDemo') }),
    ).toBeInTheDocument()
  })

  it('posts to the versioned reset endpoint on click', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderIn(<ResetDemoTool locale="en" />)
    await userEvent.click(screen.getByRole('button', { name: t('en', 'common.dev.tool.resetDemo') }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/dev/demo/reset',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows what came back, because a reset that failed silently looks like one that worked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderIn(<ResetDemoTool locale="en" />)
    await userEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(await screen.findByTestId('reset-demo-result')).toHaveTextContent('200')
  })
})
