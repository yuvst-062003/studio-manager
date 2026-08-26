// Parent artboard 1a — the BASE home, 390×844, light and dark.
//
// 2a (the day strip and past attendance) is M5's and must NOT appear here. The last test
// in this file is what keeps it from creeping in.
//
// The W0-W6 ship audit's B4 retired this file's W1 assumptions: the home now renders the
// REAL children (`/me/students` has named them since M3) and the next lessons, and the
// tab bar navigates — a shipped home that said "ייפתחו בהמשך" over working screens was
// scaffolding nobody removed.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import type { ResolvedTheme } from '@studio/ui'
import { ParentHome, TAB_ROUTES, TABS } from './ParentHome'

// @studio/ui's own `testing.tsx` is deliberately NOT exported from the package: it pulls
// in @testing-library/react, which must never reach an app bundle, and a subpath export
// would be one stray import away from putting it there. The matrix is small enough to
// restate through the package's real exports.
const DIRECTIONS = [
  { locale: 'he', dir: 'rtl' },
  { locale: 'en', dir: 'ltr' },
] as const satisfies readonly { locale: Locale; dir: 'rtl' | 'ltr' }[]

const THEMES = ['light', 'dark'] as const

const CHILDREN = [
  { id: 'st1', displayName: 'נועה לוי', groupNames: ['מתחילים'] },
  { id: 'st2', displayName: 'איתי לוי', groupNames: ['מתקדמים', 'נבחרת'] },
]

const LESSONS = [
  { id: 'se1', startsAt: '2026-08-30T14:00:00Z', groupName: 'מתחילים' },
  { id: 'se2', startsAt: '2026-09-01T14:00:00Z', groupName: 'מתקדמים' },
]

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

  it('renders all four tabs 1a draws, each routing to a real screen', () => {
    // Ship-audit B4: the shipped tab bar had payments, messages and profile DISABLED
    // under 'ייפתחו בהמשך' — while the payments screen was the subject of two green E2E
    // flows. A tab is a link now, and a link needs somewhere real to go.
    render(<ParentHome locale="he" />)
    for (const tab of TABS) {
      const link = screen.getByTestId(`parent-tab-${tab}`)
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', TAB_ROUTES[tab])
    }
  })

  it('marks the active tab for a screen reader too', () => {
    render(<ParentHome locale="he" />)
    expect(screen.getByTestId('parent-tab-home')).toHaveAttribute('aria-current', 'page')
  })

  it('tells a parent with no children why the screen is empty', () => {
    render(<ParentHome locale="he" students={[]} />)
    expect(screen.getByText(t('he', 'common.home.noChildren'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.home.childrenComeLater'))).toBeInTheDocument()
  })

  it('renders a chip per child, named and carrying their groups', () => {
    // The W1 home could not name a child (`student` was M3's table) and said so honestly.
    // M3 landed five waves ago; `/me/students` names them, so the home must too.
    render(<ParentHome locale="he" students={CHILDREN} />)
    const chips = screen.getAllByTestId('parent-home-child')
    expect(chips).toHaveLength(2)
    expect(chips[0]).toHaveTextContent('נועה לוי')
    expect(chips[1]).toHaveTextContent('מתקדמים')
    expect(chips[1]).toHaveTextContent('נבחרת')
  })

  it('lists the next lessons with the group and the studio-zone time', () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} />)
    const rows = screen.getAllByTestId('parent-home-lesson')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('מתחילים')
    // 14:00Z on 2026-08-30 is 17:00 in Asia/Jerusalem (IDT) — G3's rendering rule, and
    // the assertion that catches a formatter quietly using the runner's zone.
    expect(rows[0]).toHaveTextContent('17:00')
  })

  it('explains an empty week rather than showing a blank box', () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={[]} />)
    expect(screen.getByText(t('he', 'common.home.noUpcoming'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.home.noUpcomingWeek'))).toBeInTheDocument()
  })

  it('says nothing needs attention rather than showing an empty alerts area', () => {
    render(<ParentHome locale="he" />)
    expect(screen.getByTestId('parent-home-no-alerts')).toHaveTextContent(
      t('he', 'common.home.noAlerts'),
    )
  })

  it.each(DIRECTIONS)('renders in $locale ($dir) with no physical CSS', ({ locale }) => {
    // SPEC §9 — genuinely bidirectional, not RTL-only with LTR bolted on.
    const { container } = renderIn(<ParentHome locale={locale} students={CHILDREN} upcoming={LESSONS} />, { locale })
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
    render(<ParentHome locale="he" students={CHILDREN} />)
    expect(screen.queryByTestId('parent-day-strip')).toBeNull()
    expect(screen.queryByTestId('parent-past-attendance')).toBeNull()
  })
})
