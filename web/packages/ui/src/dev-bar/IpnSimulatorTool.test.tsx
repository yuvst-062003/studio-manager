import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { t } from '@studio/i18n'
import { DIRECTIONS, renderIn } from '../testing'
import { IpnSimulatorTool } from './IpnSimulatorTool'
import { IPN_SHAPES } from './api'

afterEach(() => vi.restoreAllMocks())

const ORDER = '22222222-2222-4222-8222-222222222222'

describe('IpnSimulatorTool', () => {
  it.each(DIRECTIONS)('renders in $locale ($dir) — §13', ({ locale, dir }) => {
    renderIn(<IpnSimulatorTool locale={locale} />, { locale })
    expect(document.documentElement.dir).toBe(dir)
    expect(screen.getByText(t(locale, 'common.dev.tool.simulateIpn'))).toBeInTheDocument()
  })

  it('offers all four §19.5 shapes and nothing else', () => {
    renderIn(<IpnSimulatorTool locale="en" />)
    for (const shape of IPN_SHAPES) {
      expect(screen.getByRole('radio', { name: t('en', `common.dev.ipn.${shape}`) })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('radio')).toHaveLength(IPN_SHAPES.length)
  })

  it('posts the selected shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"delivered":false}'))
    vi.stubGlobal('fetch', fetchMock)
    renderIn(<IpnSimulatorTool locale="en" />)
    await userEvent.click(screen.getByRole('radio', { name: 'duplicate' }))
    await userEvent.type(screen.getByLabelText(/order/i), ORDER)
    await userEvent.click(screen.getByRole('button', { name: /simulate/i }))
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).shape).toBe('duplicate')
  })

  it('every label key it renders exists in the bundle', () => {
    // A missing key renders as the key itself (packages/i18n/index.ts translate()), so
    // a typo would show `common.dev.ipn.duplicate` on screen and pass a looser test.
    for (const shape of IPN_SHAPES) {
      expect(t('he', `common.dev.ipn.${shape}`)).not.toContain('common.dev')
    }
  })
})
