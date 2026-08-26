// §5.15 step 3 — "carry each group forward as-is, rename, retire, or create".
//
// **Carrying forward is the absent verb, and the screen has to teach that.** `group` has no
// `training_year_id`; the year reaches a group only through the sessions generated for it.
// So a group left alone is already next year's group, and `RolloverGroupsIn` has no
// `carry_forward` list to send. A row a manager does not touch produces no request at all —
// which is why the intro says so out loud, and why the table has no "keep" checkbox that
// would imply otherwise.
//
// Retiring is destructive enough to earn a confirmation: it is the press that decides a
// group does not run next year. It does NOT cancel that group's existing sessions — step 6
// simply skips inactive groups — and the dialog says so, because "what happens to the
// lessons we already ran" is the question a manager actually has.
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, EmptyState, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import { fill } from './client'
import type { BulkOutcome, ClassRow, GroupCreate, GroupRow, RolloverClient } from './client'
import { BulkOutcomePanel } from './BulkOutcomePanel'
import { ConfirmDialog } from './ConfirmDialog'
import type { RolloverStepProps } from './types'
import {
  StepActions,
  captionStyle,
  cellStyle,
  errorStyle,
  fieldsetStyle,
  headCellStyle,
  introStyle,
  rowStyle,
  scrollStyle,
  stepStyle,
  tableStyle,
} from './StepShell'

export type GroupsStepProps = RolloverStepProps & {
  client: RolloverClient
  trainingYearId: string
  onChanged: () => void
}

type Mark = 'none' | 'retire' | 'revive'

