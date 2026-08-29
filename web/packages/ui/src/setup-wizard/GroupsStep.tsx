// Step 3 · קבוצות ולו״ז.
//
// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED BY: W2's **SCHEDULE lane (M2)**, and by nobody else.
//
// What is here is M1's half — create a class, create a group, set a location, all through
// endpoints M1.4 already shipped. The weekly schedule is `group_schedule_rule`, a W2
// contract model, so the לו״ז half of this step lands when SCHEDULE does.
//
// It gets NO sub-slot. `SlotId` is a closed five-value union in a file the plan says is
// authored once, and this step has exactly one later owner — so a second seam would buy
// nothing that "one lane owns this file" does not already give.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import { Button } from '../primitives/Button'
import { RangeText } from '../primitives/RangeText'
import { TextField } from '../primitives/TextField'
import type { WizardStepProps } from './types'

export type NamedRow = { id: string; name: string }

/**
 * One weekly training slot: a day, an hour range, and optionally a hall.
 *
 * A group trains on the same days at the same hours EVERY week — it is set once and
 * repeats — so a slot carries no date. `weekday` is 0–6 with **0 = Sunday**, which is
 * `group_schedule_rule`'s own scale and Israel's working week; a Monday-based one would
 * shift every session in the product by a day.
 */
export type Slot = {
  weekday: number
  start_time: string
  end_time: string
  location_id: string | null
}

export type StructureClient = {
  listClasses: () => Promise<NamedRow[]>
  listGroups: () => Promise<NamedRow[]>
  listLocations: () => Promise<NamedRow[]>
  createClass: (name: string) => Promise<NamedRow>
  createGroup: (classId: string, name: string) => Promise<NamedRow>
  createLocation: (name: string) => Promise<NamedRow>
  /** The rules a group already has. A manager returning to this step sees their own work. */
  readSchedule: (groupId: string) => Promise<Slot[]>
  /**
   * Replace a group's weekly rules.
   *
   * `PUT` replaces the whole set rather than appending, so the caller sends the complete
   * list every time — which is also why the step keeps the slots in state and writes them
   * as a unit. `apply` defaults to false on the server and returns an impact preview
   * instead of writing; during setup there is nothing to impact, so this always applies.
   */
  putSchedule: (groupId: string, slots: Slot[], effectiveFrom: string) => Promise<void>
}

const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'end',
  flexWrap: 'wrap',
}


/** Sunday-first, matching `group_schedule_rule.weekday` and Israel's working week. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

/** A slot the server will accept: both ends present, and ending after it starts. */
export function isComplete(slot: Slot): boolean {
  return Boolean(slot.start_time && slot.end_time && slot.end_time > slot.start_time)
}

