// Parent artboard 1a — the BASE home, 390×844, light and dark.
//
// 2a (the day strip and past attendance) is M5's and must NOT appear here. The last test
// in this file is what keeps it from creeping in.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import type { ResolvedTheme } from '@studio/ui'
import { ParentHome, TABS } from './ParentHome'

// @studio/ui's own `testing.tsx` is deliberately NOT exported from the package: it pulls
// in @testing-library/react, which must never reach an app bundle, and a subpath export
// would be one stray import away from putting it there. The matrix is small enough to
// restate through the package's real exports.
const DIRECTIONS = [
  { locale: 'he', dir: 'rtl' },
  { locale: 'en', dir: 'ltr' },
] as const satisfies readonly { locale: Locale; dir: 'rtl' | 'ltr' }[]

const THEMES = ['light', 'dark'] as const

function renderIn(
  ui: ReactElement,
  { locale = 'he', theme = 'light' }: { locale?: Locale; theme?: ResolvedTheme } = {},
) {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  document.documentElement.lang = locale
  document.documentElement.dir = DIRECTION[locale]
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

describe('ParentHome', () => {
  it('renders 1a title', () => {
    render(<ParentHome locale="he" />)
    expect(screen.getByRole('heading', { level: 1, name: t('he', 'common.home.title') })).toBeInTheDocument()
  })

  it('gives the settings affordance an accessible name', () => {
    // 1a draws a gear. An icon-only control with no name is unreachable to a screen
    // reader (.claude/rules/ui-rtl-a11y.md).
    render(<ParentHome locale="he" />)
    expect(screen.getByTestId('parent-home-settings')).toHaveAccessibleName()
  })

  it('renders all four tabs 1a draws', () => {
    render(<ParentHome locale="he" />)
    for (const tab of TABS) {
      expect(screen.getByTestId(`parent-tab-${tab}`)).toBeInTheDocument()
    }
  })

  it('disables the three tabs later milestones open, and says so', () => {
    // A tab that navigates to a blank screen is worse than one that is visibly not ready.
    render(<ParentHome locale="he" />)
    expect(screen.getByTestId('parent-tab-home')).toBeEnabled()
    expect(screen.getByTestId('parent-tab-payments')).toBeDisabled()
    expect(screen.getByTestId('parent-tab-messages')).toBeDisabled()
    expect(screen.getByTestId('parent-tab-profile')).toBeDisabled()
    expect(screen.getByTestId('parent-tabs-note')).toHaveTextContent(
      t('he', 'common.home.tabsComeLater'),
    )
  })

  it('marks the active tab for a screen reader too', () => {
    render(<ParentHome locale="he" />)
    expect(screen.getByTestId('parent-tab-home')).toHaveAttribute('aria-current', 'page')
  })

  it('tells a parent with no children why the screen is empty', () => {
    render(<ParentHome locale="he" hasChildren={false} />)
    expect(screen.getByText(t('he', 'common.home.noChildren'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.home.childrenComeLater'))).toBeInTheDocument()
  })

  it('never invents a child name or a count', () => {
    // §6.1's query is EXISTS(guardian ...), and guardian.student_id has no FK because
    // `student` is M3's table. A rendered '1 child' would be a fabrication.
    render(<ParentHome locale="he" hasChildren />)
    expect(screen.getByTestId('parent-home-children-pending')).toHaveTextContent(
      t('he', 'common.home.childrenComeLater'),
    )
  })

  it('explains the empty lesson list rather than showing a blank box', () => {
    render(<ParentHome locale="he" />)
    expect(screen.getByText(t('he', 'common.home.noUpcoming'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.home.upcomingComeLater'))).toBeInTheDocument()
  })

  it('says nothing needs attention rather than showing an empty alerts area', () => {
    render(<ParentHome locale="he" />)
    expect(screen.getByTestId('parent-home-no-alerts')).toHaveTextContent(
      t('he', 'common.home.noAlerts'),
    )
  })

  it('calls back when a tab is chosen', async () => {
    const onSelectTab = vi.fn()
    render(<ParentHome locale="he" onSelectTab={onSelectTab} />)
    await userEvent.click(screen.getByTestId('parent-tab-home'))
    expect(onSelectTab).toHaveBeenCalledWith('home')
  })

  it.each(DIRECTIONS)('renders in $locale ($dir) with no physical CSS', ({ locale }) => {
    // SPEC §9 — genuinely bidirectional, not RTL-only with LTR bolted on.
    const { container } = renderIn(<ParentHome locale={locale} />, { locale })
    const styles = [...container.querySelectorAll<HTMLElement>('[style]')].map(
      (node) => node.getAttribute('style') ?? '',
    )
    for (const style of styles) {
      expect(style).not.toMatch(/margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/)
    }
  })

  it.each(THEMES)('renders in %s, per 1a being drawn בהיר + כהה', (theme) => {
    const { container } = renderIn(<ParentHome locale="he" />, { theme })
    expect(container.querySelector('[data-testid="parent-home"]')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', theme)
  })

  it('does NOT build 2a — no day strip and no past attendance', () => {
    // The milestone plan: '1a is the base parent home; 2a — the same screen enriched with
    // the day strip and past attendance — belongs to M5.' Building them here would take
    // M5's work into a wave whose contract has no `session` or `attendance` table.
    render(<ParentHome locale="he" hasChildren />)
    expect(screen.queryByTestId('parent-day-strip')).toBeNull()
    expect(screen.queryByTestId('parent-past-attendance')).toBeNull()
  })
})
