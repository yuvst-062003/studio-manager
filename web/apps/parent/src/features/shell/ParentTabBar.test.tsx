// The parent bar had no tests of its own until the 2026-09-09 redesign, which is why the
// three inks it inherited from the prototype could sit unexamined for a month. These cover
// the two things that redesign actually decided — where the bar SITS and how it says you
// are here — plus the deviations the module header claims, so a later port cannot quietly
// drop one.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { ParentTabBar } from './ParentTabBar'

describe('ParentTabBar', () => {
  it('renders all five tabs with their Hebrew labels and correct hrefs', () => {
    render(<ParentTabBar active="home" locale="he" />)
    const expected: Array<[string, string, string]> = [
      ['home', '#/', 'common.tabs.parentHome'],
      ['shop', '#/shop', 'common.tabs.parentShop'],
      ['updates', '#/announcements', 'common.tabs.parentUpdates'],
      ['techniques', '#/techniques', 'common.tabs.parentTechniques'],
      ['profile', '#/profile', 'common.tabs.parentProfile'],
    ]
    for (const [tab, href, key] of expected) {
      const link = screen.getByTestId(`tab-${tab}`)
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveTextContent(t('he', key))
    }
  })

  it('marks the active tab current and leaves the rest unmarked', () => {
    render(<ParentTabBar active="shop" locale="he" />)
    expect(screen.getByTestId('tab-shop')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('tab-home')).not.toHaveAttribute('aria-current')
  })

  it('floats: inset from both edges, and never pinned across the bottom', () => {
    render(<ParentTabBar active="home" locale="he" />)
    const className = screen.getByTestId('tab-bar').className
    expect(className).toMatch(/inset-x-3/)
    expect(className).not.toMatch(/bottom-0/)
  })

  it('clears the home indicator by ADDING the inset to the gap it floats above', () => {
    // The physics did not change when the bar lifted off the edge, only where they are
    // written. On every iPhone since the X the bottom 34px belong to the home indicator,
    // and a bar that used the inset AS its 12px gap sits flush against the very thing it
    // is meant to clear. So it is `0.75rem + env(...)`, an add and never a substitute.
    render(<ParentTabBar active="home" locale="he" />)
    expect(screen.getByTestId('tab-bar').className).toMatch(
      /bottom-\[calc\(0\.75rem\+env\(safe-area-inset-bottom/,
    )
  })

  it('puts the capsule under the active tab, and nowhere when no tab is active', () => {
    // Placed off the active INDEX against five equal columns: טכניקות is fourth, so 60%.
    // A route outside the bar renders no capsule rather than parking it under בית and
    // claiming a screen nobody is on.
    const { rerender } = render(<ParentTabBar active="techniques" locale="he" />)
    expect(screen.getByTestId('tab-indicator')).toHaveStyle({ insetInlineStart: '60%' })
    rerender(<ParentTabBar active={null} locale="he" />)
    expect(screen.queryByTestId('tab-indicator')).toBeNull()
  })

  it('fills the active glyph, and fills the judo mark only at its heads', () => {
    // The four lucide marks are closed outlines and take `fill-current` whole. The judo
    // glyph is two figures joined by four OPEN strokes: filled whole it closes against the
    // viewBox and the throw becomes a blot, so only its two heads take the fill.
    const { rerender } = render(<ParentTabBar active="home" locale="he" />)
    expect(screen.getByTestId('tab-home').querySelector('svg')?.getAttribute('class')).toMatch(
      /fill-current/,
    )

    rerender(<ParentTabBar active="techniques" locale="he" />)
    const judo = screen.getByTestId('tab-techniques').querySelector('svg')
    expect(judo?.getAttribute('class')).not.toMatch(/fill-current/)
    const filled = [...(judo?.querySelectorAll('[fill="currentColor"]') ?? [])]
    expect(filled).toHaveLength(2)
    expect(filled.every((node) => node.tagName.toLowerCase() === 'circle')).toBe(true)
    // and the limbs are still strokes, not fills
    expect(judo?.querySelectorAll('path[fill="currentColor"]')).toHaveLength(0)
  })

  it('leaves the judo mark hollow while it is idle', () => {
    render(<ParentTabBar active="home" locale="he" />)
    const judo = screen.getByTestId('tab-techniques').querySelector('svg')
    expect(judo?.querySelectorAll('[fill="currentColor"]')).toHaveLength(0)
  })

  it('carries the unread count in the accessible name, not only in the mark', () => {
    // Deviation 3. A bare numeral beside a word is read as "עדכונים 2" only by luck of
    // source order, and says nothing about what the 2 counts.
    render(<ParentTabBar active="home" locale="he" updatesBadgeCount={2} />)
    const link = screen.getByTestId('tab-updates')
    expect(link).toHaveAttribute('aria-label', `${t('he', 'common.tabs.parentUpdates')} 2`)
    expect(screen.getByTestId('tab-updates-badge')).toHaveAttribute('aria-hidden', 'true')
  })

  it('caps the badge at 99+ so one slot cannot squeeze the other four', () => {
    render(<ParentTabBar active="home" locale="he" updatesBadgeCount={140} />)
    expect(screen.getByTestId('tab-updates-badge')).toHaveTextContent('99+')
  })

  it('renders no badge at all for an empty inbox', () => {
    // A badge permanently showing zero stops meaning anything.
    render(<ParentTabBar active="home" locale="he" updatesBadgeCount={0} />)
    expect(screen.queryByTestId('tab-updates-badge')).toBeNull()
  })
})
