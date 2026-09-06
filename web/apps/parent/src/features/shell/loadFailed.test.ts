// P8's second item: "the app never tells a parent they are offline while reading."
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { resolveLoadFailedText } from './loadFailed'

afterEach(() => vi.unstubAllGlobals())

function setOnline(online: boolean) {
  vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: online })
}

describe('what a redesigned tab says when its fetch failed', () => {
  it('names the network when the browser says there is none', () => {
    // Not the tab's own message: a parent in a dojo doorway was being told the club's
    // schedule was broken, when the only thing broken was the walk from the car park.
    setOnline(false)
    expect(resolveLoadFailedText('he', 'schedule.home.loadFailed')).toBe(
      t('he', 'common.loadFailed.offline'),
    )
  })

  it("otherwise says what this screen couldn't load", () => {
    setOnline(true)
    expect(resolveLoadFailedText('he', 'schedule.home.loadFailed')).toBe(
      t('he', 'schedule.home.loadFailed'),
    )
    expect(resolveLoadFailedText('he', 'billing.shop.loadFailed')).toBe(
      t('he', 'billing.shop.loadFailed'),
    )
  })

  it('assumes online when the browser will not say, because onLine is a hint either way', () => {
    // `navigator.onLine === true` is not proof (a captive portal says yes), so the tab's
    // own message is the FALLBACK rather than the network one.
    vi.stubGlobal('navigator', undefined)
    expect(resolveLoadFailedText('he', 'comms.updates.loadFailed')).toBe(
      t('he', 'comms.updates.loadFailed'),
    )
  })
})
