// 9i's `רשימת משתתפים` — who is coming, who has not answered, whose consent is signed.
//
// A separate screen from `ExamResultsScreen` on purpose: the participants list is about an
// event still AHEAD (chasing answers), the result sheet is about one already held. Routing
// both from `#/events/<id>` made every future event open an exam sheet whose eligibility
// read had nothing to say.
//
// **No money.** `EventRegistrationOut` carries `charge_id` and no amount, and this screen
// renders neither — §3.2's rule is kept by omission, same as the events list.
//
// **C3 (2026-09-06) gave this screen the session register's card shapes** — the rounded-3xl
// header, the rounded-2xl rows, the hairline borders and `shadow-xs` `RosterScreen.tsx`
// carries — so the two read as one screen, per §4.3: "This same screen shape serves an
// event's register."
//
// **Checkpoint 13 (2026-09-07) — §6.5 of the staff app redesign, decision 14 — makes the
// mark itself queue and flush exactly like a session's**, replacing the online-only write
// this screen shipped with one wave earlier. Two things follow, both copied from
// `RosterScreen.tsx` rather than reinvented, because that screen is the reference this one
// is restyled from and decision 14 makes their offline machinery identical:
//
//   * the read is cache-first — a live fetch, and on failure the SAME `readRoster` this
//     screen's session sibling already reads from (events ride in the same IndexedDB table,
//     tagged `kind: 'event'` — see `packages/core/src/offline/cache.ts`). The cache carries
//     no RSVP and no consent timestamp (`RosterRow` has neither field), so those two chips
//     are shown only when the read was LIVE — rendering "pending" for a consent nobody
//     could actually check would be exactly the false claim §4.9's own rules forbid
//     elsewhere in this redesign.
//   * the mark is optimistic and queued (`queueMark`, kind `event.attendance`), never a
//     direct `client.markAttendance` call from a tap handler — the same reasoning
//     `features/attendance/client.ts`'s own header comment gives for why THAT client has no
//     such method: "an invitation to call it from a tap handler... the exact branch that
//     works in the office and fails in a basement." `client.markAttendance` is gone from
//     `client.ts` for the same reason `bulkPresent` is never called directly there either —
//     the queue's flusher (`packages/core/src/offline/sync.ts::sendEventBatch`) is the only
//     caller left, and it talks to the server directly through the generic `post` it is
//     given, not through this typed client at all.
//
// The "requires a connection" guard this screen shipped with is gone. It was correct for
// exactly one wave: nothing queued a mark yet, so disabling the control and saying why was
// the honest alternative to a tap that silently went nowhere. Now that a tap is genuinely
// queued and genuinely flushed, disabling it would be the same mistake `RosterScreen` never
// makes — a working queue with a control switched off in front of it.
import { useEffect, useMemo, useState } from 'react'
import { Alert, AttendanceMark, EmptyState, StatusChip } from '@studio/ui'
import {
  offlineStorageIsDurable,
  offlineStore,
  queueMark,
  readRoster,
  usePendingCount,
  useStaleQueueWarning,
} from '@studio/core'
import type { RosterRow } from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { EventRegistrationOut, StaffEventsClient } from './client'

/** The three renderable marks over a boolean-or-unset field. Never `notified`/`planned` —
 *  `AttendanceState`'s other two members — because nothing in this screen's data can hold
 *  either fact. */
type MarkState = 'present' | 'absent' | 'unmarked'

function markState(attended: boolean | null): MarkState {
  if (attended === true) return 'present'
  if (attended === false) return 'absent'
  return 'unmarked'
}

/** The label doubles as the button's accessible name (with the student's own name) and as
 *  `AttendanceMark`'s required `label` — one string, so the two can never disagree about
 *  what state is showing. */
const MARK_LABEL: Record<MarkState, string> = {
  present: 'attendance.roster.present',
  absent: 'attendance.roster.absent',
  unmarked: 'attendance.roster.unmarked',
}

/** Two states, not three: a fresh mark always lands on "present", and the only other place
 *  to go from either marked state is the other one. There is no way back to `unmarked`
 *  through this control — `EventAttendanceMarkIn.attended` is a `bool`, not an optional one,
 *  so the server has nothing an "un-mark" tap could send. */
function nextAttended(current: boolean | null): boolean {
  return current !== true
}

const MARK_TONE: Record<MarkState, string> = {
  present: 'border-[var(--paid)] bg-[var(--paid-tint)] text-[var(--paid)]',
  absent: 'border-[var(--danger)] bg-[var(--danger-tint)] text-[var(--danger)]',
  unmarked: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]',
}

function rsvpTone(rsvp: EventRegistrationOut['rsvp']): 'paid' | 'cancelled' | 'pending' {
  if (rsvp === 'yes') return 'paid'
  if (rsvp === 'no') return 'cancelled'
  return 'pending'
}

