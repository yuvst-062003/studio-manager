// Parent artboard 1a — the parent's home, 390×844, light and dark.
//
// Rearranged to Option B (owner's pick, 2026-09-01): the next lesson answers the screen's
// one question at full size and carries the two-way attendance control; the debt is a
// strip rather than a card competing with it; the family filter sits directly under the
// thing it filters; and the rest of the week is a compact list of rows.
//
// What that REPLACED, so the removal is not mistaken for a regression: 2a's seven-day
// strip and the day-grouped lesson cards. The strip let a parent read backwards into past
// attendance — Option B looks forward only, and the day now sits on each row's leading
// edge instead. The screen fits 844px again; the previous arrangement scrolled to 2,700.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatTimeInStudioZone, studioDayKey } from '@studio/core'
import { EmptyState, Icon, MoneyDisplay } from '@studio/ui'
import { NextLessonCard } from './NextLessonCard'
import type { NextLesson } from './NextLessonCard'
import type { Intent, IntentClient } from './intentClient'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type HomeStudent = {
  id: string
  displayName: string
  /** What the card and the week rows use — three surnames in a column identify nobody. */
  firstName?: string
  groupNames: readonly string[]
  /** D7's bar colour, from `current_belt_color_hex`. `null` before a first belt. */
  beltColorHex?: string | null
}

/** What the family has already told the club, keyed `<sessionId>:<studentId>`. */
export type HomeIntents = Readonly<Record<string, Intent>>

export type HomeLesson = {
  id: string
  /** UTC ISO — rendered in the studio zone here, per G3. */
  startsAt: string
  /** The other end of the range the card prints, low value first. */
  endsAt?: string
  groupName: string
  locationName?: string | null
}

/** One child's answer for one session — 2a's "כולל נוכחות שהייתה". */
export type HomeAttendanceRow = {
  session_id: string
  student_id: string
  status: string
}


const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  // 390×844 is the drawn size, not a maximum: the same screen has to survive a 430pt Pro
  // Max and a desktop tab, so it is a max-width rather than a fixed width.
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}




//: Option B's week — hairline-separated rows, not a stack of cards. Cards at this
//: density read as boxes-in-boxes; the design's own rule is rows separated by a rule.
const weekListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
}

const weekRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minBlockSize: '52px',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const weekDayStyle: CSSProperties = {
  inlineSize: '42px',
  flex: 'none',
  textAlign: 'center',
  lineHeight: 'var(--leading-snug)',
}

//: D7 — never fill-only. The ring is the current foreground, which is what rescues a
//: white belt on a light ground and a black one on a dark ground.
const beltBarStyle = (hex: string): CSSProperties => ({
  inlineSize: '4px',
  blockSize: '30px',
  flex: 'none',
  borderRadius: 'var(--radius-xs)',
  background: hex,
  border: 'var(--belt-ring-width) solid currentcolor',
})

//: The belt dot inside a filter chip. Same D7 rule as the bar: fill plus a ring, or a
//: white belt is an invisible chip.
const chipBeltStyle = (hex: string): CSSProperties => ({
  inlineSize: '9px',
  blockSize: '9px',
  flex: 'none',
  borderRadius: 'var(--radius-xs)',
  background: hex,
  border: 'var(--belt-ring-width) solid currentcolor',
})

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const chipStyle: CSSProperties = {
  // Flex so the belt dot sits beside the name rather than on its own line.
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minBlockSize: '44px',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-xl)',
  border: 'var(--border-width-hairline) solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  font: 'inherit',
  cursor: 'pointer',
}

//: Option B's debt strip — one 44px row, the amount first because that is the fact a
//: parent scans for. `--debt` on `--debt-tint` is the audited pair.
const debtStripStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minBlockSize: '44px',
  paddingInline: 'var(--space-3)',
  background: 'var(--debt-tint)',
  border: 'var(--border-width-hairline) solid var(--debt)',
  borderRadius: 'var(--radius-lg)',
}

//: A control sized like one, not a caption-sized link — the rule PA adopted after four
//: header actions shipped 19px tall.
const debtCtaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginInlineStart: 'auto',
  minBlockSize: '44px',
  paddingInline: 'var(--space-2)',
  color: 'var(--emphasis)',
  fontWeight: 'var(--weight-semibold)',
  fontSize: 'var(--text-label)',
}

