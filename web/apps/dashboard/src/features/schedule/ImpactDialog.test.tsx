// §5.6's dialog: "showing exactly what will change before it changes."
//
// The test ids here are not free choices — `e2e/05-schedule-change.spec.ts` names them, and
// a rename here silently un-gates E2E-5.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ImpactDialog } from './ImpactDialog'
import type { ImpactPreview } from './client'

const EMPTY: ImpactPreview = {
  sessions_to_create: 0,
  sessions_to_update: 0,
  sessions_to_cancel: 0,
  sessions_protected_past: 0,
  sessions_protected_manually_edited: 0,
  sessions_protected_ad_hoc: 0,
  first_affected_date: null,
  protected_manually_edited_sessions: [],
  students_left_unscheduled: 0,
}

const FULL: ImpactPreview = {
  ...EMPTY,
  sessions_to_create: 4,
  sessions_to_update: 32,
  sessions_to_cancel: 1,
  sessions_protected_past: 18,
  sessions_protected_manually_edited: 2,
  sessions_protected_ad_hoc: 1,
  first_affected_date: '2026-11-17',
  protected_manually_edited_sessions: [
    { id: 'a', starts_at: '2026-11-15T16:00:00Z', ends_at: '2026-11-15T17:30:00Z' },
    { id: 'b', starts_at: '2026-11-22T16:00:00Z', ends_at: '2026-11-22T18:00:00Z' },
  ],
  students_left_unscheduled: 3,
}

function renderDialog(preview: ImpactPreview, props: Record<string, unknown> = {}) {
  return render(
    <ImpactDialog locale="he" preview={preview} onConfirm={vi.fn()} onCancel={vi.fn()} {...props} />,
  )
}

describe('ImpactDialog', () => {
  it('says the change applies only to future sessions, in the exact words E2E-5 asserts', () => {
    renderDialog(FULL)
    expect(screen.getByTestId('impact-subtitle')).toHaveTextContent(
      'השינוי יחול על שיעורים עתידיים בלבד',
    )
  })

  it('names the three protections separately rather than summing them', () => {
    // "12 sessions will change" tells a manager nothing about whether last month survived.
    renderDialog(FULL)
    expect(screen.getByTestId('protected-past')).toHaveTextContent('18')
    expect(screen.getByTestId('protected-manual')).toHaveTextContent('2')
    expect(screen.getByTestId('protected-adhoc')).toHaveTextContent('1')
  })

  it('lists the manually edited sessions by date, not merely by count', () => {
    renderDialog(FULL)
    const listed = screen.getAllByTestId('protected-manual-session')
    expect(listed).toHaveLength(2)
    // 16:00Z on 15 November is 18:00 in Jerusalem — winter, UTC+2.
    expect(listed[0]).toHaveTextContent('18:00')
  })

  it('shows the first affected date', () => {
    renderDialog(FULL)
    expect(screen.getByTestId('first-affected-date')).toBeVisible()
  })

  it('warns about C12 with the count of students left with no day', () => {
    // C12 — the failure the dialog exists to prevent, arriving from the other direction.
    renderDialog(FULL)
    const warning = screen.getByTestId('students-unscheduled')
    expect(warning).toHaveTextContent('3')
    expect(warning).toHaveTextContent(t('he', 'schedule.impact.studentsUnscheduledHint'))
  })

  it('uses the singular sentence for exactly one stranded student', () => {
    renderDialog({ ...FULL, students_left_unscheduled: 1 })
    expect(screen.getByTestId('students-unscheduled')).toHaveTextContent(
      t('he', 'schedule.impact.studentsUnscheduledOne'),
    )
  })

  it('shows no C12 warning when nobody is stranded', () => {
    renderDialog({ ...FULL, students_left_unscheduled: 0 })
    expect(screen.queryByTestId('students-unscheduled')).toBeNull()
  })

  it('gives the warning icon an accessible name rather than a bare glyph', () => {
    // A ⚠ inside a translated sentence is invisible to a screen reader, which is why the
    // string carries no glyph and the Alert primitive supplies the icon.
    renderDialog(FULL)
    expect(
      screen.getByLabelText(t('he', 'schedule.impact.studentsUnscheduledIcon')),
    ).toBeInTheDocument()
  })

  it('says plainly when nothing changes, instead of showing four zeroes', () => {
    renderDialog(EMPTY)
    expect(screen.getByText(t('he', 'schedule.impact.nothingChanges'))).toBeInTheDocument()
  })

  it('still names the protections when nothing changes', () => {
    // The manager pressed the button to find out what is at risk. Hiding the protections
    // on a no-op change answers a different question from the one they asked.
    renderDialog(EMPTY)
    expect(screen.getByTestId('protected-past')).toBeInTheDocument()
  })

  it('confirms and cancels through the callbacks', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    renderDialog(FULL, { onConfirm, onCancel })
    await userEvent.click(screen.getByTestId('confirm'))
    expect(onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByTestId('impact-cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('is a dialog with an accessible name', () => {
    renderDialog(FULL)
    expect(screen.getByRole('dialog')).toHaveAccessibleName(t('he', 'schedule.impact.title'))
  })

  it('disables confirm while the change is being applied', () => {
    // Double-submitting a rewrite of a training year is not an operation with a sane
    // second outcome.
    renderDialog(FULL, { busy: true })
    expect(screen.getByTestId('confirm')).toBeDisabled()
  })

  it('renders every count in en as well as he', () => {
    render(
      <ImpactDialog locale="en" preview={FULL} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByTestId('impact-subtitle')).toHaveTextContent(
      t('en', 'schedule.impact.subtitle'),
    )
  })

  it('uses no physical CSS properties', () => {
    const { container } = renderDialog(FULL)
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