/**
 * One row, read either LIVE (`EventRegistrationOut`, full detail) or from the offline
 * CACHE (`RosterRow`, attendance only). The screen renders from this one shape rather than
 * branching on where a row came from at every render site — `source` is the one place that
 * distinction lives, and it gates only the two fields the cache cannot honestly answer.
 */
type ViewRow = {
  student_id: string
  display_name: string
  rsvp: EventRegistrationOut['rsvp'] | null
  consent_signed_at: string | null
  attended: boolean | null
}

function fromRegistration(row: EventRegistrationOut): ViewRow {
  return {
    student_id: row.student_id,
    display_name: row.student_display_name,
    rsvp: row.rsvp,
    consent_signed_at: row.consent_signed_at,
    attended: row.attended,
  }
}

/** The cache carries no RSVP and no consent timestamp — `RosterRow` has neither field, and
 *  inventing a value here would be exactly the false claim this redesign's §4.9 rules forbid
 *  elsewhere ("nothing claims delivery... nothing is known"). `null` on both is the honest
 *  answer, and the render below treats `null` as "do not show this chip" rather than as a
 *  particular RSVP or an unsigned consent. */
function fromCachedRow(row: RosterRow): ViewRow {
  return {
    student_id: row.student_id,
    display_name: row.display_name,
    rsvp: null,
    consent_signed_at: null,
    attended: row.status === 'present' ? true : row.status.startsWith('absent') ? false : null,
  }
}

