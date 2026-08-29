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
import { useEffect, useId, useState } from 'react'
import { t } from '@studio/i18n'
import { ActionBar } from '../primitives/ActionBar'
import { Button } from '../primitives/Button'
import { RangeText } from '../primitives/RangeText'
import { SectionHeader } from '../primitives/SectionHeader'
import { TextField } from '../primitives/TextField'
import { useModalDialog } from '../useModalDialog'
import type { WizardStepProps } from './types'

export type NamedRow = { id: string; name: string }

/**
 * A group and the class it belongs to.
 *
 * The class was never carried before, and the step paid for it: every new group went to
 * `classes[0]` — the first class ever created — with no picker anywhere on screen. A club
 * with ג'ודו and קרוספיט could not put a group under קרוספיט at all.
 */
export type GroupRow = NamedRow & { class_id: string }

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
  listGroups: () => Promise<GroupRow[]>
  listLocations: () => Promise<NamedRow[]>
  createClass: (name: string) => Promise<NamedRow>
  createGroup: (classId: string, name: string) => Promise<GroupRow>
  createLocation: (name: string) => Promise<NamedRow>
  /** The rules a group already has. A manager returning to this step sees their own work. */
  readSchedule: (groupId: string) => Promise<Slot[]>
  /**
   * The studio's active training year, opening this season's if there is none.
   *
   * A weekly rule is not a lesson. It becomes lessons only when generated between two
   * dates, and those dates are the training year's — so `PUT .../schedule` reads the
   * active year BEFORE it writes anything and refuses without one. Nothing in the six
   * setup steps opened one: §5.15's rollover wizard does, and it exists for a club that
   * already HAS a year and is moving to the next. A brand-new club has nothing to roll
   * over, so it finished setup with a timetable that produced no lessons at all.
   *
   * Opened without asking (owner decision, 2026-08-29). The dates are derivable, a
   * first-run owner has no useful opinion about them yet, and every part of the year is
   * editable afterwards through the rollover wizard.
   */
  ensureTrainingYear: () => Promise<void>
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



/**
 * The Israeli season, September to August.
 *
 * From August onward the season being set up is the one about to start; before that, the
 * one already running. The same rule `YearStep` uses for its pre-filled dates — restated
 * here rather than imported, because `packages/ui` must not reach into an app's feature
 * folder, and six lines of arithmetic is a cheaper duplication than that inversion.
 */
export function defaultSeason(today: Date): { name: string; starts_on: string; ends_on: string } {
  const startYear = today.getMonth() + 1 >= 8 ? today.getFullYear() : today.getFullYear() - 1
  return {
    name: `${startYear}–${startYear + 1}`,
    starts_on: `${startYear}-09-01`,
    ends_on: `${startYear + 1}-08-31`,
  }
}

/** Sunday-first, matching `group_schedule_rule.weekday` and Israel's working week. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

/** A slot the server will accept: both ends present, and ending after it starts. */
export function isComplete(slot: Slot): boolean {
  return Boolean(slot.start_time && slot.end_time && slot.end_time > slot.start_time)
}

/** Sunday 17:00–18:00 — the commonest shape, so a new row is edited rather than filled. */
const DEFAULT_SLOT: Slot = {
  weekday: 0,
  start_time: '17:00',
  end_time: '18:00',
  location_id: null,
}

/** Local calendar day. `toISOString` answers in UTC, which after 21:00 here is tomorrow. */
function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * The dialog one group is built in: its name, and the weekly hours it trains.
 *
 * A dialog rather than another row on the page, because the step's whole problem was that
 * everything was on the page at once — three stacked forms and one flat list of every
 * group in the club, with each group's four-control time rows expanded inline. Adding a
 * group meant scrolling past every group already added.
 *
 * It opens on `+`, it holds one group, and it closes. Nothing is written until פורסם:
 * the slots live here, so an abandoned dialog leaves nothing behind.
 */
