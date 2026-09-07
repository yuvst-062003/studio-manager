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
//
// **C3 (2026-09-06) restyled this row onto the redesign's prototype**
// (`~/Downloads/staff-app/src/components/AttendanceModal.tsx`) — its row anatomy, not its
// sheet chrome (that file is a bottom sheet; this is a full screen, because a register on
// a mat is not a modal). Three things ported from it: the tap target's whole-row card
// shape, a background TINT that differs per `data-status` (present/absent/notified/
// unmarked), and the belt swatch beside the name. Nothing below this comment touches the
// tap cycle, the long-press guard or `onOverride` — those are §5.7's machinery and this
// pass is markup and class names only.
//
// **The belt chip is drawn here, not through a slot.** The container's own docstring above
// still promises M7 a `roster-row` slot entry for the belt bar, and that promise is
// unchanged — a future belt-specific fill (a ladder position, a "close to grading" flag)
// still lands through `sections.map` below with zero conflict. What is drawn here is only
// `BeltBar` + `belt_name`, which were ALREADY on `RosterRowData` (the W3 contract commit)
// and rendered nowhere — the redesign's own row anatomy asks for a "belt chip with D7's
// ring" and there is no reason to block that on a slot nobody has written yet. `BeltBar`
// carries D7's ring unconditionally (see that file), so importing it — never redrawing a
// second bar — is what keeps that guarantee here too.
import { useRef } from 'react'
import { AttendanceMark, BeltBar, Icon, useSlot } from '@studio/ui'
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

/**
 * The prototype's row card carries a background tint that follows the mark — never the
 * ONLY thing distinguishing one state from another (SC 1.4.1; `AttendanceMark`'s own four
 * SHAPES already carry that weight, unchanged by this file), only a second, faster read
 * down a roster of thirty. Tailwind's literal hues, same choice `TodayScreen`'s own
 * `CARD_FRAME` makes for the identical reason: this tint is illustrative, not the
 * semantic band D2 freezes (`debt · paid · pending · cancelled · danger · focus`), so it
 * does not borrow `--paid`/`--danger`/`--pending` the way the count tiles beside this row
 * still do.
 */
const ROW_TONE: Record<RosterRowData['status'], string> = {
  present: 'bg-[var(--paid-tint)] border-[var(--paid)]',
  absent_unexcused: 'bg-[var(--danger-tint)] border-[var(--danger)]',
  absent_excused: 'bg-[var(--pending-tint)] border-[var(--pending)]',
  unmarked: 'bg-[var(--surface-raised)] border-[var(--border)]',
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
    <div className="roster-row-shell flex items-stretch gap-1.5">
      <button
        className={`roster-row flex items-center gap-3 rounded-2xl border p-3 text-start transition-colors ${ROW_TONE[row.status]} ${preReported ? 'cursor-default' : 'cursor-pointer'}`}
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
          <bdi className="roster-row__name block text-sm font-bold text-[var(--fg)]">
            {row.display_name}
          </bdi>
          {/* The redesign's row anatomy puts the belt right under the name. `BeltBar`'s
              ring (D7) is unconditional on every fill, including a white belt — see that
              file. Both fields are optional on the wire (a student with no grade yet), so
              this renders nothing rather than a ring around an invented colour. */}
          {row.belt_color_hex && row.belt_name ? (
            <span className="roster-row__belt inline-flex items-center gap-1.5">
              <BeltBar colorHex={row.belt_color_hex} label={row.belt_name} />
              <span className="roster-row__belt-label text-xs font-medium text-[var(--text-muted)]">
                {row.belt_name}
              </span>
            </span>
          ) : null}
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
        className="roster-row__open-card rounded-2xl transition-colors hover:bg-[var(--disabled-surface)] active:scale-95"
        data-testid={`roster-open-card-${row.student_id}`}
        href={`#/students/${row.student_id}`}
      >
        <Icon name="students" size={18} />
      </a>
    </div>
  )
}
