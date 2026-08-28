// F3 — D5's promise, kept: "clicking a session opens a popover with the roster and
// inline attendance marking — never leave the calendar to take a register." The roster
// half is `1e`'s QuickViewRoster, built and tested since M5 and mounted by nothing until
// this file. The actions half is §5.6's per-session overrides, whose routes shipped in W2
// and which the calendar never called.
//
// Focus-trapped and keyboard-operable through the same `useModalDialog` every dialog W6's
// sweep fixed uses. Dismissal: the backdrop, Escape, and the roster's own close button.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, TextField, useModalDialog } from '@studio/ui'
import { studioDayKey, studioWallTimeToUtc } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { QuickViewRoster } from '../attendance'
import type { DashboardAttendanceClient, DashboardSessionRoster } from '../attendance'
import { ConfirmDialog } from '../rollover/ConfirmDialog'
import type { ScheduleClient, SessionRow } from './client'

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, var(--fg) 40%, transparent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-4)',
  zIndex: 30,
}

const panelStyle: CSSProperties = {
  background: 'var(--ground)',
  borderRadius: 'var(--radius-lg)',
  border: 'var(--border-width-hairline) solid var(--border)',
  padding: 'var(--space-4)',
  maxBlockSize: '85vh',
  overflowY: 'auto',
  inlineSize: 'min(28rem, 100%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const rowStyle: CSSProperties = { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'end' }

/** The wall-clock `HH:mm` of an instant, for prefilling the move form. */
function wallTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

type StaffMember = { person_id: string | null; first_name: string | null; last_name: string | null; roles: string[] }

export function SessionPopover({
  locale,
  session,
  client,
  attendanceClient,
  fetcher,
  onClose,
  onChanged,
}: {
  locale: Locale
  session: SessionRow
  client: ScheduleClient
  attendanceClient: DashboardAttendanceClient
  /** For the staff list — best-effort; a coach's 403 hides the coach select. */
  fetcher: (path: string, init?: RequestInit) => Promise<Response>
  onClose: () => void
  onChanged: () => void
}) {
  const dialog = useModalDialog(true, onClose)
  const [roster, setRoster] = useState<DashboardSessionRoster | null>(null)
  const [rosterVersion, setRosterVersion] = useState(0)
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [day, setDay] = useState(() => studioDayKey(session.starts_at))
  const [startTime, setStartTime] = useState(() => wallTime(session.starts_at))
  const [endTime, setEndTime] = useState(() => wallTime(session.ends_at))
  const [cancelReason, setCancelReason] = useState('')
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [confirming, setConfirming] = useState<'cancel' | 'delete' | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void attendanceClient
      .sessionRoster(session.id)
      .then((body) => live && setRoster(body))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [attendanceClient, session.id, rosterVersion])

  useEffect(() => {
    let live = true
    void client
      .listLocations()
      .then((rows) => live && setLocations(rows))
      .catch(() => undefined)
    void fetcher('/api/v1/staff')
      .then(async (response) =>
        response.ok ? ((await response.json()) as { items: StaffMember[] }).items : [],
      )
      .then((rows) => live && setStaff(rows.filter((row) => row.person_id !== null)))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, fetcher])

  const coaches = useMemo(
    // 2026-08-28 (owner report): EVERY staff member is assignable, not only role-holding
    // coaches. In a small club the owner teaching a class is the norm, and this filter
    // meant "I can pick every coach except myself".
    () => staff,
    [staff],
  )

  const act = (work: Promise<unknown>, closeAfter = true) => {
    setFailed(null)
    void work
      .then(() => {
        onChanged()
        if (closeAfter) onClose()
      })
      .catch((error: unknown) => setFailed(String(error)))
  }

  return (
    <div data-testid="session-popover-backdrop" onClick={onClose} style={backdropStyle}>
      <div
        aria-label={`${session.group_name} · ${wallTime(session.starts_at)}`}
        aria-modal="true"
        data-testid="session-popover"
        onClick={(event) => event.stopPropagation()}
        ref={dialog}
        role="dialog"
        style={panelStyle}
      >
        {roster ? (
          <QuickViewRoster
            locale={locale}
            onBulkPresent={() =>
              void attendanceClient
                .bulkPresent(session.id)
                .then(() => setRosterVersion((n) => n + 1))
                .catch(() => undefined)
            }
            onClose={onClose}
            onMark={(studentId, status) =>
              void attendanceClient
                .mark(session.id, { studentId, status })
                .then(() => setRosterVersion((n) => n + 1))
                .catch(() => undefined)
            }
            roster={roster.roster}
          />
        ) : (
          <p data-testid="popover-roster-loading">{t(locale, 'common.setup.loading')}</p>
        )}

        <section aria-label={t(locale, 'schedule.session.actions')}>
          <h3>{t(locale, 'schedule.session.actions')}</h3>

          {/* Move — starts_at and ends_at travel together; SessionPatch 422s otherwise. */}
          <div style={rowStyle}>
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
              data-testid="popover-move"
              onClick={() =>
                act(
                  client.patchSession(session.id, {
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

          {/* Room. Absence is not null: sending null clears, omitting leaves alone. */}
          <div style={rowStyle}>
            <label>
              {t(locale, 'schedule.session.changeRoom')}
              <select
                data-testid="popover-room"
                onChange={(event) =>
                  act(
                    client.patchSession(session.id, {
                      location_id: event.target.value === '' ? null : event.target.value,
                    }),
                  )
                }
                value={session.location_id ?? ''}
              >
                <option value="">{t(locale, 'schedule.session.noLocation')}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            {coaches.length > 0 ? (
              <label>
                {t(locale, 'schedule.session.changeCoach')}
                <select
                  data-testid="popover-coach"
                  onChange={(event) => {
                    if (event.target.value === '') return
                    act(
                      client.patchSession(session.id, {
                        staff: [
                          {
                            person_id: event.target.value,
                            role: 'lead_coach',
                            is_substitute: true,
                          },
                        ],
                      }),
                    )
                  }}
                  value={session.staff[0]?.person_id ?? ''}
                >
                  <option value="">{t(locale, 'schedule.session.noCoach')}</option>
                  {coaches.map((coach) => (
                    <option key={coach.person_id} value={coach.person_id ?? ''}>
                      {`${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim()}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {/* Note. */}
          <div style={rowStyle}>
            <TextField
              label={t(locale, 'schedule.note.add')}
              onChange={(event) => {
                setNote(event.target.value)
                setNoteSaved(false)
              }}
              value={note}
            />
            <Button
              data-testid="popover-note"
              disabled={note.trim() === ''}
              onClick={() => {
                setFailed(null)
                void client
                  .addSessionNote(session.id, note.trim())
                  .then(() => {
                    setNote('')
                    setNoteSaved(true)
                  })
                  .catch((error: unknown) => setFailed(String(error)))
              }}
              variant="secondary"
            >
              {t(locale, 'schedule.note.add')}
            </Button>
            {noteSaved ? <span data-testid="popover-note-saved">{t(locale, 'schedule.note.saved')}</span> : null}
          </div>

          {/* Cancel — a reason is required; the column's check constraint says so too. */}
          {session.status !== 'cancelled' ? (
            <div style={rowStyle}>
              <TextField
                label={t(locale, 'schedule.session.cancelReason')}
                onChange={(event) => setCancelReason(event.target.value)}
                value={cancelReason}
              />
              <Button
                data-testid="popover-cancel"
                disabled={cancelReason.trim() === ''}
                onClick={() => setConfirming('cancel')}
                variant="destructive"
              >
                {t(locale, 'schedule.session.cancel')}
              </Button>
            </div>
          ) : null}

          {/* Delete — ad-hoc only. The server 409s a generated session regardless; the
              menu simply does not offer what the server would refuse. */}
          {session.is_ad_hoc ? (
            <Button
              data-testid="popover-delete"
              onClick={() => setConfirming('delete')}
              variant="destructive"
            >
              {t(locale, 'schedule.session.delete')}
            </Button>
          ) : null}

          {failed ? (
            <p data-testid="popover-failed" style={{ color: 'var(--danger)' }}>
              {t(locale, 'common.loadFailed.body')}
            </p>
          ) : null}
        </section>

        {confirming === 'cancel' ? (
          <ConfirmDialog
            body={cancelReason}
            confirmLabel={t(locale, 'schedule.session.cancel')}
            locale={locale}
            onCancel={() => setConfirming(null)}
            onConfirm={() => {
              setConfirming(null)
              act(client.cancelSession(session.id, cancelReason.trim()))
            }}
            testId="confirm-cancel-session"
            title={t(locale, 'schedule.session.cancel')}
            titleId="confirm-cancel-session-title"
          />
        ) : null}
        {confirming === 'delete' ? (
          <ConfirmDialog
            body={t(locale, 'schedule.session.deleteConfirm')}
            confirmLabel={t(locale, 'schedule.session.delete')}
            locale={locale}
            onCancel={() => setConfirming(null)}
            onConfirm={() => {
              setConfirming(null)
              act(client.deleteSession(session.id))
            }}
            testId="confirm-delete-session"
            title={t(locale, 'schedule.session.delete')}
            titleId="confirm-delete-session-title"
          />
        ) : null}
      </div>
    </div>
  )
}