function GroupDialog({
  locale,
  className,
  initialName,
  initialSlots,
  locations,
  onCancel,
  onSave,
}: {
  locale: WizardStepProps['locale']
  /** Named in the heading so the manager can see which class they are adding to. */
  className: string
  initialName: string
  initialSlots: Slot[]
  locations: NamedRow[]
  onCancel: () => void
  onSave: (name: string, slots: Slot[]) => void
}) {
  const titleId = useId()
  const [name, setName] = useState(initialName)
  const [rows, setRows] = useState<Slot[]>(
    initialSlots.length > 0 ? initialSlots : [DEFAULT_SLOT],
  )
  const dialogRef = useModalDialog(true, onCancel)

  const edit = (index: number, patch: Partial<Slot>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <div className="setup-dialog__scrim">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="setup-dialog"
        data-testid="group-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <h4 className="setup-dialog__title" id={titleId}>
          {t(locale, 'common.setup.groups.dialogTitle').replace('{{class}}', className)}
        </h4>

        <TextField
          data-testid="group-dialog-name"
          label={t(locale, 'common.setup.groups.groupName')}
          onChange={(event) => setName(event.target.value)}
          placeholder={t(locale, 'common.setup.groups.groupNamePlaceholder')}
          value={name}
        />

        <p className="setup-dialog__legend">{t(locale, 'common.setup.groups.whenTitle')}</p>
        <p className="setup-step__meta">{t(locale, 'common.setup.groups.whenHint')}</p>

        <ul className="setup-slots">
          {rows.map((slot, index) => (
            <li className="setup-slot" key={index}>
              <label className="setup-slot__field">
                <span className="setup-slot__label">{t(locale, 'common.setup.groups.day')}</span>
                <select
                  data-testid={`dialog-day-${index}`}
                  onChange={(event) => edit(index, { weekday: Number(event.target.value) })}
                  value={slot.weekday}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {t(locale, `schedule.weekday.${day}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="setup-slot__field">
                <span className="setup-slot__label">{t(locale, 'common.setup.groups.from')}</span>
                <input
                  data-testid={`dialog-from-${index}`}
                  onChange={(event) => edit(index, { start_time: event.target.value })}
                  type="time"
                  value={slot.start_time}
                />
              </label>
              <label className="setup-slot__field">
                <span className="setup-slot__label">{t(locale, 'common.setup.groups.to')}</span>
                <input
                  data-testid={`dialog-to-${index}`}
                  onChange={(event) => edit(index, { end_time: event.target.value })}
                  type="time"
                  value={slot.end_time}
                />
              </label>
              {locations.length > 0 ? (
                <label className="setup-slot__field">
                  <span className="setup-slot__label">
                    {t(locale, 'common.setup.groups.hall')}
                  </span>
                  <select
                    data-testid={`dialog-hall-${index}`}
                    onChange={(event) => edit(index, { location_id: event.target.value || null })}
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
              {/* The last row has no remove: a group with no hours is not a group, and a
                  control that removes the only row leaves the dialog with nothing to save. */}
              {rows.length > 1 ? (
                <Button
                  data-testid={`dialog-remove-${index}`}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  variant="ghost"
                >
                  {t(locale, 'common.setup.groups.removeTime')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        <Button
          data-testid="dialog-add-time"
          onClick={() => setRows((current) => [...current, DEFAULT_SLOT])}
          variant="secondary"
        >
          {t(locale, 'common.setup.groups.addTime')}
        </Button>

        <ActionBar
          end={
            <Button
              data-testid="group-dialog-save"
              disabled={name.trim() === '' || !rows.some(isComplete)}
              onClick={() => onSave(name.trim(), rows.filter(isComplete))}
            >
              {t(locale, 'common.setup.groups.saveGroup')}
            </Button>
          }
          start={
            <Button data-testid="group-dialog-cancel" onClick={onCancel} variant="ghost">
              {t(locale, 'common.cancel')}
            </Button>
          }
        />
      </div>
    </div>
  )
}

/** "ראשון 17:00–18:00" — one slot, read as a sentence rather than four controls. */
function SlotLine({ locale, slot }: { locale: WizardStepProps['locale']; slot: Slot }) {
  return (
    <span className="setup-slot-line">
      <span>{t(locale, `schedule.weekday.${slot.weekday}`)}</span>
      <RangeText from={slot.start_time} to={slot.end_time} />
    </span>
  )
}

export function makeGroupsStep(client: StructureClient) {
  return function GroupsStep({ locale, status, onDone, onSkip }: WizardStepProps) {
    const [classes, setClasses] = useState<NamedRow[]>([])
    const [groups, setGroups] = useState<GroupRow[]>([])
    const [locations, setLocations] = useState<NamedRow[]>([])
    const [className, setClassName] = useState('')
    const [locationName, setLocationName] = useState('')
    const [busy, setBusy] = useState(false)

    /** Which class the manager is filling in. The whole step is scoped to it. */
    const [activeClass, setActiveClass] = useState<string | null>(null)
    /** `'new'` while adding, a group id while editing, null while closed. */
    const [editing, setEditing] = useState<string | null>(null)

    useEffect(() => {
      let alive = true
      void Promise.all([client.listClasses(), client.listGroups(), client.listLocations()]).then(
        ([c, g, l]) => {
          if (!alive) return
          setClasses(c)
          setGroups(g)
          setLocations(l)
          // Land on a class rather than on a chooser: a club with one class should never
          // have to pick it, and a club with three opens on the first.
          setActiveClass((current) => current ?? c[0]?.id ?? null)
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
      // The year is opened HERE and not on mount: a manager who never adds a time should
      // not have one created behind their back, and this is the first moment the product
      // actually needs one.
      void client
        .ensureTrainingYear()
        .then(() => client.putSchedule(groupId, next.filter(isComplete), todayKey()))
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

    const inClass = groups.filter((group) => group.class_id === activeClass)
    const activeName = classes.find((row) => row.id === activeClass)?.name ?? ''
    const editingGroup = editing && editing !== 'new' ? groups.find((g) => g.id === editing) : null

    /** Save from the dialog: create the group if it is new, then write its hours. */
    const saveFromDialog = (name: string, rows: Slot[]) => {
      const target = editing
      setEditing(null)
      if (target === 'new') {
        if (activeClass === null) return
        run(async () => {
          const row = await client.createGroup(activeClass, name)
          setGroups((current) => [...current, row])
          write(row.id, rows)
        })
        return
      }
      if (target) write(target, rows)
    }

    return (
      <section
        aria-labelledby="setup-groups-title"
        className="setup-step"
        data-testid="setup-step-groups"
      >
        <SectionHeader level={3} title={t(locale, 'common.setup.step.groups')} />
        {/* The step in one line, because its shape is not guessable: a class is the kind
            of training, a group is the people who show up, and the hours hang off the
            group. Managers read "class" as "lesson" until told otherwise. */}
        <p className="setup-step__meta">{t(locale, 'common.setup.groups.explain')}</p>

        {/* ── 1. the class ──────────────────────────────────────────────────────────── */}
        <div className="setup-classes">
          <p className="setup-dialog__legend">{t(locale, 'common.setup.groups.classTitle')}</p>
          {classes.length > 0 ? (
            <ul className="setup-classes__tabs" data-testid="setup-classes">
              {classes.map((row) => (
                <li key={row.id}>
                  <Button
                    aria-pressed={row.id === activeClass}
                    data-selected={row.id === activeClass}
                    data-testid={`setup-class-${row.id}`}
                    onClick={() => setActiveClass(row.id)}
                    variant={row.id === activeClass ? 'secondary' : 'ghost'}
                  >
                    {row.name}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="setup-inline-form">
            <TextField
              label={t(locale, 'common.setup.groups.className')}
              onChange={(event) => setClassName(event.target.value)}
              placeholder={t(locale, 'common.setup.groups.classNamePlaceholder')}
              value={className}
            />
            <Button
              disabled={busy || className.trim() === ''}
              onClick={() =>
                run(async () => {
                  const row = await client.createClass(className.trim())
                  setClasses((current) => [...current, row])
                  // A class created here is the one being filled in — anything else makes
                  // the manager press it themselves to continue.
                  setActiveClass(row.id)
                  setClassName('')
                })
              }
              variant="secondary"
            >
              {t(locale, 'common.setup.groups.addClass')}
            </Button>
          </div>
        </div>

        {/* ── 2. the groups in it ───────────────────────────────────────────────────── */}
        {activeClass === null ? (
          <p className="setup-panel__empty" data-testid="setup-groups-need-class">
            {t(locale, 'common.setup.groups.needClass')}
          </p>
        ) : (
          <div className="setup-groups">
            <div className="setup-groups__head">
              <p className="setup-dialog__legend">
                {t(locale, 'common.setup.groups.inClass').replace('{{class}}', activeName)}
              </p>
              <Button data-testid="setup-add-group" onClick={() => setEditing('new')}>
                {t(locale, 'common.setup.groups.addGroup')}
              </Button>
            </div>

            {inClass.length === 0 ? (
              <p className="setup-panel__empty">{t(locale, 'common.setup.groups.noGroupsYet')}</p>
            ) : (
              <ul className="setup-groups__list" data-testid="setup-groups">
                {inClass.map((row) => {
                  const rows = (slots[row.id] ?? []).filter(isComplete)
                  return (
                    <li
                      className="setup-group-card"
                      data-testid={`setup-group-${row.id}`}
                      key={row.id}
                    >
                      <span className="setup-group-card__name">{row.name}</span>
                      <span className="setup-group-card__when">
                        {rows.length === 0 ? (
                          <span className="setup-group-card__none">
                            {t(locale, 'common.setup.groups.noTimes')}
                          </span>
                        ) : (
                          rows
                            .slice()
                            .sort(
                              (a, b) =>
                                a.weekday - b.weekday || a.start_time.localeCompare(b.start_time),
                            )
                            .map((slot, index) => (
                              <SlotLine key={index} locale={locale} slot={slot} />
                            ))
                        )}
                      </span>
                      <Button
                        data-testid={`setup-edit-group-${row.id}`}
                        onClick={() => setEditing(row.id)}
                        variant="ghost"
                      >
                        {t(locale, 'common.setup.groups.editGroup')}
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
            )}
          </div>
        )}

        {/* ── 3. halls, last, because most clubs have one and never name it ─────────── */}
        <details className="setup-halls">
          <summary>{t(locale, 'common.setup.groups.hallsTitle')}</summary>
          <p className="setup-step__meta">{t(locale, 'common.setup.groups.hallsHint')}</p>
          <div className="setup-inline-form">
            <TextField
              label={t(locale, 'common.setup.groups.locationName')}
              onChange={(event) => setLocationName(event.target.value)}
              value={locationName}
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
              variant="secondary"
            >
              {t(locale, 'common.setup.groups.addLocation')}
            </Button>
          </div>
          <ul className="setup-halls__list" data-testid="setup-locations">
            {locations.map((row) => (
              <li key={row.id}>{row.name}</li>
            ))}
          </ul>
        </details>

        {/* ── the resulting week, across every class ────────────────────────────────── */}
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
                  <li data-empty={onDay.length === 0} key={day}>
                    <span className="setup-week__day">{t(locale, `schedule.weekday.${day}`)}</span>
                    {onDay.length === 0 ? (
                      <span className="setup-week__none">
                        {t(locale, 'common.setup.groups.dayEmpty')}
                      </span>
                    ) : (
                      <ul className="setup-week__list">
                        {onDay.map(({ group, slot }, index) => (
                          <li key={`${group.id}-${index}`}>
                            <RangeText from={slot.start_time} to={slot.end_time} />
                            <span className="setup-week__group">{group.name}</span>
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

        {editing ? (
          <GroupDialog
            className={activeName}
            initialName={editingGroup?.name ?? ''}
            initialSlots={editingGroup ? (slots[editingGroup.id] ?? []) : []}
            locale={locale}
            locations={locations}
            onCancel={() => setEditing(null)}
            onSave={saveFromDialog}
          />
        ) : null}

        <ActionBar
          end={
            <Button disabled={busy || groups.length === 0} onClick={onDone}>
              {t(locale, 'common.setup.continue')}
            </Button>
          }
          start={
            <Button onClick={onSkip} variant="ghost">
              {t(locale, 'common.setup.skip')}
            </Button>
          }
        />
        <p className="setup-step__meta" data-testid="setup-groups-status">
          {t(locale, `common.setup.status.${status}`)}
        </p>
      </section>
    )
  }
}
