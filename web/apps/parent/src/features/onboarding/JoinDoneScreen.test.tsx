import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { JoinDoneScreen } from './JoinDoneScreen'

const rows = [
  { studentId: 'st1', displayName: 'דנה', method: 'card' as const, amountAgorot: 30_000 },
  { studentId: 'st2', displayName: 'יואב', method: 'cash' as const, amountAgorot: 25_000 },
  {
    studentId: 'st3',
    displayName: 'נועה',
    method: 'standing_order' as const,
    amountAgorot: 40_000,
  },
]

describe('JoinDoneScreen', () => {
  it('lists every child with a checkmark, regardless of method', () => {
    render(
      <JoinDoneScreen
        locale="he"
        rows={rows}
        onEnterApp={vi.fn()}
        flushing={false}
        flushError={null}
      />,
    )
    for (const row of rows) {
      expect(screen.getByTestId(`join-done-row-${row.studentId}`)).toBeInTheDocument()
    }
  })

  it('does not render any row with a pending/lesser status tone', () => {
    render(
      <JoinDoneScreen
        locale="he"
        rows={rows}
        onEnterApp={vi.fn()}
        flushing={false}
        flushError={null}
      />,
    )
    expect(document.querySelector('[data-status="pending"]')).toBeNull()
    expect(document.querySelector('[data-status="cancelled"]')).toBeNull()
  })

  it('calls onEnterApp when the button is pressed', async () => {
    const user = userEvent.setup()
    const onEnterApp = vi.fn()
    render(
      <JoinDoneScreen
        locale="he"
        rows={rows}
        onEnterApp={onEnterApp}
        flushing={false}
        flushError={null}
      />,
    )
    await user.click(screen.getByTestId('join-done-enter'))
    expect(onEnterApp).toHaveBeenCalledTimes(1)
  })

  it('disables the button and shows the error while flushing/failed', () => {
    render(
      <JoinDoneScreen
        locale="he"
        rows={rows}
        onEnterApp={vi.fn()}
        flushing={true}
        flushError={t('he', 'people.join.done.flushFailed')}
      />,
    )
    expect(screen.getByTestId('join-done-enter')).toBeDisabled()
    expect(screen.getByText(t('he', 'people.join.done.flushFailed'))).toBeInTheDocument()
  })

  it('shows a nothing-owed message when there are no rows', () => {
    render(
      <JoinDoneScreen locale="he" rows={[]} onEnterApp={vi.fn()} flushing={false} flushError={null} />,
    )
    expect(screen.getByText(t('he', 'people.join.done.nothingOwed'))).toBeInTheDocument()
  })
})