export function GroupsStep({
  locale,
  status,
  onDone,
  onSkip,
  client,
  trainingYearId,
  onChanged,
}: GroupsStepProps) {
  const [groups, setGroups] = useState<GroupRow[] | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [creates, setCreates] = useState<GroupCreate[]>([])
  const [draftClassId, setDraftClassId] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftAgeMin, setDraftAgeMin] = useState('')
  const [draftAgeMax, setDraftAgeMax] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const [loadedGroups, loadedClasses] = await Promise.all([
        client.listGroups(),
        client.listClasses(),
      ])
      if (!live) return
      setGroups(loadedGroups)
      setClasses(loadedClasses)
      setNames(Object.fromEntries(loadedGroups.map((group) => [group.id, group.name])))
    })()
    return () => {
      live = false
    }
  }, [client])

  const renames = useMemo(
    () =>
      (groups ?? [])
        .filter((group) => (names[group.id] ?? group.name).trim() !== group.name)
        .map((group) => ({ group_id: group.id, name: (names[group.id] ?? '').trim() })),
    [groups, names],
  )
  const retire = useMemo(
    () => Object.keys(marks).filter((id) => marks[id] === 'retire'),
    [marks],
  )
  const revive = useMemo(() => Object.keys(marks).filter((id) => marks[id] === 'revive'), [marks])

  function addCreate() {
    if (!draftClassId) {
      setError(t(locale, 'schedule.rollover.groups.createClassRequired'))
      return
    }
    if (!draftName.trim()) {
      setError(t(locale, 'schedule.rollover.groups.createNameRequired'))
      return
    }
    setError(null)
    setCreates((current) => [
      ...current,
      {
        class_id: draftClassId,
        name: draftName.trim(),
        description: draftDescription.trim() || null,
        age_min: draftAgeMin === '' ? null : Number(draftAgeMin),
        age_max: draftAgeMax === '' ? null : Number(draftAgeMax),
      },
    ])
    setDraftName('')
    setDraftDescription('')
    setDraftAgeMin('')
    setDraftAgeMax('')
  }

  function submit() {
    if (renames.length + retire.length + revive.length + creates.length === 0) {
      setError(t(locale, 'schedule.rollover.groups.nothingToApply'))
      return
    }
    setError(null)
    // Only a retire needs the dialog. Renaming and creating are reversible in one press;
    // deciding a group does not run next year is the one that changes what a parent sees.
    if (retire.length > 0) {
      setConfirming(true)
      return
    }
    void apply()
  }

  async function apply() {
    setConfirming(false)
    setBusy(true)
    try {
      const result = await client.applyGroups(trainingYearId, {
        renames,
        retire,
        revive,
        creates,
      })
      setOutcome(result)
      setCreates([])
      setMarks({})
      const reloaded = await client.listGroups()
      setGroups(reloaded)
      setNames(Object.fromEntries(reloaded.map((group) => [group.id, group.name])))
      onChanged()
    } catch {
      setError(t(locale, 'schedule.rollover.groups.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby="rollover-groups-title"
      style={stepStyle}
      data-testid="rollover-step-groups"
    >
      <h2 id="rollover-groups-title">{t(locale, 'schedule.rollover.groups.title')}</h2>
      <p style={introStyle}>{t(locale, 'schedule.rollover.groups.intro')}</p>

      {groups !== null && groups.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.rollover.groups.empty')} />
      ) : null}

      {groups !== null && groups.length > 0 ? (
        <div style={scrollStyle}>
          <table style={tableStyle}>
            <caption style={captionStyle}>{t(locale, 'schedule.rollover.groups.caption')}</caption>
            <thead>
              <tr>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.groups.colName')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.groups.colRename')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.groups.colClass')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.groups.colState')}
                </th>
                <th scope="col" style={headCellStyle}>
                  {t(locale, 'schedule.rollover.groups.colAction')}
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const mark = marks[group.id] ?? 'none'
                return (
                  <tr key={group.id} data-testid="rollover-group-row">
                    {/* The row header is the name the group has TODAY, as text. The rename
                        box is the next cell along: a header that was itself an input would
                        give the other cells no stable name to be announced under. */}
                    <th scope="row" style={cellStyle}>
                      {group.name}
                    </th>
                    <td style={cellStyle}>
                      <TextField
                        // A real <label> per input, even in a table cell — a column header
                        // is not an accessible name for a text box.
                        label={fill(t(locale, 'schedule.rollover.groups.nameLabel'), {
                          name: group.name,
                        })}
                        data-testid={`rollover-group-name-${group.id}`}
                        value={names[group.id] ?? group.name}
                        onChange={(event) =>
                          setNames((current) => ({ ...current, [group.id]: event.target.value }))
                        }
                      />
                    </td>
                    <td style={cellStyle}>{group.class_name}</td>
                    {/* The state is a word. An "active" row and a "retired" row must not
                        differ by colour alone (SC 1.4.1). */}
                    <td style={cellStyle} data-testid={`rollover-group-state-${group.id}`}>
                      {group.is_active
                        ? t(locale, 'schedule.rollover.groups.active')
                        : t(locale, 'schedule.rollover.groups.retired')}
                    </td>
                    <td style={cellStyle}>
                      {mark === 'none' ? (
                        <Button
                          variant={group.is_active ? 'destructive' : 'secondary'}
                          data-testid={`rollover-group-mark-${group.id}`}
                          onClick={() =>
                            setMarks((current) => ({
                              ...current,
                              [group.id]: group.is_active ? 'retire' : 'revive',
                            }))
                          }
                        >
                          {group.is_active
                            ? t(locale, 'schedule.rollover.groups.retire')
                            : t(locale, 'schedule.rollover.groups.revive')}
                        </Button>
                      ) : (
                        <>
                          <span data-testid={`rollover-group-marked-${group.id}`}>
                            {mark === 'retire'
                              ? t(locale, 'schedule.rollover.groups.markedRetire')
                              : t(locale, 'schedule.rollover.groups.markedRevive')}
                          </span>{' '}
                          <Button
                            variant="ghost"
                            data-testid={`rollover-group-undo-${group.id}`}
                            onClick={() =>
                              setMarks((current) => ({ ...current, [group.id]: 'none' }))
                            }
                          >
                            {t(locale, 'schedule.rollover.groups.undo')}
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <fieldset style={fieldsetStyle}>
        <legend>{t(locale, 'schedule.rollover.groups.createLegend')}</legend>
        <div style={rowStyle}>
          <label>
            {t(locale, 'schedule.rollover.groups.createClass')}
            <select
              data-testid="rollover-group-create-class"
              value={draftClassId}
              onChange={(event) => setDraftClassId(event.target.value)}
            >
              <option value="" />
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label={t(locale, 'schedule.rollover.groups.createName')}
            data-testid="rollover-group-create-name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <TextField
            label={t(locale, 'schedule.rollover.groups.createDescription')}
            data-testid="rollover-group-create-description"
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
          />
          <TextField
            label={t(locale, 'schedule.rollover.groups.createAgeMin')}
            data-testid="rollover-group-create-age-min"
            inputMode="numeric"
            value={draftAgeMin}
            onChange={(event) => setDraftAgeMin(event.target.value)}
          />
          <TextField
            label={t(locale, 'schedule.rollover.groups.createAgeMax')}
            data-testid="rollover-group-create-age-max"
            inputMode="numeric"
            value={draftAgeMax}
            onChange={(event) => setDraftAgeMax(event.target.value)}
          />
          <Button
            variant="secondary"
            data-testid="rollover-group-create-add"
            onClick={() => addCreate()}
          >
            {t(locale, 'schedule.rollover.groups.addCreate')}
          </Button>
        </div>
      </fieldset>

      {creates.length > 0 ? (
        <Card caption={t(locale, 'schedule.rollover.groups.pendingCreates')}>
          <ul>
            {creates.map((create) => (
              <li key={`${create.class_id}:${create.name}`} data-testid="rollover-group-pending">
                {create.name}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" style={errorStyle} data-testid="rollover-groups-error">
          {error}
        </p>
      ) : null}

      {outcome ? (
        <BulkOutcomePanel locale={locale} outcome={outcome} testId="rollover-groups-outcome" />
      ) : null}

      {confirming ? (
        <ConfirmDialog
          locale={locale}
          titleId="rollover-groups-confirm-title"
          testId="rollover-groups-confirm"
          title={t(locale, 'schedule.rollover.groups.confirmTitle')}
          body={fill(t(locale, 'schedule.rollover.groups.confirmBody'), { count: retire.length })}
          confirmLabel={t(locale, 'schedule.rollover.groups.confirm')}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void apply()}
        />
      ) : null}

      <div>
        <Button data-testid="rollover-groups-apply" disabled={busy} onClick={() => submit()}>
          {t(locale, 'schedule.rollover.groups.apply')}
        </Button>
      </div>

      <StepActions
        locale={locale}
        stepId="groups"
        status={status}
        onDone={onDone}
        onSkip={onSkip}
      />
    </section>
  )
}
