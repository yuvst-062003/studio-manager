// Step 2 — קבוצות ולו״ז. The class's groups and each one's weekly schedule.
//
// The prototype calls this "שעות משתנות" and lets a group carry several weekday slots, which
// is exactly what `group_schedule_rule` stores: a 17:00 class is 17:00 in November and 17:00
// in June, so the times here are naive local times bound to `<input type="time">` and NOT
// UTC instants. Mixing the two up is how every summer class lands an hour early.
//
// `maxCapacity` is on the prototype's group and is NOT here — D2 cut group capacity from the
// product, and the owner confirmed the cut again on 2026-09-10.
//
// **The schedule is written with `apply: true`.** Everywhere else in this app a schedule
// change goes through the impact dialog first, because it can rewrite a year of existing
// sessions. Here it cannot: these rules are being set on a group created moments ago with no
// sessions behind it. A group that already HAS a schedule is a different case, and this step
// says so and sends the manager to the group page rather than quietly rewriting it.
import { useEffect, useState } from 'react'
import { Button, EmptyState, TextField } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { ClassStepProps } from '../ClassWizard'
import type { WizardGroup, WizardRule } from '../client'

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

/** `17:00:00` from the API, `17:00` in an `<input type="time">`. */
const toInput = (value: string): string => value.slice(0, 5)
const toApi = (value: string): string => (value.length === 5 ? `${value}:00` : value)

/** A group's age range in words. An open end is stated as one — `13–—` is what happens
 *  when a range renders a missing bound as a dash and calls it done. */
function ageLabel(group: WizardGroup, locale: Locale): string | null {
  if (group.age_min !== null && group.age_max !== null) return `${group.age_min}–${group.age_max}`
  if (group.age_min !== null) return fill(t(locale, 'schedule.wizard.groups.ageFrom'), { n: group.age_min })
  if (group.age_max !== null) return fill(t(locale, 'schedule.wizard.groups.ageTo'), { n: group.age_max })
  return null
}

function blankRule(effectiveFrom: string): WizardRule {
  return {
    weekday: 0,
    start_time: '17:00:00',
    end_time: '18:00:00',
    location_id: null,
    effective_from: effectiveFrom,
  }
}

