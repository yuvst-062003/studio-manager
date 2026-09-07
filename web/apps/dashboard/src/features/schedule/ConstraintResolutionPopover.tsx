// §5/C12 of the staff app redesign — the resolution popup opened from the coach-constraints
// alert (`CoachConstraintsAlert.tsx`). Decisions 10, 11, 12:
//
// - **Decision 11**: an alert opening a popup that carries the constraint (who, when, why,
//   their note) and offers replacements and actions — cancel the session, move it.
// - **Decision 10**: approve or refuse the constraint AS A WHOLE, the coach told either way
//   (`app/services/schedule/constraints.py::CoachConstraintService._notify_decision`).
// - **Decision 12**: the substitute picker is "just who's free, no ranking" — every row
//   from `GET /staff/available` renders, the unavailable ones greyed rather than removed,
//   because sometimes the manager asks the busy person anyway.
//
// **Approving records the decision. It does not walk the schedule.** Reassigning,
// cancelling or moving a session is the manager choosing ONE session from the list below and
// acting on it through the existing endpoints (`SessionPopover.tsx`'s own `client.
// patchSession` / `client.cancelSession`) — never a bulk "apply to every affected session",
// which is the half-applied outcome §6.1 refuses and which has no good recovery.
//
// Focus-trapped the same way `SessionPopover.tsx` is: `useModalDialog` from `@studio/ui`,
// with `ConfirmDialog` nested for the one irreversible action (cancelling a session) —
// the same two-dialog composition `SessionPopover.tsx` already ships and tests green.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Radio, TextField, useModalDialog } from '@studio/ui'
import { fill, formatDateInStudioZone, formatTimeInStudioZone, studioDayKey, studioWallTimeToUtc } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ConfirmDialog } from '../rollover/ConfirmDialog'
import type { ScheduleClient, SessionRow } from './client'
import {
  CoachConstraintApiError,
  staffDisplayName,
} from './coachConstraintsClient'
import type { CoachConstraintClient, CoachConstraintRow, StaffAvailabilityRow, StaffDirectoryRow } from './coachConstraintsClient'

const DAY_MS = 86_400_000

/** The inverse of `nextDayKey` in the staff app's own `CoachConstraintsScreen.tsx` — kept
 *  as a small local copy rather than a shared import: `packages/core` is out of scope for
 *  this checkpoint, and this is the only place on the dashboard that needs it. */
function previousDayKey(key: string): string {
  return studioDayKey(new Date(new Date(`${key}T12:00:00Z`).getTime() - DAY_MS))
}

/** The constraint's own window, in one string — mirrors `CoachConstraintsScreen.tsx`'s
 *  `whenLabel`, which a manager reading this popup and a coach reading their own history
 *  should see rendered the same way. All-day's `ends_at` is exclusive midnight of the day
 *  AFTER the last covered one, so an all-day row steps back a calendar day before
 *  formatting or a single day off reads as a two-day range. */
export function constraintWindowLabel(row: CoachConstraintRow, locale: Locale): string {
  if (row.all_day) {
    const startKey = studioDayKey(row.starts_at)
    const lastCoveredKey = previousDayKey(studioDayKey(row.ends_at))
    const startLabel = formatDateInStudioZone(row.starts_at, locale)
    if (startKey === lastCoveredKey) return startLabel
    const endLabel = formatDateInStudioZone(`${lastCoveredKey}T12:00:00Z`, locale)
    return `${startLabel} – ${endLabel}`
  }
  const startDay = formatDateInStudioZone(row.starts_at, locale)
  const endDay = formatDateInStudioZone(row.ends_at, locale)
  const range = startDay === endDay ? startDay : `${startDay} – ${endDay}`
  const from = formatTimeInStudioZone(row.starts_at, locale)
  const to = formatTimeInStudioZone(row.ends_at, locale)
  return `${range} · ${from}–${to}`
}

function wallTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

function messageOf(locale: Locale, error: unknown): string {
  return error instanceof CoachConstraintApiError ? error.message : t(locale, 'common.error.generic')
}

const fieldsetStyle: CSSProperties = {
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-2)',
}

const pickerRowStyle = (available: boolean): CSSProperties => ({
  opacity: available ? 1 : 0.55,
})

/**
 * Decision 12, as a control: every staff row from `GET /staff/available` renders, in the
 * order the server returned it (already sorted, never re-sorted here — "no ranking"). An
 * unavailable row is NOT `disabled` — it stays a real, keyboard-reachable radio, dimmed by
 * style alone, so a manager can still pick the busy person on purpose.
 */