const chipActiveStyle: CSSProperties = {
  ...chipStyle,
  //: --emphasis, not --fg: this is a selected-control fill, and on the outward surface it
  //: wears the club's colour. Identical to ink on the staff surfaces.
  background: 'var(--emphasis)',
  color: 'var(--on-emphasis)',
  borderColor: 'var(--emphasis)',
}

//: The two links that sit in a header row. Text-sized, but tappable: both rendered 19px
//: tall, under WCAG 2.2 SC 2.5.8's 24x24 floor and well under a thumb.
const headerLinkStyle: CSSProperties = {
  alignItems: 'center',
  display: 'inline-flex',
  gap: 'var(--space-1)',
  minBlockSize: '44px',
}

//: The route to `2c`, sized like a control rather than like a footnote. It was 56×14.
const cardLinkStyle: CSSProperties = {
  alignItems: 'center',
  borderRadius: 'var(--radius-xl)',
  display: 'inline-flex',
  minBlockSize: '44px',
  paddingInline: 'var(--space-3)',
}

/**
 * Does this row start at the same instant as the one above it?
 *
 * `2a` §6's merged block. Compared on the raw ISO instant rather than on the formatted
 * label: two sessions a second apart format identically at minute precision and are not
 * the same slot, and the whole point is that the reader may treat a hidden label as "same
 * as above".
 */
