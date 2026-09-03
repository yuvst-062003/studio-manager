// Staff artboards `1c` and `9f` — the roster row. **The one composite CONTAINER W3 builds**
// (plan §1.3, seam 4; `docs/design/specs/1c-staff-roster.md` § Ownership).
//
// `1c`'s ownership table, leading to trailing:
//
//   | Row shell, the tap target, the cycling | M5 — this file       |
//   | Attendance mark                        | M5 — this file       |
//   | Health flag ⚠                          | M4 — a slot entry    |
//   | Name, note line                        | M5 — this file       |
//   | Belt bar                               | M7 — a slot entry    |
//
// **This file names none of its sections.** It renders `useSlot('roster-row')` and passes
// every section the same props — fields the W3 contract commit already put in
// `BootstrapPayload.roster[]`. That is what lets M4 land `HealthBadge.tsx` into a running
// roster without either lane opening the other's file, and it is why `health_status` and
// `derived_flags` are on the props below despite this file never reading them.
//
// **Not `StudentRow`.** `1c` says so explicitly: that primitive's order is belt → name →
// chip, and this row is mark → flag + name + note → belt with no chip. The mismatch is
// precisely why `roster-row` is a slot rather than a prop. `AttendanceMark` and `BeltBar`
// are reused; the composite is built here.
import { useRef } from 'react'
import { AttendanceMark, Icon, useSlot } from '@studio/ui'
import type { AttendanceState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { RosterRow as RosterRowData } from '@studio/core'

/**
 * What every `roster-row` section receives.
 *
 * One shape, passed to all of them. A section reads the fields it needs and ignores the
 * rest; it never asks the container to fetch for it, which is what keeps the container from
 * having to know a section exists.
 */
export type RosterRowSectionProps = {
  row: RosterRowData
  locale: Locale
}

/**
 * §5.7's cycle: `unmarked → present → absent_unexcused → unmarked`.
 *
 * `absent_excused` is deliberately **not** in the cycle. §5.7: "an excused absence shows as
 * ✕ with a הודיעו מראש label and requires a long-press to override" — a parent told the club
 * this morning, and a thumb brushing the list must not erase that.
 */
const CYCLE: Record<string, RosterRowData['status']> = {
  unmarked: 'present',
  present: 'absent_unexcused',
  absent_unexcused: 'unmarked',
  // Reached only through the long-press path below, never through a tap.
  absent_excused: 'present',
}

export function nextStatus(current: RosterRowData['status']): RosterRowData['status'] {
  return CYCLE[current] ?? 'present'
}

/**
 * The four glyphs `1c` draws, mapped from the four stored statuses.
 *
 * `absent_excused` becomes `notified` and `absent_unexcused` becomes `absent`: they are two
 * different facts and `1c` distinguishes them **only by fill** — a filled cross for "they
 * did not come" and an outline cross for "they told us they would not". `9f` finding 4 calls
 * that "a strong enough distinction to keep and a weak enough one to lose in a careless
 * port", which is why the mapping is a named constant rather than a ternary.
 */
const GLYPH: Record<RosterRowData['status'], AttendanceState> = {
  unmarked: 'unmarked',
  present: 'present',
  absent_unexcused: 'absent',
  absent_excused: 'notified',
}

const MARK_LABEL: Record<RosterRowData['status'], string> = {
  unmarked: 'attendance.roster.unmarked',
  present: 'attendance.roster.present',
  absent_unexcused: 'attendance.roster.absentUnexcused',
  absent_excused: 'attendance.roster.absentExcused',
}

/** §5.7's own words: "requires a long-press to override". Register follow-up — this used
 *  to fire `onOverride` on an ordinary click, so a thumb brushing the list erased the exact
 *  notice it was meant to protect. Half a second is long enough that a brush or a slow
 *  double-tap cannot reach it by accident, short enough that a deliberate hold does not
 *  feel broken. */
const LONG_PRESS_MS = 550

export function RosterRow({
  row,
  locale,
  onCycle,
  onOverride,
}: {
  row: RosterRowData
  locale: Locale
  onCycle: (next: RosterRowData['status']) => void
  /** §5.7's long-press. Separate from `onCycle` so the protected transition cannot be
   *  reached by the ordinary one, at the type level rather than by a flag. */
  onOverride?: () => void
}) {
  const sections = useSlot<RosterRowSectionProps>('roster-row')
  // §10.5 — a pre-report is protected from a bulk action on the server; on the row it is
  // protected from a stray tap. Both halves are needed: the server rule cannot see a thumb.
  const preReported = row.has_absence_report && row.status === 'absent_excused'

  // §5.7's long-press, tracked by hand: React has no `onLongPress`. `pointerActive` marks
  // that a pointer (mouse, touch or pen) started this interaction at all — a `click` with
  // no pointer behind it is keyboard activation, which is already a deliberate act and
  // does not need a hold. `longPressFired` marks that the hold has already called
  // `onOverride`, so the trailing `click` a pointer always produces on release does not
  // call it a second time.
  const pointerActive = useRef(false)
  const longPressFired = useRef(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearPressTimer = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  // S3 resolved `1c`'s two-jobs comment: the row's TAP is the mark cycle — `1c` line 41,
  // "the whole row cycles them on tap" — and the card opens from a dedicated control at
  // the inline end. A shell div holds the two, because a control inside a control is
  // invalid HTML and unreachable to assistive tech.
  return (
    <div className="roster-row-shell">
      <button
        className="roster-row"
        data-pre-reported={preReported ? 'true' : undefined}
        data-status={row.status}
        data-testid={`roster-row-${row.student_id}`}
        // A <button>, never a div with onClick: a div is unreachable by keyboard and
        // invisible to assistive tech, and this is the single most-used control in the
        // product.
        onClick={() => {
          if (preReported) {
            if (longPressFired.current) {
              // Already handled by the hold below — this is just the click a pointer
              // produces on release, not a second, independent activation.
            } else if (!pointerActive.current) {
              // No pointerdown preceded this click: keyboard activation.
              onOverride?.()
            }
            // else: a pointer click that never reached the hold threshold — a stray tap,
            // ignored on purpose.
            pointerActive.current = false
            longPressFired.current = false
            return
          }
          onCycle(nextStatus(row.status))
        }}
        onPointerCancel={clearPressTimer}
        onPointerDown={() => {
          if (!preReported) return
          pointerActive.current = true
          longPressFired.current = false
          clearPressTimer()
          pressTimer.current = setTimeout(() => {
            longPressFired.current = true
            onOverride?.()
          }, LONG_PRESS_MS)
        }}
        onPointerLeave={clearPressTimer}
        onPointerUp={clearPressTimer}
        type="button"
      >
        <AttendanceMark label={t(locale, MARK_LABEL[row.status])} state={GLYPH[row.status]} />

        <span className="roster-row__text">
          {/* <bdi>, as StudentRow already does: this row is Hebrew on 1c, and M3 fills it
              with Latin names too. Mixed-direction text reorders without isolation (§9). */}
          <bdi className="roster-row__name">{row.display_name}</bdi>
          {/* `9f`'s per-row note line, whose text depends on state. The health flag is NOT
              here — it arrives through the slot below, from M4's own file. */}
          {preReported ? (
            <span className="roster-row__note" data-note="pre-reported">
              {t(locale, 'attendance.source.preReported')}
              {/* The parent's own words, up to 200 chars (`AbsenceReportIn.reason`). This
                  used to reach the row's data and stop there — a coach saw only the generic
                  label and never *why*. */}
              {row.absence_reason ? <> · {row.absence_reason}</> : null}
            </span>
          ) : null}
          {row.status === 'unmarked' && !preReported ? (
            <span className="roster-row__note" data-note="unmarked">
              {t(locale, 'attendance.roster.unmarked')}
            </span>
          ) : null}
          {row.plan_name ? (
            <span className="roster-row__note" data-note="plan">
              {row.plan_name}
            </span>
          ) : null}
        </span>

        {/* Every section this wave and later waves register. Named nowhere. */}
        {sections.map(({ key, render: Section }) => (
          <Section key={key} locale={locale} row={row} />
        ))}
      </button>
      {/* Named per child — three identical "כרטיס חניך" links are indistinguishable to a
          screen reader, the exact class `1c`'s a11y finding flags for icon-only controls. */}
      <a
        aria-label={`${t(locale, 'people.card.open')} · ${row.display_name}`}
        className="roster-row__open-card"
        data-testid={`roster-open-card-${row.student_id}`}
        href={`#/students/${row.student_id}`}
      >
        <Icon name="students" size={18} />
      </a>
    </div>
  )
}
