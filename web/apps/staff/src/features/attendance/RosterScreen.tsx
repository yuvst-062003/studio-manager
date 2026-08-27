// Staff artboards `1c` (נוכחות בשיעור) and `9f` (נוכחות) — the screen a coach uses on the
// mat, and the reason the offline queue exists.
//
// `9f` is the later iteration of `1c` and **lost** `1c`'s offline, sync and staleness
// indicators (`9f` finding 2). This screen is the merge the specs ask for: `9f`'s
// advance-notice hint row and its footer helper line, on top of `1c`'s three network
// affordances, which the screen a coach uses in a basement cannot ship without.
//
// Two findings are corrected here rather than carried:
//
//   * `9f` finding 1 — the bulk button as drawn overwrites every parent's advance notice,
//     directly under a hint row announcing those notices. The button's own copy now says
//     what the server actually does.
//   * `1c` finding 4 — the sync badge's copy counts *sessions* while its key counts *marks*.
//     `attendance.sync.pendingCount` interpolates marks, so the badge counts marks.
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import {
  formatTimeInStudioZone,
  offlineStorageIsDurable,
  queueMark,
  usePendingCount,
  useNetworkMode,
  useStaleQueueWarning,
} from '@studio/core'
import type { RosterRow as RosterRowData } from '@studio/core'
import { RosterRow } from './RosterRow'
import type { StaffAttendanceClient } from './client'

/** §5.7's roster is split in two: the students expected today, and
 *  `לא אמורים להגיע היום` beneath them. The second is collapsed and still markable —
 *  "a child who turns up on an extra day is a real child". */
type Split = { expected: RosterRowData[]; notExpected: RosterRowData[] }

