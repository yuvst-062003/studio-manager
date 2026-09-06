// FLOW B — the date-range absence report.
//
// The tests that carry weight are the refusals. A range is not a report: it has to be
// resolved to actual lessons before anything is written, and every way that resolution can
// come back empty or wrong is a way a parent ends up believing the club was told.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { MAX_RANGE_DAYS, RangeAbsenceSheet, daysBetween, presetRange, shiftDayKey } from './RangeAbsenceSheet'
import type { HomeChild } from './types'

const CHILDREN: HomeChild[] = [
  { id: 'c1', firstName: 'נועה', displayName: 'נועה כהן', groupNames: ['מתחילים'], beltColorHex: '#f59e0b', beltName: 'צהובה' },
  { id: 'c2', firstName: 'דנה', displayName: 'דנה כהן', groupNames: ['מתקדמים'], beltColorHex: '#10b981', beltName: 'ירוקה' },
]

function sheet(over: Partial<Parameters<typeof RangeAbsenceSheet>[0]> = {}) {
  const onSubmit = vi.fn()
  render(
    <RangeAbsenceSheet
      childList={CHILDREN}
      locale="he"
      todayKey="2026-08-25"
      busy={false}
      outcomes={null}
      notice={null}
      onSubmit={onSubmit}
      onClose={vi.fn()}
      {...over}
    />,
  )
  return onSubmit
}

describe('day-key arithmetic', () => {
  it('counts and shifts at midday, so no offset moves a date', () => {
    // Midnight `2026-08-01` is still 31 July in a negative-offset zone — the same one-day
    // slip `derive.ts` records, arrived at from the other direction.
    expect(shiftDayKey('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-08-25', '2026-09-01')).toBe(7)
    expect(daysBetween('2026-09-01', '2026-08-25')).toBe(-7)
  })

  it('finds the coming Friday for the weekend preset, and Friday itself on a Friday', () => {
    // Israel's weekend is Friday and Saturday. 2026-08-25 is a Tuesday; 2026-08-28 a Friday.
    expect(presetRange('weekend', '2026-08-25')).toEqual(['2026-08-28', '2026-08-29'])
    expect(presetRange('weekend', '2026-08-28')).toEqual(['2026-08-28', '2026-08-29'])
    expect(presetRange('today', '2026-08-25')).toEqual(['2026-08-25', '2026-08-25'])
    expect(presetRange('week', '2026-08-25')).toEqual(['2026-08-25', '2026-08-31'])
  })
})

describe('the range absence sheet', () => {
  it('starts with every child chosen, because that is the common case', async () => {
    const onSubmit = sheet()
    await userEvent.click(screen.getByTestId('range-absence-submit'))
    expect(onSubmit.mock.calls[0]![0].studentIds).toEqual(['c1', 'c2'])
  })

  it('refuses to submit with nobody chosen, and says why', async () => {
    const onSubmit = sheet()
    await userEvent.click(screen.getByTestId('range-absence-toggle-all'))
    expect(screen.getByTestId('range-absence-who-error')).toHaveTextContent(
      t('he', 'attendance.rangeAbsence.whoRequired'),
    )
    await userEvent.click(screen.getByTestId('range-absence-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses a backwards range before it becomes zero writes', async () => {
    const onSubmit = sheet()
    // The end date behind the start is a typo, and the honest answer is the reason rather
    // than a batch that resolves to nothing and reads as an empty week.
    await userEvent.clear(screen.getByLabelText(t('he', 'attendance.rangeAbsence.to')))
    await userEvent.type(screen.getByLabelText(t('he', 'attendance.rangeAbsence.to')), '2026-08-20')
    expect(screen.getByTestId('range-absence-range-error')).toHaveTextContent(
      t('he', 'attendance.rangeAbsence.rangeBackwards'),
    )
    await userEvent.click(screen.getByTestId('range-absence-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses a range longer than six weeks, which is always a typed year', async () => {
    // `2027-08-25` in the "to" field is a year of lessons and a hundred writes, and the
    // parent meant next Tuesday. Accepting it is the accepted-then-wrong the register warns
    // about; a refusal that names the limit costs one round trip.
    const onSubmit = sheet()
    await userEvent.clear(screen.getByLabelText(t('he', 'attendance.rangeAbsence.to')))
    await userEvent.type(screen.getByLabelText(t('he', 'attendance.rangeAbsence.to')), '2027-08-25')
    expect(screen.getByTestId('range-absence-range-error')).toHaveTextContent(
      String(MAX_RANGE_DAYS),
    )
    await userEvent.click(screen.getByTestId('range-absence-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('accepts a range exactly at the limit', async () => {
    const onSubmit = sheet()
    await userEvent.clear(screen.getByLabelText(t('he', 'attendance.rangeAbsence.to')))
    await userEvent.type(
      screen.getByLabelText(t('he', 'attendance.rangeAbsence.to')),
      shiftDayKey('2026-08-25', MAX_RANGE_DAYS - 1),
    )
    expect(screen.queryByTestId('range-absence-range-error')).toBeNull()
    await userEvent.click(screen.getByTestId('range-absence-submit'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('sends the reason in HEBREW whatever the parent is reading', async () => {
    // `POST /absence-reports` has one free-text column and a coach reads it on the mat.
    const onSubmit = sheet({ locale: 'ru' })
    await userEvent.click(screen.getByTestId('range-absence-submit'))
    expect(onSubmit.mock.calls[0]![0].reason).toBe(t('he', 'attendance.reason.vacation.label'))
  })

  it('shows the notice instead of a success when the range named no lesson', () => {
    // A parent told "הדיווח נשלח" about an empty batch believes the club was told.
    sheet({ notice: t('he', 'attendance.rangeAbsence.nothingInRange') })
    expect(screen.getByTestId('range-absence-notice')).toHaveTextContent(
      t('he', 'attendance.rangeAbsence.nothingInRange'),
    )
    expect(screen.queryByTestId('home-range-absence-results')).toBeNull()
  })

  it('shows a row per write once the batch has run, and admits a partial failure', () => {
    sheet({
      outcomes: [
        { sessionId: 's1', studentId: 'c1', studentName: 'נועה כהן', groupName: 'מתחילים', timeLabel: '25 באוגוסט · 18:00', state: 'recorded' },
        { sessionId: 's2', studentId: 'c2', studentName: 'דנה כהן', groupName: 'מתקדמים', timeLabel: '26 באוגוסט · 17:00', state: 'too_late' },
      ],
    })
    const results = screen.getByTestId('home-range-absence-results')
    expect(results).toHaveTextContent('נועה כהן')
    expect(results).toHaveTextContent(t('he', 'attendance.dayAbsence.resultTooLate'))
    expect(screen.getByRole('status')).toHaveTextContent(
      t('he', 'attendance.dayAbsence.resultsSomeFailed'),
    )
  })
})
