import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEV_NOW_HEADER, IPN_SHAPES, devHeaders, getDevNow, setDevNow, simulateIpn } from './api'

afterEach(() => {
  setDevNow(null)
  vi.restoreAllMocks()
})

describe('the dev-bar client', () => {
  it('sends no header until the clock is moved', () => {
    expect(devHeaders()).toEqual({})
  })

  it('sends X-Dev-Now once the clock is moved', () => {
    setDevNow('2027-03-01T09:00:00.000Z')
    expect(devHeaders()).toEqual({ [DEV_NOW_HEADER]: '2027-03-01T09:00:00.000Z' })
  })

  it('clears back to nothing, so the shift does not outlive the session', () => {
    setDevNow('2027-03-01T09:00:00.000Z')
    setDevNow(null)
    expect(devHeaders()).toEqual({})
    expect(getDevNow()).toBeNull()
  })

  it('names §19.5s four IPN shapes and no others', () => {
    expect([...IPN_SHAPES]).toEqual(['success', 'amount_mismatch', 'forged_ref', 'duplicate'])
  })

  it('posts a simulated IPN to the versioned dev endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await simulateIpn({
      shape: 'amount_mismatch',
      orderPublicRef: '22222222-2222-4222-8222-222222222222',
      expectedAmountAgorot: 32000,
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/dev/upay/simulate-ipn')
    expect(JSON.parse(init.body).shape).toBe('amount_mismatch')
  })

  it('carries the time-travel header on its own calls too', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    setDevNow('2027-03-01T09:00:00.000Z')
    await simulateIpn({
      shape: 'success',
      orderPublicRef: '22222222-2222-4222-8222-222222222222',
      expectedAmountAgorot: 32000,
    })
    expect(fetchMock.mock.calls[0]![1].headers[DEV_NOW_HEADER]).toBe('2027-03-01T09:00:00.000Z')
  })
})