/** Today / tomorrow get their names; further out, the studio-zone date carries the row. */
export function ParentHome({
  locale,
  students = null,
  upcoming = null,
  debtAgorot = 0,
  intents = {},
  intentClient,
  onIntentChanged,
}: {
  locale: Locale
  /** `null` while loading — the section stays quiet rather than flashing an empty state. */
  students?: readonly HomeStudent[] | null
  /** The family's lessons across 2a's strip window (past AND coming week). `null` = loading. */
  upcoming?: readonly HomeLesson[] | null
  /**
   * 2a's past-attendance rows. Option B's week looks FORWARD only, so nothing on this
   * screen reads them any more — kept on the prop so `Resolve` keeps fetching them for
   * the day a past view returns, and so removing the fetch is a deliberate second
   * decision rather than a side effect of this redesign.
   */
  attendance?: readonly HomeAttendanceRow[]
  /** The family's open balance — 1a's debt alert, fed from `/me/balance`. */
  debtAgorot?: number
  /** What the family has answered per (session, child). Absent keys are "unanswered". */
  intents?: HomeIntents
  /** Writes the answer. Absent in tests that only render the list. */
  intentClient?: IntentClient
  /** Re-read after an answer lands, so the card shows what the SERVER accepted. */
  onIntentChanged?: () => void
}) {
  const [childFilter, setChildFilter] = useState<string | null>(null)

  // Register §3.8 — `week` and `nextLesson` below both read `new Date()` fresh on every
  // render, but nothing was making this component RENDER again after mount: a family that
  // opened the app at 16:00 and left the tab open still saw the 16:00 class offered as
  // "coming" at 20:43, hours after it ended. `useToday.ts` (the staff app's equivalent
  // fix) polls at day granularity, deliberately, to avoid re-rendering every minute; this
  // screen needs the opposite — it is exactly the WITHIN-a-day staleness that matters
  // here, so the tick is minute-grained instead. `tick` itself is never read: its only
  // job is to be a new value each time, so React does not bail out of the re-render.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  /**
   * Option B's list: what is still to come, in time order, already filtered by the
   * chips above it. Deliberately NOT grouped by day — the day sits on each row's
   * leading edge instead, which is what lets seven lessons fit where four cards did.
   */
  const week = useMemo(() => {
    if (upcoming === null || students === null) return null
    const now = new Date().toISOString()
    const mine = new Set((students ?? []).flatMap((s) => s.groupNames))
    const child = students.find((s) => s.id === childFilter)
    return upcoming
      .filter((lesson) => lesson.startsAt > now)
      .filter((lesson) =>
        child ? child.groupNames.includes(lesson.groupName) : mine.has(lesson.groupName),
      )
      .slice(0, 6)
  }, [upcoming, students, childFilter])

  /**
   * The soonest lesson that has not started, resolved to ONE child.
   *
   * A lesson belongs to a group, and a group can hold two of a family's children — so
   * the card names the first child in that group rather than pretending a session is
   * per-child. The answer it writes is keyed on (session, student), which is the pair
   * the server stores, so a second child in the same group keeps their own answer and is
   * asked separately further down the list.
   */
  const nextLesson = ((): NextLesson | null => {
    if (upcoming === null || students === null) return null
    const now = new Date().toISOString()
    for (const lesson of upcoming) {
      if (lesson.startsAt <= now) continue
      const child = students.find((s) => s.groupNames.includes(lesson.groupName))
      if (!child) continue
      return {
        sessionId: lesson.id,
        studentId: child.id,
        studentName: child.firstName ?? child.displayName,
        groupName: lesson.groupName,
        locationName: lesson.locationName ?? null,
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt ?? null,
        beltColorHex: child.beltColorHex ?? null,
      }
    }
    return null
  })()

  return (
    <section aria-label={t(locale, 'common.home.title')} data-testid="parent-home" style={pageStyle}>
      {/* No visible title row, and no settings gear (owner, 2026-09-01).
       *
       * The heading said "הילדים שלי" on a screen whose first two elements are a debt and
       * a lesson, and the app bar directly above it already names where you are. The gear
       * was a second route to `#/profile` sitting a thumb's width from the profile TAB
       * that is on every screen — two doors to one room, one of them decorative.
       *
       * The section keeps the name as `aria-label`, so a screen reader still hears which
       * region this is. Removing a visible heading is not the same as removing a heading. */}

      {/* 1a's alert cards. The health card is the §6.1 gate's job now — a family who owes
          a declaration never reaches this screen — so the debt card is the one that can
          actually appear here. Quiet line when nothing needs attention (4h's rule: state
          the goal state, never draw an empty box). */}
      {/* `2a` §5 — the debt + health banner is conditional on the selected day being
          TODAY. It rendered on every day of the strip, so stepping back to last Tuesday
          asked the parent to pay for it. */}
      {/* Option B — the debt is a STRIP, not a card competing with the lesson. Three
          surfaces already show this number (here, the payments tab, every student card),
          and on home its job is to be noticed, not to be the largest thing on screen.
          Still a real 44px control, and still conditional on the selected day being
          today: stepping back to last Tuesday must not ask a parent to pay for it. */}
      {debtAgorot > 0 ? (
        <div style={debtStripStyle} data-testid="parent-home-debt">
          <Icon name="warning" size={16} style={{ color: 'var(--debt)', flex: 'none' }} />
          <strong style={{ color: 'var(--debt)', fontSize: 'var(--text-label)' }}>
            <MoneyDisplay agorot={debtAgorot} tone="debt" />
          </strong>
          <span style={{ fontSize: 'var(--text-label)', color: 'var(--text-secondary)' }}>
            {t(locale, 'common.home.debt.title')}
          </span>
          <a href="#/payments" data-testid="parent-home-debt-cta" style={debtCtaStyle}>
            {t(locale, 'common.home.debt.cta')}
          </a>
        </div>
      ) : null}

      {/* The one question this screen exists to answer, at the top and at full size. */}
      {nextLesson !== null && intentClient !== undefined ? (
        <NextLessonCard
          locale={locale}
          lesson={nextLesson}
          intent={intents[`${nextLesson.sessionId}:${nextLesson.studentId}`] ?? 'unanswered'}
          client={intentClient}
          onChanged={onIntentChanged ?? (() => {})}
        />
      ) : null}

      {debtAgorot > 0 ? null : (
        <p data-testid="parent-home-no-alerts" style={{ margin: 0, color: 'var(--text-muted)' }}>
          {t(locale, 'common.home.noAlerts')}
        </p>
      )}

      {/* Option B — the family filter sits directly under the thing it filters, which is
          the point of the arrangement: the screen used to end with a control that
          partitioned everything above it. */}

      {/* 1a's child list.

          **The filter chip appears only for a family with more than one child.** §19.3's
          `dev+parent1` exists to walk "the single-child path that skips the family layer",
          and the layer was not being skipped: a parent of one child was given an "הכל" chip
          and a chip naming their only child — a filter with one thing to filter, and
          nothing to filter it away from.

          The card LINK is per child either way: it is what the row is for, and it is the
          only route to `2c` anywhere in the app. It used to render as bare caption-sized
          text — 56×14 CSS px, well under WCAG 2.2 SC 2.5.8's 24×24 floor, and visually
          detached from the chip it belonged to, so three identical "כרטיס חניך" links
          floated between the chips with nothing saying which was whose. */}
      {students !== null && students.length > 0 ? (
        <ul style={chipRowStyle} aria-label={t(locale, 'common.home.title')}>
          {students.length > 1 ? (
            <li>
              <button
                type="button"
                style={childFilter === null ? chipActiveStyle : chipStyle}
                aria-pressed={childFilter === null}
                data-testid="parent-home-chip-all"
                onClick={() => setChildFilter(null)}
              >
                {t(locale, 'common.home.allChildren')}
              </button>
            </li>
          ) : null}
          {students.map((student) => (
            <li key={student.id} data-testid="parent-home-child">
              {students.length > 1 ? (
                <button
                  type="button"
                  style={childFilter === student.id ? chipActiveStyle : chipStyle}
                  aria-pressed={childFilter === student.id}
                  onClick={() => setChildFilter(childFilter === student.id ? null : student.id)}
                >
                  {/* The belt as the identifier, which is what the chip row is FOR: three
                      similar Hebrew first names in one row tell a parent nothing apart. */}
                  {student.beltColorHex ? (
                    <span aria-hidden="true" style={chipBeltStyle(student.beltColorHex)} />
                  ) : null}
                  <bdi>{student.firstName ?? student.displayName}</bdi>
                </button>
              ) : null}
              {/* 2c's entry (P1/P2). One link for the SELECTED child rather than one per
                  child stacked down the screen: three "כרטיס חניך" links each on their own
                  row is what made this block three rows tall and pushed the week below the
                  fold. A parent of one child still gets theirs, because there is no chip
                  beside it to select. */}
              {students.length === 1 || childFilter === student.id ? (
                <a
                  aria-label={`${t(locale, 'people.card.open')} · ${student.displayName}`}
                  data-testid={`parent-home-card-${student.id}`}
                  href={`#/student/${student.id}`}
                  style={cardLinkStyle}
                >
                  {students.length > 1 ? (
                    t(locale, 'people.card.open')
                  ) : (
                    <bdi>{student.displayName}</bdi>
                  )}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : students !== null ? (
        <EmptyState
          title={t(locale, 'common.home.noChildren')}
          description={t(locale, 'common.home.childrenComeLater')}
        />
      ) : null}
      {/* Option B's week: one compact row per lesson, ordered by time, with the day on
          the leading edge and the belt bar naming whose it is. It replaces the seven-day
          strip and the day-grouped cards — a scan, not a stack of boxes, and the whole
          screen now fits 844px instead of scrolling to 2,700. */}
      <section aria-labelledby="parent-home-upcoming-title">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
          <h2
            id="parent-home-upcoming-title"
            style={{ fontSize: 'var(--text-title)', marginInlineEnd: 'auto' }}
          >
            {t(locale, 'common.home.restOfWeek')}
          </h2>
          <a data-testid="parent-home-absence" href="#/absence" style={headerLinkStyle}>
            {t(locale, 'attendance.absence.title')}
          </a>
        </div>
        {week === null ? null : week.length === 0 ? (
          <EmptyState
            title={t(locale, 'common.home.noUpcoming')}
            description={t(locale, 'common.home.noUpcomingWeek')}
          />
        ) : (
          <ul style={weekListStyle}>
            {week.map((lesson) => {
              const child = (students ?? []).find((s) =>
                s.groupNames.includes(lesson.groupName),
              )
              const day = new Date(lesson.startsAt)
              return (
                <li key={lesson.id} style={weekRowStyle} data-testid="parent-home-lesson">
                  <div style={weekDayStyle}>
                    <span style={{ display: 'block', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                      {t(locale, `schedule.weekday.${day.getUTCDay()}`)}
                    </span>
                    <span style={{ fontWeight: 'var(--weight-semibold)' }}>
                      {studioDayKey(lesson.startsAt).slice(8)}
                    </span>
                  </div>
                  {/* D7 — fill plus a ring, so a white belt is still a bar. Absent when
                      the child has no belt rather than drawn as an empty outline. */}
                  {child?.beltColorHex ? (
                    <span aria-hidden="true" style={beltBarStyle(child.beltColorHex)} />
                  ) : null}
                  <span style={{ flex: 1, minInlineSize: 0, fontSize: 'var(--text-body)' }}>
                    <bdi>
                      {child ? `${child.firstName ?? child.displayName} · ${lesson.groupName}` : lesson.groupName}
                    </bdi>
                  </span>
                  <span style={{ fontWeight: 'var(--weight-semibold)' }}>
                    {formatTimeInStudioZone(lesson.startsAt, locale)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </section>
  )
}