/** Local calendar day. `toISOString` answers in UTC, which after 21:00 here is tomorrow. */
function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function makeGroupsStep(client: StructureClient) {
  return function GroupsStep({ locale, status, onDone, onSkip }: WizardStepProps) {
    const [classes, setClasses] = useState<NamedRow[]>([])
    const [groups, setGroups] = useState<NamedRow[]>([])
    const [locations, setLocations] = useState<NamedRow[]>([])
    const [className, setClassName] = useState('')
    const [groupName, setGroupName] = useState('')
    const [locationName, setLocationName] = useState('')
    const [busy, setBusy] = useState(false)

    useEffect(() => {
      let alive = true
      void Promise.all([client.listClasses(), client.listGroups(), client.listLocations()]).then(
        ([c, g, l]) => {
          if (!alive) return
          setClasses(c)
          setGroups(g)
          setLocations(l)
        },
      )
      return () => {
        alive = false
      }
    }, [])

    /**
     * Each group's weekly slots, keyed by group id.
     *
     * Held here rather than written per keystroke because `PUT` REPLACES a group's whole
     * rule set — a partial send would delete the rows it omitted. The step edits the set
     * and writes it as a unit.
     */
    const [slots, setSlots] = useState<Record<string, Slot[]>>({})
    const [failedFor, setFailedFor] = useState<{ groupId: string; needsYear: boolean } | null>(null)

    // A manager returning to this step sees their own work, not an empty form.
    useEffect(() => {
      let alive = true
      void Promise.all(
        groups.map((group) =>
          client.readSchedule(group.id).then((rows) => [group.id, rows] as const),
        ),
      ).then((pairs) => {
        if (alive) setSlots((current) => ({ ...Object.fromEntries(pairs), ...current }))
      })
      return () => {
        alive = false
      }
    }, [groups])

    /** Write one group's whole set. Today, because at setup there is nothing before it. */
    const write = (groupId: string, next: Slot[]) => {
      setSlots((current) => ({ ...current, [groupId]: next }))
      setFailedFor(null)
      void client
        .putSchedule(groupId, next.filter(isComplete), todayKey())
        // 404 is the one failure with a cause worth naming: `apply_schedule_change` reads
        // the active training year BEFORE it writes anything, and setup never opens one.
        // The times stay on screen either way — losing a manager's typing to report a
        // server state they cannot act on would be the worse failure.
        .catch((error: unknown) =>
          setFailedFor({
            groupId,
            needsYear: error instanceof Error && error.message === '404',
          }),
        )
    }

    const run = (work: () => Promise<void>) => {
      setBusy(true)
      void work().finally(() => setBusy(false))
    }

    return (
      <section aria-labelledby="setup-groups-title" data-testid="setup-step-groups">
        <h3 id="setup-groups-title">{t(locale, 'common.setup.step.groups')}</h3>
        {/* The house pattern: a heading, then one line that removes a worry. This one
            answers the two questions the times raise — do I have to press save, and can I
            change them afterwards. `tools/__tests__/dead-promise-keys` is what caught the
            string being added and never rendered. */}
        <p className="setup-group-row__times-label">
          {t(locale, 'common.setup.groups.timesLater')}
        </p>

        <div style={rowStyle}>
          <TextField
            label={t(locale, 'common.setup.groups.className')}
            value={className}
            onChange={(event) => setClassName(event.target.value)}
          />
          <Button
            disabled={busy || className.trim() === ''}
            onClick={() =>
              run(async () => {
                const row = await client.createClass(className.trim())
                setClasses((current) => [...current, row])
                setClassName('')
              })
            }
          >
            {t(locale, 'common.setup.groups.addClass')}
          </Button>
        </div>
        <ul data-testid="setup-classes" style={listStyle}>
          {classes.map((row) => (
            <li key={row.id}>{row.name}</li>
          ))}
        </ul>

        <div style={rowStyle}>
          <TextField
            label={t(locale, 'common.setup.groups.groupName')}
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            // A group belongs to a class, so there is nothing to name until one exists.
            // Disabled and explained beats a 422 from the server.
            disabled={classes.length === 0}
            hint={classes.length === 0 ? t(locale, 'common.setup.groups.needClass') : undefined}
          />
          <Button
            disabled={busy || classes.length === 0 || groupName.trim() === ''}
            onClick={() =>
              run(async () => {
                const parent = classes[0]
                if (!parent) return
                const row = await client.createGroup(parent.id, groupName.trim())
                setGroups((current) => [...current, row])
                setGroupName('')
              })
            }
          >
            {t(locale, 'common.setup.groups.addGroup')}
          </Button>
        </div>
        {/* Each group carries its own weekly times. A group trains the same days at the
            same hours EVERY week, so a slot is a weekday and an hour range and never a
            date — "Tuesday 10:00–14:00" is one row, and a group that also trains on Friday
            has two.

            This step used to create the structure and stop, and a test asserted that it
            promised no schedule. That was right while the times lived only on the weekly
            board; the owner's decision on 2026-08-29 is that a club is not set up until
            its groups have hours, so the promise is now kept rather than withdrawn. */}
        <ul data-testid="setup-groups" style={listStyle}>
          {groups.map((row) => {
            const rows = slots[row.id] ?? []
            return (
              <li className="setup-group-row" data-testid={`setup-group-${row.id}`} key={row.id}>
                <span className="setup-group-row__name">{row.name}</span>
                <span className="setup-group-row__times-label">
                  {t(locale, 'common.setup.groups.times')}
                </span>
                {rows.map((slot, index) => (
                  <span className="setup-slot" key={index}>
                    <label>
                      <span className="studio-visually-hidden">
                        {t(locale, 'common.setup.groups.day')}
                      </span>
                      <select
                        data-testid={`slot-day-${row.id}-${index}`}
                        onChange={(event) =>
                          write(
                            row.id,
                            rows.map((s, i) =>
                              i === index ? { ...s, weekday: Number(event.target.value) } : s,
                            ),
                          )
                        }
                        value={slot.weekday}
                      >
                        {WEEKDAYS.map((day) => (
                          <option key={day} value={day}>
                            {t(locale, `schedule.weekday.${day}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="studio-visually-hidden">
                        {t(locale, 'common.setup.groups.from')}
                      </span>
                      <input
                        data-testid={`slot-from-${row.id}-${index}`}
                        onChange={(event) =>
                          write(
                            row.id,
                            rows.map((s, i) =>
                              i === index ? { ...s, start_time: event.target.value } : s,
                            ),
                          )
                        }
                        type="time"
                        value={slot.start_time}
                      />
                    </label>
                    <span aria-hidden="true">–</span>
                    <label>
                      <span className="studio-visually-hidden">
                        {t(locale, 'common.setup.groups.to')}
                      </span>
                      <input
                        data-testid={`slot-to-${row.id}-${index}`}
                        onChange={(event) =>
                          write(
                            row.id,
                            rows.map((s, i) =>
                              i === index ? { ...s, end_time: event.target.value } : s,
                            ),
                          )
                        }
                        type="time"
                        value={slot.end_time}
                      />
                    </label>
                    {locations.length > 0 ? (
                      <label>
                        <span className="studio-visually-hidden">
                          {t(locale, 'common.setup.groups.hall')}
                        </span>
                        <select
                          data-testid={`slot-hall-${row.id}-${index}`}
                          onChange={(event) =>
                            write(
                              row.id,
                              rows.map((s, i) =>
                                i === index
                                  ? { ...s, location_id: event.target.value || null }
                                  : s,
                              ),
                            )
                          }
                          value={slot.location_id ?? ''}
                        >
                          <option value="">{t(locale, 'common.setup.groups.noHall')}</option>
                          {locations.map((hall) => (
                            <option key={hall.id} value={hall.id}>
                              {hall.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <Button
                      data-testid={`slot-remove-${row.id}-${index}`}
                      onClick={() => write(row.id, rows.filter((_, i) => i !== index))}
                      variant="ghost"
                    >
                      {t(locale, 'common.setup.groups.removeTime')}
                    </Button>
                  </span>
                ))}
                <Button
                  data-testid={`slot-add-${row.id}`}
                  onClick={() =>
                    write(row.id, [
                      ...rows,
                      // Sunday 17:00–18:00: the commonest shape, so the manager edits
                      // rather than fills in. An empty row would be four blanks.
                      { weekday: 0, start_time: '17:00', end_time: '18:00', location_id: null },
                    ])
                  }
                  variant="secondary"
                >
                  {t(locale, 'common.setup.groups.addTime')}
                </Button>
                {failedFor?.groupId === row.id ? (
                  <span
                    className="setup-group-row__failed"
                    data-status={failedFor.needsYear ? 'pending' : 'danger'}
                    data-testid={`slot-failed-${row.id}`}
                    role="alert"
                  >
                    {t(
                      locale,
                      failedFor.needsYear
                        ? 'common.setup.groups.needYear'
                        : 'common.setup.groups.saveFailed',
                    )}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>

        <div style={rowStyle}>
          <TextField
            label={t(locale, 'common.setup.groups.locationName')}
            value={locationName}
            onChange={(event) => setLocationName(event.target.value)}
          />
          <Button
            disabled={busy || locationName.trim() === ''}
            onClick={() =>
              run(async () => {
                const row = await client.createLocation(locationName.trim())
                setLocations((current) => [...current, row])
                setLocationName('')
              })
            }
          >
            {t(locale, 'common.setup.groups.addLocation')}
          </Button>
        </div>
        <ul data-testid="setup-locations" style={listStyle}>
          {locations.map((row) => (
            <li key={row.id}>{row.name}</li>
          ))}
        </ul>

        {/* The resulting week. A manager filling in five groups needs to see that Tuesday
            is busy and Wednesday is empty, and that two groups do not want the same hall
            at the same hour — none of which is visible from a list of groups. */}
        <aside className="setup-week" data-testid="setup-week">
          <p className="setup-week__title">{t(locale, 'common.setup.groups.week')}</p>
          {Object.values(slots).flat().filter(isComplete).length === 0 ? (
            <p className="setup-week__empty">{t(locale, 'common.setup.groups.weekEmpty')}</p>
          ) : (
            <ol className="setup-week__days">
              {WEEKDAYS.map((day) => {
                const onDay = groups
                  .flatMap((group) =>
                    (slots[group.id] ?? [])
                      .filter(isComplete)
                      .filter((slot) => slot.weekday === day)
                      .map((slot) => ({ group, slot })),
                  )
                  .sort((a, b) => a.slot.start_time.localeCompare(b.slot.start_time))
                return (
                  <li key={day}>
                    <span className="setup-week__day">
                      {t(locale, `schedule.weekday.${day}`)}
                    </span>
                    {onDay.length === 0 ? (
                      <span className="setup-week__none">
                        {t(locale, 'common.setup.groups.dayEmpty')}
                      </span>
                    ) : (
                      <ul className="setup-week__list">
                        {onDay.map(({ group, slot }, index) => (
                          <li key={`${group.id}-${index}`}>
                            <RangeText from={slot.start_time} to={slot.end_time} />
                            <span>{group.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </aside>

        <Button disabled={busy || groups.length === 0} onClick={onDone}>
          {t(locale, 'common.setup.continue')}
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {t(locale, 'common.setup.skip')}
        </Button>
        <p data-testid="setup-groups-status">{t(locale, `common.setup.status.${status}`)}</p>
      </section>
    )
  }
}