function StaffAvailabilityPicker({
  legend,
  name,
  rows,
  value,
  onChange,
  locale,
}: {
  legend: string
  name: string
  rows: StaffAvailabilityRow[]
  value: string
  onChange: (personId: string) => void
  locale: Locale
}) {
  return (
    <fieldset style={fieldsetStyle}>
      <legend>{legend}</legend>
      {rows.length === 0 ? (
        <p>{t(locale, 'schedule.constraint.manager.noStaff')}</p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((row) => (
            <li
              data-available={row.available}
              data-testid={`availability-${row.person_id}`}
              key={row.person_id}
              style={pickerRowStyle(row.available)}
            >
              <Radio
                checked={value === row.person_id}
                label={
                  row.available
                    ? row.display_name
                    : `${row.display_name} — ${t(locale, 'schedule.constraint.manager.unavailableTag')}`
                }
                name={name}
                onChange={() => onChange(row.person_id)}
                value={row.person_id}
              />
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}

/**
 * One session the constraint's window overlaps, with the three ways out §5 names —
 * replace the coach, cancel it, move it — each acting on THIS session alone through the
 * same calls `SessionPopover.tsx` already uses.
 */
function AffectedSessionRow({
  locale,
  session,
  availability,
  scheduleClient,
  onChanged,
  onError,
}: {
  locale: Locale
  session: SessionRow
  availability: StaffAvailabilityRow[]
  scheduleClient: ScheduleClient
  onChanged: () => void
  onError: (message: string) => void
}) {
  const [replacement, setReplacement] = useState('')
  const [day, setDay] = useState(() => studioDayKey(session.starts_at))
  const [startTime, setStartTime] = useState(() => wallTime(session.starts_at))
  const [endTime, setEndTime] = useState(() => wallTime(session.ends_at))
  const [cancelReason, setCancelReason] = useState('')
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [busy, setBusy] = useState(false)

  const act = (work: Promise<unknown>) => {
    setBusy(true)
    void work
      .then(() => onChanged())
      .catch((error: unknown) => onError(messageOf(locale, error)))
      .finally(() => setBusy(false))
  }

  const leadStaff = session.staff[0]
  const currentCoach = leadStaff
    ? availability.find((row) => row.person_id === leadStaff.person_id)?.display_name ?? leadStaff.display_name
    : null

  return (
    <li
      data-testid={`affected-session-${session.id}`}
      style={{
        border: 'var(--border-width-hairline) solid var(--border)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
      }}
    >
      <p style={{ margin: 0 }}>
        <bdi>{session.group_name}</bdi>
        {' · '}
        <bdi dir="ltr">
          {formatDateInStudioZone(session.starts_at, locale)} {formatTimeInStudioZone(session.starts_at, locale)}–
          {formatTimeInStudioZone(session.ends_at, locale)}
        </bdi>
      </p>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        {currentCoach
          ? fill(t(locale, 'schedule.constraint.manager.currentCoach'), { name: currentCoach })
          : t(locale, 'schedule.constraint.manager.noCurrentCoach')}
      </p>

      {/* Replace the coach — decision 12's picker, scoped to this one session. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <StaffAvailabilityPicker
          legend={t(locale, 'schedule.constraint.manager.replaceCoachLegend')}
          locale={locale}
          name={`replace-${session.id}`}
          onChange={setReplacement}
          rows={availability}
          value={replacement}
        />
        <Button
          data-testid={`replace-coach-${session.id}`}
          disabled={!replacement || busy}
          onClick={() =>
            act(
              scheduleClient.patchSession(session.id, {
                staff: [{ person_id: replacement, role: 'lead_coach', is_substitute: true }],
              }),
            )
          }
          variant="secondary"
        >
          {t(locale, 'schedule.session.changeCoach')}
        </Button>
      </div>

      {/* Move — starts_at and ends_at travel together, same as `SessionPopover.tsx`. */}
      <div style={{ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <TextField
          label={t(locale, 'schedule.session.adHocDate')}
          onChange={(event) => setDay(event.target.value)}
          type="date"
          value={day}
        />
        <TextField
          label={t(locale, 'schedule.session.adHocStart')}
          onChange={(event) => setStartTime(event.target.value)}
          type="time"
          value={startTime}
        />
        <TextField
          label={t(locale, 'schedule.session.adHocEnd')}
          onChange={(event) => setEndTime(event.target.value)}
          type="time"
          value={endTime}
        />
        <Button
          data-testid={`move-session-${session.id}`}
          disabled={busy}
          onClick={() =>
            act(
              scheduleClient.patchSession(session.id, {
                starts_at: studioWallTimeToUtc(day, startTime),
                ends_at: studioWallTimeToUtc(day, endTime),
              }),
            )
          }
          variant="secondary"
        >
          {t(locale, 'schedule.session.editTime')}
        </Button>
      </div>

      {/* Cancel — a reason is required before the button enables, the same rule
          `SessionPopover.tsx` already applies and the column's own check constraint
          restates server-side. */}
      {session.status !== 'cancelled' ? (
        <div style={{ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <TextField
            label={t(locale, 'schedule.session.cancelReason')}
            onChange={(event) => setCancelReason(event.target.value)}
            value={cancelReason}
          />
          <Button
            data-testid={`cancel-session-${session.id}`}
            disabled={cancelReason.trim() === '' || busy}
            onClick={() => setConfirmingCancel(true)}
            variant="destructive"
          >
            {t(locale, 'schedule.session.cancel')}
          </Button>
        </div>
      ) : null}

      {confirmingCancel ? (
        <ConfirmDialog
          body={cancelReason}
          confirmLabel={t(locale, 'schedule.session.cancel')}
          locale={locale}
          onCancel={() => setConfirmingCancel(false)}
          onConfirm={() => {
            setConfirmingCancel(false)
            act(scheduleClient.cancelSession(session.id, cancelReason.trim()))
          }}
          testId={`confirm-cancel-${session.id}`}
          title={t(locale, 'schedule.session.cancel')}
          titleId={`confirm-cancel-${session.id}-title`}
        />
      ) : null}
    </li>
  )
}

export function ConstraintResolutionPopover({
  locale,
  constraint,
  filerName,
  client,
  scheduleClient,
  onClose,
  onResolved,
}: {
  locale: Locale
  constraint: CoachConstraintRow
  filerName: string
  client: CoachConstraintClient
  scheduleClient: ScheduleClient
  onClose: () => void
  onResolved: () => void
}) {
  const dialog = useModalDialog(true, onClose)
  const [availability, setAvailability] = useState<StaffAvailabilityRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsFailed, setSessionsFailed] = useState(false)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [approveSubstitute, setApproveSubstitute] = useState(constraint.substitute_person_id ?? '')
  const [refuseReason, setRefuseReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [decided, setDecided] = useState<'approved' | 'refused' | null>(null)

  useEffect(() => {
    let live = true
    void client
      .staffAvailable(constraint.starts_at, constraint.ends_at)
      .then((rows) => live && setAvailability(rows))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, constraint.starts_at, constraint.ends_at])

  useEffect(() => {
    let live = true
    void scheduleClient
      .listSessions({
        from: studioDayKey(constraint.starts_at),
        to: studioDayKey(constraint.ends_at),
        coachPersonId: constraint.person_id,
      })
      .then((rows) => {
        if (!live) return
        // §5 — "the sessions the constraint's window actually overlaps". The date-ranged
        // fetch above is coarser than the constraint's own instants (a two-hour window
        // still asks for that whole calendar day), so the real half-open overlap test —
        // the one `CoachConstraintService.is_available` runs server-side — is re-applied
        // here rather than trusted from the date filter alone.
        setSessions(
          rows.filter((row) => row.starts_at < constraint.ends_at && row.ends_at > constraint.starts_at),
        )
      })
      .catch(() => live && setSessionsFailed(true))
    return () => {
      live = false
    }
  }, [scheduleClient, constraint.starts_at, constraint.ends_at, constraint.person_id, sessionVersion])

  const decide = (kind: 'approved' | 'refused', work: Promise<unknown>) => {
    setBusy(true)
    setError(null)
    void work
      .then(() => {
        setDecided(kind)
        onResolved()
      })
      .catch((err: unknown) => setError(messageOf(locale, err)))
      .finally(() => setBusy(false))
  }

  return (
    <div data-testid="constraint-resolution-backdrop" onClick={onClose} style={{
      alignItems: 'center',
      background: 'color-mix(in srgb, var(--fg) 40%, transparent)',
      display: 'flex',
      inset: 0,
      justifyContent: 'center',
      padding: 'var(--space-4)',
      position: 'fixed',
      zIndex: 30,
    }}>
      <div
        aria-label={`${t(locale, 'schedule.constraint.manager.dialogTitle')} · ${filerName}`}
        aria-modal="true"
        data-testid="constraint-resolution-popover"
        onClick={(event) => event.stopPropagation()}
        ref={dialog}
        role="dialog"
        style={{
          background: 'var(--ground)',
          border: 'var(--border-width-hairline) solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          inlineSize: 'min(34rem, 100%)',
          maxBlockSize: '85vh',
          overflowY: 'auto',
          padding: 'var(--space-4)',
        }}
      >
        <header>
          <h2 style={{ margin: 0 }}>{t(locale, 'schedule.constraint.manager.dialogTitle')}</h2>
          <p style={{ fontWeight: 'var(--weight-medium)', margin: 0 }}>
            {fill(t(locale, 'schedule.constraint.manager.filedBy'), { name: filerName })}
          </p>
          <p style={{ margin: 0 }}>
            <span>{t(locale, 'schedule.constraint.manager.window')}</span>: {constraintWindowLabel(constraint, locale)}
          </p>
          <p style={{ margin: 0 }}>
            <span>{t(locale, 'schedule.constraint.manager.reason')}</span>:{' '}
            {t(locale, `schedule.constraint.reason.${constraint.reason}`)}
          </p>
          {constraint.note ? (
            <p style={{ margin: 0 }}>
              <span>{t(locale, 'schedule.constraint.manager.note')}</span>: {constraint.note}
            </p>
          ) : null}
        </header>

        <section aria-label={t(locale, 'schedule.constraint.manager.affectedSessions')}>
          <h3>{t(locale, 'schedule.constraint.manager.affectedSessions')}</h3>
          {sessionsFailed ? (
            <p data-testid="affected-sessions-failed">{t(locale, 'schedule.constraint.manager.sessionsLoadFailed')}</p>
          ) : sessions.length === 0 ? (
            <p data-testid="affected-sessions-empty">{t(locale, 'schedule.constraint.manager.noAffectedSessions')}</p>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', listStyle: 'none', margin: 0, padding: 0 }}>
              {sessions.map((session) => (
                <AffectedSessionRow
                  availability={availability}
                  key={session.id}
                  locale={locale}
                  onChanged={() => setSessionVersion((n) => n + 1)}
                  onError={setError}
                  scheduleClient={scheduleClient}
                  session={session}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t(locale, 'schedule.constraint.manager.decisionTitle')}>
          <h3>{t(locale, 'schedule.constraint.manager.decisionTitle')}</h3>

          <StaffAvailabilityPicker
            legend={t(locale, 'schedule.constraint.manager.substituteLegend')}
            locale={locale}
            name="approve-substitute"
            onChange={setApproveSubstitute}
            rows={availability}
            value={approveSubstitute}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBlockStart: 'var(--space-2)' }}>
            <Button
              data-testid="constraint-approve"
              disabled={busy || decided !== null}
              onClick={() =>
                decide(
                  'approved',
                  client.approve(constraint.id, approveSubstitute === '' ? undefined : approveSubstitute),
                )
              }
            >
              {t(locale, 'schedule.constraint.manager.approve')}
            </Button>
          </div>

          <div style={{ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBlockStart: 'var(--space-3)' }}>
            <TextField
              label={t(locale, 'schedule.constraint.manager.refuseReasonLabel')}
              onChange={(event) => setRefuseReason(event.target.value)}
              value={refuseReason}
            />
            <Button
              data-testid="constraint-refuse"
              disabled={busy || decided !== null || refuseReason.trim() === ''}
              onClick={() => decide('refused', client.refuse(constraint.id, refuseReason.trim()))}
              variant="destructive"
            >
              {t(locale, 'schedule.constraint.manager.refuse')}
            </Button>
          </div>

          {decided === 'approved' ? (
            <p data-testid="constraint-decided" role="status">
              {t(locale, 'schedule.constraint.manager.decidedApproved')}
            </p>
          ) : null}
          {decided === 'refused' ? (
            <p data-testid="constraint-decided" role="status">
              {t(locale, 'schedule.constraint.manager.decidedRefused')}
            </p>
          ) : null}

          {error ? (
            <p data-testid="constraint-error" role="alert" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}

/** `GET /api/v1/staff` → a display name for one id, falling back to the id itself if the
 *  directory read failed or the person is somehow absent from it. `CoachConstraintsAlert.tsx`
 *  builds one directory read and reuses it for every row's filer name and every popup it
 *  opens, rather than each popup re-fetching the whole staff list for one name. */
export function nameFromDirectory(rows: StaffDirectoryRow[], personId: string): string {
  const row = rows.find((candidate) => candidate.person_id === personId)
  return row ? staffDisplayName(row) || personId : personId
}
