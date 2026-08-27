// Parent artboard 1a — the BASE home, 390×844, light and dark.
//
// The design pass reshaped this file to the artboard's own order: alert cards, lessons
// grouped by day, child filter chips. The tab bar moved to the App shell (1a draws it on
// every screen), so its tests live beside the shell now. 2a (day strip, past attendance)
// is still deliberately unbuilt — the last test keeps it from creeping in.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import type { ResolvedTheme } from '@studio/ui'
import { ParentHome } from './ParentHome'

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
    render(<ParentHome locale="he" />)
    expect(screen.getByTestId('parent-home-settings')).toHaveAccessibleName()
  })

  it('raises the debt alert with its CTA when the family owes money', async () => {
    // 1a's debt card — the one alert the mounted §6.1 gate does not already own.
    render(<ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} debtAgorot={32000} />)
    const card = screen.getByTestId('parent-home-debt')
    expect(card).toHaveTextContent(t('he', 'common.home.debt.title'))
    expect(screen.getByRole('button', { name: t('he', 'common.home.debt.cta') })).toBeInTheDocument()
    expect(screen.queryByTestId('parent-home-no-alerts')).toBeNull()
  })

  it('says nothing needs attention when nothing does', () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={[]} />)
    expect(screen.getByTestId('parent-home-no-alerts')).toHaveTextContent(
      t('he', 'common.home.noAlerts'),
    )
  })

  it('groups the lessons by day with the studio-zone time on each card', () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} />)
    const rows = screen.getAllByTestId('parent-home-lesson')
    expect(rows).toHaveLength(2)
    // 14:00Z on 2026-08-30 is 17:00 in Asia/Jerusalem (IDT) — G3's rendering rule.
    expect(rows[0]).toHaveTextContent('17:00')
    expect(rows[0]).toHaveTextContent('נועה לוי')
    // Two different days → two day headers.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
  })

  it('filters the lessons through the child chips, and releases on a second tap', async () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} />)
    const chips = screen.getAllByTestId('parent-home-child')
    expect(chips).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'נועה לוי' }))
    expect(screen.getAllByTestId('parent-home-lesson')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'נועה לוי' }))
    expect(screen.getAllByTestId('parent-home-lesson')).toHaveLength(2)
  })

  it('tells a parent with no children why the screen is empty', () => {
    render(<ParentHome locale="he" students={[]} upcoming={[]} />)
    expect(screen.getByText(t('he', 'common.home.noChildren'))).toBeInTheDocument()
  })

  it('explains an empty week rather than showing a blank box', () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={[]} />)
    expect(screen.getByText(t('he', 'common.home.noUpcoming'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.home.noUpcomingWeek'))).toBeInTheDocument()
  })

  it.each(DIRECTIONS)('renders in $locale ($dir) with no physical CSS', ({ locale }) => {
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

  it('builds 2a: a seven-day strip with today marked for a screen reader', () => {
    // The guard that used to sit here kept 2a OUT; the feature pass built it
    // deliberately, so the guard flips into a spec.
    render(<ParentHome locale="he" students={CHILDREN} upcoming={[]} />)
    const strip = screen.getByTestId('parent-day-strip')
    const days = within(strip).getAllByRole('button')
    expect(days).toHaveLength(7)
    expect(days.filter((day) => day.getAttribute('aria-current') === 'date')).toHaveLength(1)
  })

  it("shows a past day's lessons with what actually happened, per child", async () => {
    // 2a — "כולל נוכחות שהייתה". A lesson yesterday, one child present.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const lesson = { id: 'past1', startsAt: yesterday.toISOString(), groupName: 'מתחילים' }
    render(
      <ParentHome
        locale="he"
        students={CHILDREN}
        upcoming={[lesson]}
        attendance={[{ session_id: 'past1', student_id: 'st1', status: 'present' }]}
      />,
    )
    const strip = screen.getByTestId('parent-day-strip')
    const days = within(strip).getAllByRole('button')
    const todayIndex = days.findIndex((day) => day.getAttribute('aria-current') === 'date')
    await userEvent.click(days[todayIndex - 1]!)
    const mark = screen.getByTestId('home-attendance-mark')
    expect(mark).toHaveTextContent('נועה לוי')
    expect(mark).toHaveTextContent(t('he', 'attendance.roster.present'))
  })
})