export function EventRosterScreen({
  client,
  eventId,
  locale,
  clock = () => new Date().toISOString(),
  personId = null,
}: {
  client: StaffEventsClient
  eventId: string
  locale: Locale
  /** The device clock, as a function — see `RosterScreen`'s own comment on why a function
   *  and not a fixed instant: `device_marked_at` has to advance between two taps. */
  clock?: () => string
  personId?: string | null
}) {
  const [rows, setRows] = useState<ViewRow[] | null>(null)
  const [requiresConsent, setRequiresConsent] = useState(false)
  // §6.5 — the SAME queue a session mark uses, so the SAME risk applies: unsynced work is
  // not guaranteed to survive a reload on every device (§6.5 of the offline design).
  const pending = usePendingCount()
  const stale = useStaleQueueWarning(clock)

  useEffect(() => {
    let live = true
    Promise.all([client.read(eventId), client.registrations(eventId)])
      .then(([event, page]) => {
        if (!live) return
        setRequiresConsent(event.requires_consent)
        setRows(page.items.map(fromRegistration))
      })
      .catch(async () => {
        // Offline is not an error state on this screen — the same rule `RosterScreen`
        // states at its own read effect. An event's roster rides in the SAME cache a
        // session's does (§6.5), tagged `kind: 'event'` but keyed and read identically, so
        // `readRoster` needs no event-specific branch to serve it back.
        if (!live) return
        const cached = await readRoster(offlineStore(), eventId)
        if (!live) return
        if (cached) setRows(cached.map(fromCachedRow))
      })
    return () => {
      live = false
    }
  }, [client, eventId])

  const total = rows?.length ?? 0
  const present = useMemo(() => rows?.filter((row) => row.attended === true).length ?? 0, [rows])

  function mark(row: ViewRow, attended: boolean): void {
    // §5.7 / §6.5 — "Marks are written to the local store first and the UI updates
    // immediately." Optimistic, unconditionally, exactly as `RosterScreen.tsx`'s own mark
    // handler: a screen with an online path and an offline path has one path nobody
    // exercises until a coach is in a basement.
    setRows(
      (current) =>
        current?.map((one) =>
          one.student_id === row.student_id ? { ...one, attended } : one,
        ) ?? current,
    )
    void queueMark({
      // Stable per (event, student), so a coach cycling a row three times leaves one op
      // carrying their final answer — the identical reasoning `RosterScreen.tsx`'s own
      // `markId` gives, adapted here rather than imported across the two screens (the two
      // already duplicate `withMonoNumerals` for the same cross-lane reason stated there).
      clientMarkId: markId(eventId, row.student_id),
      kind: 'event.attendance',
      sessionId: eventId,
      studentId: row.student_id,
      payload: { attended },
      deviceMarkedAt: clock(),
      personId,
    })
  }

  // §6.5 — "shows a **blocking** warning when unsynced work has been queued for more than
  // one session." The identical guard `RosterScreen.tsx` renders, because it is the
  // identical queue: a coach with a session register AND an event register both unsynced
  // is one coach with one at-risk device, not two independent risks.
  if (stale?.blocking === true || (pending > 0 && !offlineStorageIsDurable())) {
    return (
      <section className="flex flex-col gap-3 px-4 pt-4" data-testid="event-roster-stale-block">
        <Alert iconLabel={t(locale, 'attendance.sync.staleWarning')} live tone="danger">
          <strong>{t(locale, 'attendance.sync.staleWarning')}</strong>
          <span>{t(locale, 'attendance.sync.staleBody')}</span>
        </Alert>
        <p className="text-xs font-semibold text-[var(--text-muted)]">
          {plural(locale, 'attendance.sync.pendingCount', pending)}
        </p>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="event-roster-title"
      className="flex flex-col gap-4 px-4 pt-4"
      data-testid="event-roster"
    >
      <header className="flex items-start justify-between gap-3 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xs">
        <h1 className="text-base font-black text-[var(--fg)]" id="event-roster-title">
          {t(locale, 'events.roster.title')}
        </h1>
        {/* The session register's live counter (`RosterScreen`'s `roster-live-count`), over
            every registration rather than an "expected today" subset — an event has no
            weekly schedule for "expected" to mean anything against. */}
        {rows !== null ? (
          <p
            className="shrink-0 text-end text-sm font-black text-[var(--fg)]"
            data-testid="event-roster-live-count"
          >
            {t(locale, 'attendance.roster.presentOfTotal')
              .replace('{{present}}', String(present))
              .replace('{{total}}', String(total))}
          </p>
        ) : null}
      </header>

      {rows === null ? null : rows.length === 0 ? (
        <EmptyState title={t(locale, 'events.roster.empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const state = markState(row.attended)
            const label = `${t(locale, MARK_LABEL[state])} · ${row.display_name}`
            return (
              <li
                className="flex min-h-11 flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 shadow-xs"
                data-testid="event-roster-row"
                key={row.student_id}
              >
                <bdi className="me-auto text-sm font-bold text-[var(--fg)]">{row.display_name}</bdi>
                {/* RSVP and consent are `null` on a cached row (the offline read has neither
                    field) — rendering "pending" or "not signed" for a fact this device
                    cannot actually check would be the false claim §4.9's rules forbid
                    elsewhere in this redesign, so the chip is simply not drawn rather than
                    drawn wrong. */}
                {row.rsvp !== null ? (
                  <StatusChip label={t(locale, `events.rsvp.${row.rsvp}`)} status={rsvpTone(row.rsvp)} />
                ) : null}
                {requiresConsent && row.rsvp !== null ? (
                  <StatusChip
                    label={t(
                      locale,
                      row.consent_signed_at ? 'events.consent.signed' : 'events.consent.pending',
                    )}
                    status={row.consent_signed_at ? 'paid' : 'pending'}
                  />
                ) : null}
                {/* The mark. A <button>, same reasoning `RosterRow` gives: unreachable by
                    keyboard and invisible to assistive tech as a div. 44px minimum tap
                    target (h-11 w-11), and an explicit `aria-label` — content-based naming
                    would still work here, but the row also carries up to two `StatusChip`s
                    with their own text, and an explicit label is what keeps "which student,
                    what it does" true regardless of what else the row grows. Never
                    disabled: the write behind it is a local queue write, the same one
                    `RosterRow`'s own cycle button never disables for either. */}
                <button
                  aria-label={label}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${MARK_TONE[state]}`}
                  data-testid={`event-roster-mark-${row.student_id}`}
                  onClick={() => mark(row, nextAttended(row.attended))}
                  type="button"
                >
                  <AttendanceMark label={t(locale, MARK_LABEL[state])} state={state} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * A UUID derived from the event and the student, so the same row cycled twice amends one
 * queued op rather than minting a fresh one. Copied from `RosterScreen.tsx`'s own `markId`
 * rather than imported across the two screens — see this file's mark handler for why — with
 * `sessionId` renamed to `eventId` and nothing else changed: the derivation has to be a
 * deterministic, well-formed v4-shaped UUID regardless of which table the id names, and
 * `sync.ts`'s idempotency (§10.5) does not care which screen produced it.
 */
function markId(eventId: string, studentId: string): string {
  const source = `${eventId}:${studentId}`
  const words = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => {
    let hash = seed >>> 0
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash >>> 0
  })
  const hex = words.map((word) => word.toString(16).padStart(8, '0')).join('')
  const bytes = hex.match(/.{2}/g)!
  bytes[6] = ((parseInt(bytes[6]!, 16) & 0x0f) | 0x40).toString(16).padStart(2, '0')
  bytes[8] = ((parseInt(bytes[8]!, 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')
  const flat = bytes.join('')
  return [
    flat.slice(0, 8),
    flat.slice(8, 12),
    flat.slice(12, 16),
    flat.slice(16, 20),
    flat.slice(20, 32),
  ].join('-')
}
