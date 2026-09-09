// הכנסות לפי חוג, and the one number on it that could quietly lie.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { ByClassPanel } from './ByClassPanel'
import type { ClassMonthRow } from './client'

const LOCALE = 'he' as const

function row(overrides: Partial<ClassMonthRow>): ClassMonthRow {
  return {
    class_id: 'c1',
    class_name: "ג'ודו",
    students: 1,
    total_agorot: 0,
    settled_agorot: 0,
    overdue_agorot: 0,
    pending_agorot: 0,
    ...overrides,
  }
}

describe('ByClassPanel', () => {
  it('lists a line per class', () => {
    render(
      <ByClassPanel
        locale={LOCALE}
        rows={[
          row({ class_id: 'c-judo', class_name: "ג'ודו", students: 42, total_agorot: 1_344_000 }),
          row({ class_id: 'c-karate', class_name: 'קראטה', students: 18, total_agorot: 396_000 }),
        ]}
        total={row({ class_id: null, class_name: null, students: 60, total_agorot: 1_740_000 })}
      />,
    )
    expect(screen.getByText("ג'ודו")).toBeInTheDocument()
    expect(screen.getByText('קראטה')).toBeInTheDocument()
  })

  it('renders the SERVER total, never the sum of the rows', () => {
    // The load-bearing assertion. A child billed for judo AND karate is one human in two
    // rows: 1 + 1 = 2 rows, one student. Rendering the sum would overstate membership by
    // exactly the multi-class families per-class pricing created.
    render(
      <ByClassPanel
        locale={LOCALE}
        rows={[
          row({ class_id: 'c-judo', class_name: "ג'ודו", students: 1, total_agorot: 32_000 }),
          row({ class_id: 'c-karate', class_name: 'קראטה', students: 1, total_agorot: 22_000 }),
        ]}
        total={row({ class_id: null, class_name: null, students: 1, total_agorot: 54_000 })}
      />,
    )
    expect(screen.getByTestId('by-class-total-students')).toHaveTextContent('1')
    expect(screen.getByTestId('by-class-total-students')).not.toHaveTextContent('2')
    // Money DOES add up — two charges are two real amounts.
    expect(screen.getByTestId('by-class-total-money')).toHaveTextContent('540')
  })

  it('names the unassigned bucket rather than drawing a dash', () => {
    // Registration fees, manual charges and every pre-2026-09-09 tuition charge land here.
    // Hidden, they would leave the rows visibly failing to reach the total.
    render(
      <ByClassPanel
        locale={LOCALE}
        rows={[
          row({ class_id: 'c-judo', class_name: "ג'ודו", total_agorot: 32_000 }),
          row({ class_id: null, class_name: null, students: 1, total_agorot: 5_000 }),
        ]}
        total={row({ class_id: null, class_name: null, students: 2, total_agorot: 37_000 })}
      />,
    )
    expect(screen.getByTestId('by-class-unassigned')).toHaveTextContent(
      t(LOCALE, 'reports.byClass.unassigned'),
    )
  })

  it('says a month with no charges is empty, and prints no total for it', () => {
    render(
      <ByClassPanel
        locale={LOCALE}
        rows={[]}
        total={row({ class_id: null, class_name: null, students: 0, total_agorot: 0 })}
      />,
    )
    expect(screen.getByText(t(LOCALE, 'reports.byClass.empty'))).toBeInTheDocument()
    // A "סה״כ 0" under an empty table is noise, not information.
    expect(screen.queryByTestId('by-class-total')).not.toBeInTheDocument()
  })
})
