import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { StaffTabBar } from './StaffTabBar'

describe('StaffTabBar', () => {
  it('renders all five tabs with their Hebrew labels and correct hrefs', () => {
    render(<StaffTabBar active="schedule" locale="he" />)

    const expected: Array<[string, string, string]> = [
      ['schedule', '#/schedule', 'common.tabs.staffSchedule'],
      ['students', '#/students', 'common.tabs.staffStudents'],
      ['timer', '#/timer', 'common.tabs.staffTimer'],
      ['tasks', '#/tasks', 'common.tabs.staffTasks'],
      ['account', '#/account', 'common.tabs.staffAccount'],
    ]

    for (const [tab, href, key] of expected) {
      const link = screen.getByTestId(`tab-${tab}`)
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveTextContent(t('he', key))
    }
  })

  it("carries the bar's accessible name", () => {
    render(<StaffTabBar active="schedule" locale="he" />)
    expect(screen.getByRole('navigation', { name: t('he', 'common.tabs.staffBarLabel') })).toBeInTheDocument()
  })

  it('marks the active tab current and leaves the rest unmarked', () => {
    render(<StaffTabBar active="students" locale="he" />)
    expect(screen.getByTestId('tab-students')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('tab-schedule')).not.toHaveAttribute('aria-current')
  })

  it('shows no badge on the tasks tab when the count is zero', () => {
    render(<StaffTabBar active="schedule" locale="he" tasksBadgeCount={0} />)
    expect(screen.queryByTestId('tab-tasks-badge')).not.toBeInTheDocument()
    expect(screen.getByTestId('tab-tasks')).not.toHaveAttribute('aria-label')
  })

  it('shows the count on the tasks badge and folds it into the accessible name', () => {
    render(<StaffTabBar active="schedule" locale="he" tasksBadgeCount={3} />)
    expect(screen.getByTestId('tab-tasks-badge')).toHaveTextContent('3')
    // Deviation 3 — the count is part of the name, not only visible in the mark.
    const label = t('he', 'common.tabs.staffTasks')
    expect(screen.getByTestId('tab-tasks')).toHaveAttribute('aria-label', `${label} 3`)
    // The mark itself carries nothing to an accessibility tree — it would otherwise be
    // announced a second time alongside the link's own aria-label.
    expect(screen.getByTestId('tab-tasks-badge')).toHaveAttribute('aria-hidden', 'true')
  })

  it('caps the tasks badge at 99+ instead of growing past it', () => {
    render(<StaffTabBar active="schedule" locale="he" tasksBadgeCount={140} />)
    expect(screen.getByTestId('tab-tasks-badge')).toHaveTextContent('99+')
    const label = t('he', 'common.tabs.staffTasks')
    expect(screen.getByTestId('tab-tasks')).toHaveAttribute('aria-label', `${label} 99+`)
  })

  it('goes dark only when the timer tab is active', () => {
    render(<StaffTabBar active="timer" locale="he" />)
    expect(screen.getByTestId('tab-bar').className).toMatch(/bg-\[#090d16\]\/95/)
  })

  it.each(['schedule', 'students', 'tasks', 'account'] as const)(
    'stays light when the active tab is %s, not timer',
    (tab) => {
      render(<StaffTabBar active={tab} locale="he" />)
      const className = screen.getByTestId('tab-bar').className
      expect(className).not.toMatch(/bg-\[#090d16\]\/95/)
      expect(className).toMatch(/bg-white/)
    },
  )

  it('goes light again when nothing is active', () => {
    render(<StaffTabBar active={null} locale="he" />)
    expect(screen.getByTestId('tab-bar').className).not.toMatch(/bg-\[#090d16\]\/95/)
  })

  it("clears the home indicator with env(safe-area-inset-bottom) in the bar's own bottom padding", () => {
    render(<StaffTabBar active="schedule" locale="he" />)
    const className = screen.getByTestId('tab-bar').className
    expect(className).toMatch(/pb-\[calc\([^)]*env\(safe-area-inset-bottom/)
  })
})
