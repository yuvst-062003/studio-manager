// §5.15 step 4 — bulk confirm, move, or end an enrolment.
//
// **There is no automatic age-based promotion, and there must never be one.** §5.15 says so
// in as many words for v1, and `app/routers/rollover.py` repeats it: "a child moved up a
// group without a human saying so is a conversation with a parent that nobody in the office
// knows happened." Nothing in this file reads a birth date. Every move is a select a manager
// changed by hand, and the sentence saying so is on the screen rather than only in this
// comment, because the next person to open it will otherwise wonder why the promotion button
// is missing and add one.
//
// **Confirming is the absent verb**, exactly as carrying a group forward is. An enrolment
// left alone continues, so `RolloverStudentsIn` has no `confirm` list — a row untouched here
// sends nothing at all. That is what "bulk confirm" means in a wizard whose default is
// correct.
//
// The moving handle is `enrollment_id` and not `student_id`, because C11 puts a child in as
// many groups as they train — a student id would be ambiguous for exactly the children a
// rollover is most likely to move.
import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import { fill } from './client'
import type { BulkOutcome, EnrollmentRow, GroupRow, RolloverClient } from './client'
import { BulkOutcomePanel } from './BulkOutcomePanel'
import { ConfirmDialog } from './ConfirmDialog'
import type { RolloverStepProps } from './types'
import {
  StepActions,
  captionStyle,
  cellStyle,
  errorStyle,
  headCellStyle,
  introStyle,
  scrollStyle,
  stepStyle,
  tableStyle,
} from './StepShell'

export type StudentsStepProps = RolloverStepProps & {
  client: RolloverClient
  trainingYearId: string
  onChanged: () => void
}

export function StudentsStep({
  locale,
  status,
  onDone,
  onSkip,
  client,
  trainingYearId,
  onChanged,
}: StudentsStepProps) {
  const [rows, setRows] = useState<EnrollmentRow[] | null>(null)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [moveTo, setMoveTo] = useState<Record<string, string>>({})
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const [loadedRows, loadedGroups] = await Promise.all([
        client.listEnrollments(),
        client.listGroups(),
      ])
      if (!live) return
      setRows(loadedRows)
      // Only active groups are offered as a destination: the server refuses a move into a
      // retired one with `destination_retired`, and a select that offers a choice the
      // server will refuse is a refusal the manager finds out about after the press.
      setGroups(loadedGroups.filter((group) => group.is_active))
    })()
    return () => {
      live = false
    }
  }, [client])

  const moves = useMemo(
    () =>
      Object.entries(moveTo)
        .filter(([enrollmentId, groupId]) => groupId !== '' && !leaving.has(enrollmentId))
        .map(([enrollmentId, groupId]) => ({
          enrollment_id: enrollmentId,
          to_group_id: groupId,
        })),
    [leaving, moveTo],
  )
  const notReturning = useMemo(() => [...leaving], [leaving])

  function submit() {
    if (moves.length + notReturning.length === 0) {
      setError(t(locale, 'schedule.rollover.students.nothingToApply'))
      return
    }
    setError(null)
    // Ending an enrolment is the destructive half; a move is not. Only the first opens a
    // dialog, so a manager doing nothing but moves is not taught to click through one.
    if (notReturning.length > 0) {
      setConfirming(true)
      return
    }
    void apply()
  }

  async function apply() {
    setConfirming(false)
    setBusy(true)
    try {
      const result = await client.applyStudents(trainingYearId, {
        moves,
        not_returning: notReturning,
      })
      setOutcome(result)
      setMoveTo({})
      setLeaving(new Set())
      setRows(await client.listEnrollments())
      onChanged()
    } catch {
      setError(t(locale, 'schedule.rollover.students.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby="rollover-students-title"
      style={stepStyle}
      data-testid="rollover-step-students"
    >
      <h2 id="rollover-students-title">{t(locale, 'schedule.rollover.students.title')}</h2>
      <p style={introStyle}>{t(locale, 'schedule.rollover.students.intro')}</p>
      {/* §5.15's v1 rule, on the screen it applies to. */}
      <p data-testid="rollover-students-no-auto">
        {t(locale, 'schedule.rollover.students.noAutoPromotion')}
      </p>

      {rows !== null && rows.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.rollover.students.empty')} />
      ) : null}

      {rows !== null && rows.length > 0 ? (
        <div style={scrollStyle}>
          <table style={tableStyle}>
            <caption style={captionStyle}>
              {t(locale, 'schedule.rollover.students.caption')}
            </caption>
            <thead>
              <tr>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.students.colStudent')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.students.colGroup')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.students.colMove')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.students.colReturning')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.enrollment_id} data-testid="rollover-student-row">
                  <th scope="row" style={cellStyle}>
                    {row.student_name}
                  </th>
                  <td style={cellStyle}>{row.group_name}</td>
                  <td style={cellStyle}>
                    <label>
                      {fill(t(locale, 'schedule.rollover.students.moveLabel'), {
                        name: row.student_name,
                      })}
                      <select
                        data-testid={`rollover-student-move-${row.enrollment_id}`}
                        disabled={leaving.has(row.enrollment_id)}
                        value={moveTo[row.enrollment_id] ?? ''}
                        onChange={(event) =>
                          setMoveTo((current) => ({
                            ...current,
                            [row.enrollment_id]: event.target.value,
                          }))
                        }
                      >
                        {/* The default is "stays", spelled out. An empty first option would
                            leave a manager guessing whether nothing meant nothing. */}
                        <option value="">{t(locale, 'schedule.rollover.students.stay')}</option>
                        {groups
                          .filter((group) => group.id !== row.group_id)
                          .map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </td>
                  <td style={cellStyle}>
                    <Checkbox
                      data-testid={`rollover-student-leaving-${row.enrollment_id}`}
                      checked={leaving.has(row.enrollment_id)}
                      label={fill(t(locale, 'schedule.rollover.students.notReturningLabel'), {
                        name: row.student_name,
                      })}
                      onChange={(event) =>
                        setLeaving((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(row.enrollment_id)
                          else next.delete(row.enrollment_id)
                          return next
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={errorStyle} data-testid="rollover-students-error">
          {error}
        </p>
      ) : null}

      {outcome ? (
        <BulkOutcomePanel locale={locale} outcome={outcome} testId="rollover-students-outcome" />
      ) : null}

      {confirming ? (
        <ConfirmDialog
          locale={locale}
          titleId="rollover-students-confirm-title"
          testId="rollover-students-confirm"
          title={t(locale, 'schedule.rollover.students.confirmTitle')}
          body={fill(t(locale, 'schedule.rollover.students.confirmBody'), {
            count: notReturning.length,
          })}
          confirmLabel={t(locale, 'schedule.rollover.students.confirm')}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void apply()}
        />
      ) : null}

      <div>
        <Button data-testid="rollover-students-apply" disabled={busy} onClick={() => submit()}>
          {t(locale, 'schedule.rollover.students.apply')}
        </Button>
      </div>

      <StepActions
        locale={locale}
        stepId="students"
        status={status}
        onDone={onDone}
        onSkip={onSkip}
      />
    </section>
  )
}