function RuleRows({
  locale,
  rules,
  onChange,
}: {
  locale: Locale
  rules: WizardRule[]
  onChange: (rules: WizardRule[]) => void
}) {
  return (
    <div className="wizard-rules">
      {rules.map((rule, index) => (
        <div className="wizard-rules__row" data-testid="wizard-rule" key={index}>
          <label className="wizard-step__field">
            {t(locale, 'schedule.rules.weekday')}
            <select
              data-testid={`wizard-rule-weekday-${index}`}
              onChange={(event) =>
                onChange(
                  rules.map((row, at) =>
                    at === index ? { ...row, weekday: Number(event.target.value) } : row,
                  ),
                )
              }
              value={rule.weekday}
            >
              {WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {t(locale, `schedule.weekday.${day}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="wizard-step__field">
            {t(locale, 'schedule.rules.startTime')}
            <input
              data-testid={`wizard-rule-start-${index}`}
              onChange={(event) =>
                onChange(
                  rules.map((row, at) =>
                    at === index ? { ...row, start_time: event.target.value } : row,
                  ),
                )
              }
              type="time"
              value={toInput(rule.start_time)}
            />
          </label>
          <label className="wizard-step__field">
            {t(locale, 'schedule.rules.endTime')}
            <input
              data-testid={`wizard-rule-end-${index}`}
              onChange={(event) =>
                onChange(
                  rules.map((row, at) =>
                    at === index ? { ...row, end_time: event.target.value } : row,
                  ),
                )
              }
              type="time"
              value={toInput(rule.end_time)}
            />
          </label>
          <Button
            data-testid={`wizard-rule-remove-${index}`}
            onClick={() => onChange(rules.filter((_, at) => at !== index))}
            variant="ghost"
          >
            {t(locale, 'schedule.rules.remove')}
          </Button>
        </div>
      ))}
    </div>
  )
}

export function GroupsStep({ locale, client, classId, onSaved }: ClassStepProps) {
  const [groups, setGroups] = useState<WizardGroup[] | null>(null)
  const [schedules, setSchedules] = useState<Record<string, WizardRule[]>>({})
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!classId) return
    let live = true
    void (async () => {
      try {
        const rows = await client.listGroups(classId)
        const loaded: Record<string, WizardRule[]> = {}
        const had = new Set<string>()
        // Pre-filled, per the owner: an edit opens on what the class already has.
        for (const group of rows) {
          const rules = await client.getSchedule(group.id)
          loaded[group.id] = rules
          if (rules.length > 0) had.add(group.id)
        }
        if (!live) return
        setGroups(rows)
        setSchedules(loaded)
        setExisting(had)
      } catch {
        if (live) setError(t(locale, 'common.loadFailed.body'))
      }
    })()
    return () => {
      live = false
    }
  }, [classId, client, locale])

  const addGroup = async () => {
    if (!classId || name.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const created = await client.createGroup({
        class_id: classId,
        name: name.trim(),
        // `GroupCreate` refuses `age_min > age_max` with a 422 naming the field, so an
        // empty box is `null` rather than a zero that would silently pass.
        age_min: ageMin === '' ? null : Number(ageMin),
        age_max: ageMax === '' ? null : Number(ageMax),
      })
      setGroups((current) => [...(current ?? []), created])
      setSchedules((current) => ({ ...current, [created.id]: [] }))
      setName('')
      setAgeMin('')
      setAgeMax('')
    } catch {
      setError(t(locale, 'schedule.wizard.groups.createFailed'))
    } finally {
      setBusy(false)
    }
  }

  const saveSchedules = async () => {
    setBusy(true)
    setError(null)
    const today = new Date().toISOString().slice(0, 10)
    try {
      for (const group of groups ?? []) {
        const rules = schedules[group.id] ?? []
        // A group whose schedule already existed when this step opened is NOT rewritten
        // from here — see the file header. Nothing to write for an empty one either.
        if (rules.length === 0 || existing.has(group.id)) continue
        await client.putSchedule(group.id, {
          rules: rules.map((rule) => ({
            ...rule,
            start_time: toApi(rule.start_time),
            end_time: toApi(rule.end_time),
          })),
          effective_from: today,
          apply: true,
        })
      }
      onSaved()
    } catch {
      setError(t(locale, 'schedule.wizard.groups.scheduleFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (!classId) return <p>{t(locale, 'schedule.wizard.needsClass')}</p>

  return (
    <div className="wizard-step">
      <p className="wizard-step__lead">{t(locale, 'schedule.wizard.groups.lead')}</p>

      {groups && groups.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.wizard.groups.empty')} />
      ) : null}

      <ul className="wizard-groups" data-testid="wizard-groups">
        {(groups ?? []).map((group) => (
          <li className="wizard-groups__item" data-testid={`wizard-group-${group.id}`} key={group.id}>
            <div className="wizard-groups__head">
              <strong>{group.name}</strong>
              {ageLabel(group, locale) ? (
                <span className="wizard-groups__ages">{ageLabel(group, locale)}</span>
              ) : null}
            </div>

            {existing.has(group.id) ? (
              // The safety note. Rewriting a live schedule is the impact dialog's job.
              <p className="wizard-groups__locked" data-testid={`wizard-group-locked-${group.id}`}>
                {t(locale, 'schedule.wizard.groups.hasSchedule')}{' '}
                <a href={`#/groups/${group.id}`}>{t(locale, 'schedule.wizard.groups.openGroup')}</a>
              </p>
            ) : (
              <>
                <RuleRows
                  locale={locale}
                  onChange={(rules) =>
                    setSchedules((current) => ({ ...current, [group.id]: rules }))
                  }
                  rules={schedules[group.id] ?? []}
                />
                <Button
                  data-testid={`wizard-rule-add-${group.id}`}
                  onClick={() =>
                    setSchedules((current) => ({
                      ...current,
                      [group.id]: [
                        ...(current[group.id] ?? []),
                        blankRule(new Date().toISOString().slice(0, 10)),
                      ],
                    }))
                  }
                  variant="secondary"
                >
                  {t(locale, 'schedule.rules.add')}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      <fieldset className="wizard-step__box">
        <legend>{t(locale, 'schedule.wizard.groups.addTitle')}</legend>
        <div className="wizard-step__row">
          <TextField
            data-testid="wizard-group-name"
            label={t(locale, 'schedule.groups.form.name')}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <TextField
            data-testid="wizard-group-age-min"
            label={t(locale, 'schedule.wizard.groups.ageMin')}
            onChange={(event) => setAgeMin(event.target.value)}
            type="number"
            value={ageMin}
          />
          <TextField
            data-testid="wizard-group-age-max"
            label={t(locale, 'schedule.wizard.groups.ageMax')}
            onChange={(event) => setAgeMax(event.target.value)}
            type="number"
            value={ageMax}
          />
          <Button
            data-testid="wizard-group-add"
            disabled={busy || name.trim() === ''}
            onClick={() => void addGroup()}
            variant="secondary"
          >
            {t(locale, 'schedule.groups.form.submit')}
          </Button>
        </div>
      </fieldset>

      {error ? (
        <p className="wizard-step__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="wizard-step__actions">
        <Button data-testid="wizard-groups-save" disabled={busy} onClick={() => void saveSchedules()}>
          {t(locale, 'schedule.wizard.saveAndNext')}
        </Button>
      </div>
    </div>
  )
}
