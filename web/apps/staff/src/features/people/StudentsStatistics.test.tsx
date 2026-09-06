// Staff 9h's statistics section. See `StudentsStatistics.tsx`'s own header for why this
// exists now, after §9 called the prototype's chart out for inventing seven months of
// numbers: the owner wants the section, built from the roster's real current snapshot.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import {
  ATTENTION_THRESHOLD,
  StudentsStatistics,
  attendanceBars,
  averageAttendance,
  studentsNeedingAttention,
} from './StudentsStatistics'
import type { GroupOut, StudentSummary } from './peopleClient'

const summary = (over: Partial<StudentSummary> = {}): StudentSummary =>
  ({
    id: 'st1',
    person_id: 'p1',
    first_name: 'נועה',
    last_name: 'לוי',
    birthdate: '2019-04-01',
    status: 'active',
    health_status: 'signed',
    joined_on: '2026-09-01',
    left_on: null,
    group_names: ['מתחילים'],
    guardian_display_names: ['יעל לוי'],
    frozen_until: null,
    attendance_percent: null,
    ...over,
  }) as StudentSummary

const GROUPS = [
  { id: 'g1', class_id: 'c1', name: 'מתחילים', description: null, age_min: null, age_max: null, is_active: true },
  { id: 'g2', class_id: 'c1', name: 'נבחרת', description: null, age_min: null, age_max: null, is_active: true },
] as unknown as GroupOut[]

const noPhysicalCss = (container: HTMLElement) => {
  for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
    expect(node.getAttribute('style') ?? '').not.toMatch(
      /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
    )
  }
}

// -- pure computations ------------------------------------------------------------------

describe('averageAttendance', () => {
  it('averages over MARKED students only, ignoring ones never taken', () => {
    const result = averageAttendance([
      summary({ id: 's1', attendance_percent: 80 }),
      summary({ id: 's2', attendance_percent: 60 }),
      summary({ id: 's3', attendance_percent: null }),
    ])
    expect(result).toEqual({ average: 70, markedCount: 2 })
  })

  it('is null, not zero, when nobody has been marked yet', () => {
    expect(averageAttendance([summary({ attendance_percent: null })])).toEqual({
      average: null,
      markedCount: 0,
    })
  })

  it('rounds', () => {
    const result = averageAttendance([
      summary({ id: 's1', attendance_percent: 100 }),
      summary({ id: 's2', attendance_percent: 99 }),
      summary({ id: 's3', attendance_percent: 99 }),
    ])
    expect(result.average).toBe(99) // 99.33.. rounds down, not up
  })
})

describe('attendanceBars', () => {
  it('leads with a whole-club bar, then one bar per group with marked students', () => {
    const bars = attendanceBars(
      [
        summary({ id: 's1', group_names: ['מתחילים'], attendance_percent: 80 }),
        summary({ id: 's2', group_names: ['נבחרת'], attendance_percent: 100 }),
      ],
      GROUPS,
    )
    expect(bars.map((b) => b.key)).toEqual(['all', 'g1', 'g2'])
    expect(bars[0]!.value).toBe(90) // (80 + 100) / 2
    expect(bars[1]!.value).toBe(80)
    expect(bars[2]!.value).toBe(100)
  })

  it('draws no bar for a group with nobody marked — nothing to report, not a zero', () => {
    const bars = attendanceBars(
      [summary({ id: 's1', group_names: ['מתחילים'], attendance_percent: 80 })],
      GROUPS,
    )
    expect(bars.map((b) => b.key)).toEqual(['all', 'g1'])
  })

  it('counts a student toward every group they train in — the same multi-group truth S8 renders', () => {
    const bars = attendanceBars(
      [summary({ id: 's1', group_names: ['מתחילים', 'נבחרת'], attendance_percent: 60 })],
      GROUPS,
    )
    expect(bars.find((b) => b.groupId === 'g1')!.value).toBe(60)
    expect(bars.find((b) => b.groupId === 'g2')!.value).toBe(60)
  })

  it('is empty when nobody anywhere has been marked', () => {
    expect(attendanceBars([summary({ attendance_percent: null })], GROUPS)).toEqual([])
  })
})

describe('studentsNeedingAttention', () => {
  it('counts below-threshold and missing-health separately', () => {
    const result = studentsNeedingAttention(
      [
        summary({ id: 's1', attendance_percent: 40, health_status: 'signed' }),
        summary({ id: 's2', attendance_percent: 90, health_status: 'missing' }),
        summary({ id: 's3', attendance_percent: 90, health_status: 'signed' }),
      ],
      ATTENTION_THRESHOLD,
    )
    expect(result.belowThreshold).toBe(1)
    expect(result.missingHealth).toBe(1)
    expect(result.total).toBe(2)
  })

  it('counts a student who is BOTH once, in the union total', () => {
    const result = studentsNeedingAttention(
      [summary({ id: 's1', attendance_percent: 40, health_status: 'missing' })],
      ATTENTION_THRESHOLD,
    )
    expect(result.belowThreshold).toBe(1)
    expect(result.missingHealth).toBe(1)
    expect(result.total).toBe(1)
  })

  it('never marked is not "below" — an unmarked student is not a failing one', () => {
    const result = studentsNeedingAttention(
      [summary({ id: 's1', attendance_percent: null, health_status: 'signed' })],
      ATTENTION_THRESHOLD,
    )
    expect(result.belowThreshold).toBe(0)
    expect(result.total).toBe(0)
  })
})