export function RosterScreen({
  sessionId,
  locale,
  client,
  clock = () => new Date().toISOString(),
  personId,
  /** C12 — which students are expected. The server sends the roster already ordered and the
   *  bootstrap payload does not carry `expected` per row, so the screen is told which ids
   *  are in the collapsed section rather than deriving a weekday rule of its own. */
  notExpectedIds = [],
}: {
  sessionId: string
  locale: Locale
  client: StaffAttendanceClient
  /**
   * The device clock, as a function.
   *
   * **One clock, not two.** The first draft took `now` as a string for §6.5's staleness
   * check while `queueMark` stamped `queued_at` from `new Date()` — so the screen compared
   * a fixed instant against a live one and declared a queue a day stale the moment it was
   * written. A function rather than a value because `device_marked_at` has to advance
   * between two taps in the same session (§10.5 resolves on it), which a value fixed for
   * the day cannot do.
   */
  clock?: () => string
  personId: string | null
  notExpectedIds?: string[]
}) {
  const [roster, setRoster] = useState<RosterRowData[]>([])
  const [header, setHeader] = useState<{ groupName: string; startsAt: string } | null>(null)
  const mode = useNetworkMode()
  const pending = usePendingCount()
  const stale = useStaleQueueWarning(clock)

  useEffect(() => {
    let live = true
    void client
      .sessionRoster(sessionId)
      .then((body) => {
        if (!live) return
        setRoster(body.roster)
        setHeader({ groupName: body.session.group_name, startsAt: body.session.starts_at })
      })
      .catch(() => {
        // Offline is not an error state on this screen. The cached roster is what renders,
        // and `mode` already tells the coach why nothing refreshed.
      })
    return () => {
      live = false
    }
  }, [client, sessionId])

  const split: Split = useMemo(() => {
    const notExpected = new Set(notExpectedIds)
    return {
      expected: roster.filter((row) => !notExpected.has(row.student_id)),
      notExpected: roster.filter((row) => notExpected.has(row.student_id)),
    }
  }, [roster, notExpectedIds])

  // §5.7's three counts. Every one of them is over the EXPECTED section only: "its rows
  // never count toward `לא סומן`", and a not-expected child who did not come has not
  // missed anything.
  const counts = useMemo(
    () => ({
      present: split.expected.filter((row) => row.status === 'present').length,
      absent: split.expected.filter((row) => row.status.startsWith('absent')).length,
      unmarked: split.expected.filter((row) => row.status === 'unmarked').length,
    }),
    [split],
  )

  const preReported = split.expected.filter((row) => row.has_absence_report).length

  // §5.7 — "Marks are written to the local store first and the UI updates immediately."
  // Optimistic, unconditionally, and never branching on `mode`: a screen with an online
  // path and an offline path has one path nobody exercises until a coach is in a basement.
  const mark = (row: RosterRowData, next: RosterRowData['status'], source: 'coach') => {
    setRoster((current) =>
      current.map((one) =>
        one.student_id === row.student_id ? { ...one, status: next, source } : one,
      ),
    )
    void queueMark({
      // Stable per (session, student), so a coach cycling a row three times leaves one op
      // carrying their final answer rather than three the server has to reconcile.
      clientMarkId: markId(sessionId, row.student_id),
      kind: 'attendance.mark',
      sessionId,
      studentId: row.student_id,
      payload: { status: next },
      deviceMarkedAt: clock(),
      personId,
    })
  }

  // §6.5 — "shows a **blocking** warning when unsynced work has been queued for more than
  // one session." Rendered INSTEAD of the roster, not above it. §6.5 traded the storage
  // guarantee away deliberately — "iOS may still evict under storage pressure — a guarantee
  // a native container would have given. Coaches are a small, known group, so this is
  // managed rather than engineered around" — and a banner a coach scrolls past is noticing
  // the trade, not managing it. The only thing that converts "your marks may be lost" into
  // "your marks were not lost" is a person walking to somewhere with signal.
  //
  // `offlineStorageIsDurable()` short-circuits the day threshold: on a device with no
  // IndexedDB at all the queue does not survive a reload, so the warning is true from the
  // first mark rather than after a day.
  if (stale?.blocking === true || (pending > 0 && !offlineStorageIsDurable())) {
    return (
      <section data-testid="roster-stale-block">
        <Alert iconLabel={t(locale, 'attendance.sync.staleWarning')} live tone="danger">
          <strong>{t(locale, 'attendance.sync.staleWarning')}</strong>
          <span>{t(locale, 'attendance.sync.staleBody')}</span>
        </Alert>
        <p data-testid="roster-stale-count">
          {t(locale, 'attendance.sync.pendingCount').replace('{{count}}', String(pending))}
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="roster-title" data-testid="roster-screen">
      <header>
        <h1 id="roster-title">{t(locale, 'attendance.roster.title')}</h1>
        {header ? (
          <p data-testid="roster-session">
            <bdi>{header.groupName}</bdi> · {formatTimeInStudioZone(header.startsAt, locale)}
          </p>
        ) : null}

        {/* `1c`'s three count tiles. */}
        {/* 1c draws each tile as the number over its label, the number in the tile's
            own semantic colour — the styling pass (2026-08-27) made the markup match. */}
        <ul data-testid="roster-counts">
          <li data-count="present">
            <span className="count-number">{counts.present}</span>
            <span className="count-label">{t(locale, 'attendance.roster.present')}</span>
          </li>
          <li data-count="absent">
            <span className="count-number">{counts.absent}</span>
            <span className="count-label">{t(locale, 'attendance.roster.absent')}</span>
          </li>
          <li data-count="unmarked">
            <span className="count-number">{counts.unmarked}</span>
            <span className="count-label">{t(locale, 'attendance.roster.unmarked')}</span>
          </li>
        </ul>

        {/* `1c`'s sync banner, which `9f` lost. Rendered in every degraded mode, not only
            in `offline`: §10.1 has four states and a coach on a captive portal is told the
            truth rather than `מחובר`. */}
        {mode !== 'online' ? (
          <Alert iconLabel={t(locale, `attendance.network.${networkKey(mode)}`)} tone="pending">
            {t(locale, `attendance.network.${networkKey(mode)}`)} ·{' '}
            {t(locale, 'attendance.network.offlineHint')}
          </Alert>
        ) : null}

        {/* `1c` finding 4 — the badge counts MARKS, which is what the key interpolates.
            Three artboards drew it counting sessions against a key that counts marks; the
            copy is what has to become true, not the other way round. */}
        {pending > 0 ? (
          <p data-testid="roster-pending">
            {t(locale, 'attendance.sync.pendingCount').replace('{{count}}', String(pending))}
          </p>
        ) : null}

        {/* `9f`'s advance-notice hint row. Its claim — that those students are handled
            automatically — is true precisely because the bulk button below skips them. */}
        {preReported > 0 ? (
          <Alert iconLabel={t(locale, 'attendance.source.preReported')} tone="pending">
            {t(locale, 'attendance.source.preReportedHint')}
          </Alert>
        ) : null}
      </header>

      <Button
        onClick={() => {
          void bulkPresent()
        }}
        variant="primary"
      >
        {t(locale, 'attendance.roster.markAllPresent')}
      </Button>
      {/* `9f` finding 1 — "if the action skips pre-reported marks, **the button's own copy
          should say so**." Unconditional, and not only when a parent has reported: a coach
          decides whether to tap this before knowing whether anybody reported, and a
          reassurance that appears only sometimes is one nobody learns to rely on. The
          dashboard's `1e` copy says the same thing beside the same button. */}
      <p data-testid="roster-bulk-hint">{t(locale, 'attendance.roster.markAllPresentHint')}</p>

      {roster.length === 0 ? (
        <p data-testid="roster-empty">{t(locale, 'attendance.roster.empty')}</p>
      ) : null}

      <ul data-testid="roster-list">
        {split.expected.map((row) => (
          <li key={row.student_id}>
            <RosterRow
              locale={locale}
              onCycle={(next) => mark(row, next, 'coach')}
              onOverride={() => mark(row, 'present', 'coach')}
              row={row}
            />
          </li>
        ))}
      </ul>

      {/* §5.7 — "Students enrolled in the group but not expected today sit in a separate
          collapsed section beneath it, and can still be marked." A <details>, so it is
          collapsed by default, reachable by keyboard, and needs no state of its own. */}
      {split.notExpected.length > 0 ? (
        <details data-testid="roster-not-expected">
          <summary>{t(locale, 'attendance.roster.notExpectedToday')}</summary>
          <ul>
            {split.notExpected.map((row) => (
              <li key={row.student_id}>
                <RosterRow
                  locale={locale}
                  onCycle={(next) => mark(row, next, 'coach')}
                  onOverride={() => mark(row, 'present', 'coach')}
                  row={row}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <footer>
        <p data-testid="roster-edit-anytime">{t(locale, 'attendance.roster.editAnytime')}</p>
        {/* S2 — the register's exits. `9g` is the step after taking a register; `11a`
            and `11b` are in-lesson actions and belong on the session, not on `#/cash`. */}
        <nav aria-label={t(locale, 'attendance.summary.whatNext')} data-testid="roster-actions">
          <a href={`#/attendance/${sessionId}/summary`}>{t(locale, 'attendance.summary.title')}</a>
          <a href={`#/attendance/${sessionId}/handover`}>{t(locale, 'billing.product.handOut')}</a>
          <a href={`#/attendance/${sessionId}/trial`}>{t(locale, 'people.trial.addDuringClass')}</a>
        </nav>
      </footer>
    </section>
  )

  async function bulkPresent(): Promise<void> {
    const prefix = markId(sessionId, 'bulk')
    // Optimistic first, exactly as a single mark is — and over the SAME predicate the
    // server uses, so the screen and the database agree without a round trip: only
    // expected, only unmarked, never a parent's advance notice.
    setRoster((current) =>
      current.map((row) =>
        !notExpectedIds.includes(row.student_id) &&
        row.status === 'unmarked' &&
        !row.has_absence_report
          ? { ...row, status: 'present', source: 'bulk' }
          : row,
      ),
    )
    await queueMark({
      clientMarkId: prefix,
      kind: 'attendance.bulk',
      sessionId,
      studentId: null,
      payload: { client_mark_id_prefix: prefix },
      deviceMarkedAt: clock(),
      personId,
    })
  }
}

/**
 * A UUID derived from the session and the student, so the same row cycled twice amends one
 * queued op. Not `crypto.randomUUID()`: a fresh id per tap is a fresh op per tap, and
 * §10.5's idempotency is keyed on this value.
 *
 * **It has to be an actual UUID.** This returned `${sessionId}:${studentId}` — the
 * docstring already said "v5-shaped", so the intent was right and the implementation was
 * not. `AttendanceIn.client_mark_id` is a `uuid.UUID` and `BulkPresentIn`'s prefix is one
 * too, so every flush of every mark was refused with a 422 and the queue could never
 * drain. Nothing surfaced it: the roster is optimistic by design, so the screen looked
 * correct the whole time, and no code called `flush` at all until this wave.
 *
 * Derived rather than hashed with SubtleCrypto, which is async — and `queueMark` is called
 * from a click handler that must not await anything, because §10.3's whole point is that
 * the local write is not an API call. A 128-bit FNV-1a mix over the pair gives the two
 * properties that matter: the same pair always yields the same id, and different pairs
 * effectively never collide. Version and variant bits are set so it is a well-formed v4 to
 * anything that parses it.
 */
function markId(sessionId: string, studentId: string): string {
  const source = `${sessionId}:${studentId}`
  // Four independently-seeded FNV-1a passes, 32 bits each. One pass would give 32 bits of
  // spread across a whole club's marks, which is not enough to be careless with.
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
  // v4 version and RFC 4122 variant, so the shape is honest about being derived garbage
  // rather than pretending to be a v5 of some namespace it was never hashed against.
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

/** §10.1's four modes to the four keys `attendance.network.*` carries. `api-down` renders as
 *  `intermittent` for now — §10.1 gives it its own copy (`השרת אינו זמין, ננסה שוב`) and the
 *  namespace has no key for it. Recorded as a finding rather than inlined here (G4). */
function networkKey(mode: string): string {
  if (mode === 'api-down') return 'intermittent'
  return mode
}