// -- the component ------------------------------------------------------------------------

describe('StudentsStatistics', () => {
  beforeEach(() => globalThis.localStorage?.clear())

  const STUDENTS = [
    summary({ id: 's1', group_names: ['מתחילים'], attendance_percent: 80, health_status: 'signed' }),
    summary({ id: 's2', group_names: ['נבחרת'], attendance_percent: 60, health_status: 'missing' }),
  ]

  it('shows the club average and how many students it is over', () => {
    render(
      <StudentsStatistics
        locale="he"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={() => {}}
      />,
    )
    expect(screen.getByTestId('stats-club-average')).toHaveTextContent('70%')
    expect(screen.getByText(t('he', 'people.stats.clubAverageOf').replace('{{count}}', '2'))).toBeInTheDocument()
  })

  it('gives the chart a text equivalent — every bar value is real, visible text', () => {
    render(
      <StudentsStatistics
        locale="he"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={() => {}}
      />,
    )
    expect(screen.getByTestId('stats-bar-value-g1')).toHaveTextContent('80%')
    expect(screen.getByTestId('stats-bar-value-g2')).toHaveTextContent('60%')
    expect(screen.getByTestId('stats-bar-value-all')).toHaveTextContent('70%')
    // The decorative fill duplicates the same value and carries no information on its own.
    const chart = screen.getByTestId('stats-bar-chart')
    for (const fill of chart.querySelectorAll('[aria-hidden="true"]')) {
      expect(fill).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('reports below-threshold and missing-health counts, not invented ones', () => {
    render(
      <StudentsStatistics
        locale="he"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={() => {}}
      />,
    )
    // s2 is 60% (< 80 threshold) AND missing health — one student, union of one.
    expect(screen.getByTestId('stats-need-attention-count')).toHaveTextContent('1')
    expect(screen.getByTestId('stats-need-attention-breakdown')).toHaveTextContent(
      t('he', 'people.stats.needAttentionBreakdown')
        .replace('{{below}}', '1')
        .replace('{{threshold}}', String(ATTENTION_THRESHOLD))
        .replace('{{missing}}', '1'),
    )
  })

  it('states the scope in the footer — a current snapshot, not a history', () => {
    render(
      <StudentsStatistics
        locale="he"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={() => {}}
      />,
    )
    expect(screen.getByTestId('stats-footer')).toHaveTextContent(t('he', 'people.stats.footer'))
  })

  it("the chips ARE the list's own group filter — clicking one calls the shared setter", async () => {
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(
      <StudentsStatistics
        locale="he"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={onSelectGroup}
      />,
    )
    expect(screen.getByTestId('stats-chip-all')).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByTestId('stats-chip-g2'))
    expect(onSelectGroup).toHaveBeenCalledWith('g2')
  })

  it('reflects the externally-selected group as pressed and highlighted', () => {
    render(
      <StudentsStatistics
        locale="he"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId="g2"
        onSelectGroup={() => {}}
      />,
    )
    expect(screen.getByTestId('stats-chip-g2')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('stats-chip-all')).toHaveAttribute('aria-pressed', 'false')
  })

  it('collapses, and remembers it across a remount (reload)', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <StudentsStatistics
        locale="he"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={() => {}}
      />,
    )
    expect(screen.getByTestId('stats-bar-chart')).toBeInTheDocument()
    await user.click(screen.getByTestId('stats-collapse-toggle'))
    expect(screen.queryByTestId('stats-bar-chart')).toBeNull()
    unmount()

    render(
      <StudentsStatistics
        locale="he"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={() => {}}
      />,
    )
    expect(screen.queryByTestId('stats-bar-chart')).toBeNull()
    expect(screen.getByTestId('stats-collapse-toggle')).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows no money of any kind — §3.2, a coach screen', () => {
    render(
      <StudentsStatistics
        locale="he"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={() => {}}
      />,
    )
    expect(document.body.textContent ?? '').not.toContain('₪')
  })

  it('renders no physical CSS', () => {
    const { container } = render(
      <StudentsStatistics
        locale="en"
        students={STUDENTS}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={() => {}}
      />,
    )
    noPhysicalCss(container)
  })

  it('says there is nothing to chart yet rather than an empty chart, when nobody is marked', () => {
    render(
      <StudentsStatistics
        locale="he"
        students={[summary({ attendance_percent: null, health_status: 'missing' })]}
        groups={GROUPS}
        selectedGroupId=""
        onSelectGroup={() => {}}
      />,
    )
    expect(screen.getByTestId('stats-no-data')).toBeInTheDocument()
    expect(screen.getByTestId('stats-club-average')).toHaveTextContent('—')
  })
})
