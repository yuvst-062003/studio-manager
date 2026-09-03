// Dashboard artboard `4c` — נוכחות. Two problems on one screen: sessions nobody marked, and
// students who have stopped coming.
//
// **This builds the main pane only.** `4c` finding 2: "The at-risk sidebar is M9's data on
// an M5 screen. Every string in it resolves to `reports.*`, and `4g` is M9's own reports
// page. Decide in the W3 contract whether M5 renders M9's at-risk list or whether this
// sidebar waits for W5 — otherwise both lanes build it." W3's contract commit did not
// decide, so this lane does not build it: shipping it here would have M5 own a list whose
// every string lives in a namespace M9 owns, and W5 would find it already written and
// differently.
//
// **The unmarked-is-not-absent rule is stated, not only encoded.** `4c` finding 1: the
// artboard draws a strip reading present · absent · absent · unmarked · absent · unmarked
// and labels it *three consecutive absences*, so the rule is inferred from the data and
// written nowhere. `reports.attendance.unmarkedExcluded` exists "and this screen does not
// use it. It should." It does now — through this lane's own key, because `reports` is M9's
// namespace and a lane does not write in another's file.
//
// **Three things this screen claimed and did not do, closed in one pass (2026-08-29).**
//
// 1. The per-group card was a prop, `groups`, defaulting to `[]`. Every caller took the
//    default, so a block the artboard draws as name · bar · percentage had rendered its
//    empty state and nothing else since the day it was written. It comes off the API now.
// 2. The window was a constant — `windowAround(new Date())`, the last seven days plus
//    tomorrow — with no control anywhere to move it. `9b`'s `DateRangePicker` is adopted
//    rather than rebuilt, and the caller owns the state.
// 3. The CSV export took that same fixed window. It reads the chosen one, from the same
//    `window` object the table does, and is disabled for any range the table refuses.
//
// **And one thing that was worse than any of the three.** `client.unmarkedSessions` fetched
// `GET /sync/bootstrap`, which is §6.1's offline priming payload: it clamps every window to
// §10.6's two days. So the screen asked for a week and rendered the two OLDEST days of it,
// and a date picker wired to that endpoint would have widened the lie rather than fixed it.
// `GET /attendance/report` is the manager's question asked of the manager's range.
//
// **B1 (dashboard-screens-redesign.md), 2026-09-03.** Four more things closed:
//
// - B1.1 — the row rendered weekday-less time and date as two siblings either side of the
//   group name; `formatSessionWhen` composes them into one string and a single
//   `<bdi dir="ltr">` holds it, so an RTL paragraph cannot interleave it with the group name
//   the way the owner's screenshot showed (`16:00קבוצה 14 בספטמבר 2026`).
// - B1.3 — `תזכורת למאמן` and `סימון עכשיו` used to be two ghost buttons per row; both now
//   live behind one `RowActions` `⋯`, and the reminder's outcome renders beside it as a
//   `StatusChip` — a result, not a third action.
// - B1.4 — `סימון עכשיו` used to call `onMarkNow?.(sessionId)`, which nobody ever supplied
//   (the register lives in the staff app, on a hostname this app has no business guessing).
//   It now opens `QuickViewRoster` — already built for exactly this by `1e` — in place,
//   wired to the same client this screen already holds. No cross-origin link invented.
// - B1.5 — the per-group card was a bulleted `<ul>` whose spans had no shared column
//   boundary, so a longer coverage count pushed every string after it sideways. It is now a
//   `Table` (group · rate · coverage): three real `<col>`s, so every row's coverage cell
//   starts at the same inline offset regardless of how many digits it holds.
import { useEffect, useState } from 'react'
import {
  Button,
  DateRangePicker,
  EmptyState,
  ProgressBar,
  RowActions,
  StatusChip,
  Table,
  useModalDialog,
} from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { apiFetch, downloadFile, fill, formatSessionWhen } from '@studio/core'
import type { RosterRow } from '@studio/core'
import { QuickViewRoster } from './QuickViewRoster'
import { MAX_REPORT_DAYS, attendanceExportPath, daysBetween } from './client'
import type { DashboardAttendanceClient, GroupRate, UnmarkedSession } from './client'

export function AttendanceReport({
  locale,
  client,
  window,
  onWindowChange,
}: {
  locale: Locale
  client: DashboardAttendanceClient
  window: { from: string; to: string }
  /** Supplied by whoever owns the range state. The picker is rendered only when it is:
   *  a control whose changes went nowhere would be worse than no control. */
  onWindowChange?: (range: { from: string; to: string }) => void
}) {
  const [unmarked, setUnmarked] = useState<UnmarkedSession[] | null>(null)
  // `4c`'s second card. It used to be a prop defaulting to `[]` that every caller took the
  // default of, so the block rendered its empty state and nothing else, ever. It comes off
  // the same request as the list above it because they are one question asked of one
  // window — two requests would let the picker drive them out of step for a frame.
  const [groups, setGroups] = useState<GroupRate[]>([])
  // F7a — which coach reminders went, per session, and F7b's export failure.
  const [reminded, setReminded] = useState<Record<string, 'sent' | 'quiet' | 'failed'>>({})
  const [selectedSessions, setSelectedSessions] = useState<string[]>([])
  const [exportFailed, setExportFailed] = useState(false)
  // B1.4 — the popover state. `quickViewRoster` starts empty rather than `null` so
  // `QuickViewRoster`'s own close button is live the instant the popover opens, even before
  // `sessionRoster` resolves — a manager should never open a dialog with no way out of it.
  const [quickViewSessionId, setQuickViewSessionId] = useState<string | null>(null)
  const [quickViewRoster, setQuickViewRoster] = useState<RosterRow[]>([])

  async function remindCoach(sessionId: string) {
    const response = await apiFetch(`/api/v1/reminders/sessions/${sessionId}/coach`, {
      method: 'POST',
    })
    setReminded((current) => ({
      ...current,
      [sessionId]: response.ok ? 'sent' : response.status === 409 ? 'quiet' : 'failed',
    }))
  }

  // Checked before the request rather than after a 422, and against the same 400 days the
  // CSV export enforces. A manager who typed a decade wants to be told so by the field they
  // typed it into, not by a table that renders empty.
  const inverted = Boolean(window.from && window.to && window.to < window.from)
  const tooLong = !inverted && daysBetween(window.from, window.to) > MAX_REPORT_DAYS
  const rangeUsable = !inverted && !tooLong

  function refetchReport() {
    if (!rangeUsable) return
    void client
      .report(window)
      .then((data) => {
        setUnmarked(data.unmarked_sessions)
        setGroups(data.groups)
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    // No request, and no state written here either: what an unusable range renders is
    // DERIVED below rather than stored. Clearing state from inside an effect is a cascading
    // render (react-hooks/set-state-in-effect), and it would also mean the last good result
    // was destroyed by a half-typed date — so correcting the year would refetch what the
    // screen still had.
    if (!rangeUsable) return
    let live = true
    void client
      .report(window)
      .then((data) => {
        if (!live) return
        setUnmarked(data.unmarked_sessions)
        setGroups(data.groups)
      })
      .catch(() => {
        // §10.2 — the dashboard is online only, explicitly. An empty list with no rows is
        // the honest rendering; there is no cache behind this screen to fall back to.
        if (live) {
          setUnmarked([])
          setGroups([])
        }
      })
    return () => {
      live = false
    }
  }, [client, window, rangeUsable])

  // An unusable range shows nothing rather than the answer to a different question. The
  // message above the two lists says which range was refused and why.
  const shownUnmarked = rangeUsable ? unmarked : []
  const shownGroups = rangeUsable ? groups : []

  // B1.4 — open `QuickViewRoster` where the manager already is, rather than firing a
  // callback nobody upstream could safely implement. `sessionRoster` is the same call
  // `SessionPopover` (the week board's equivalent) makes; this screen already holds the
  // client that exposes it.
  function openQuickView(sessionId: string) {
    setQuickViewSessionId(sessionId)
    setQuickViewRoster([])
    void client
      .sessionRoster(sessionId)
      .then((data) => setQuickViewRoster(data.roster))
      .catch(() => setQuickViewRoster([]))
  }

  function closeQuickView() {
    setQuickViewSessionId(null)
    setQuickViewRoster([])
    // A session marked to completion in the popover may no longer belong on the unmarked
    // list, and the group card's coverage may have moved. Re-asking the same question the
    // picker already answers is cheaper than tracking which rows changed underneath it.
    refetchReport()
  }

  function markInQuickView(studentId: string, status: RosterRow['status']) {
    const sessionId = quickViewSessionId
    if (!sessionId) return
    void client
      .mark(sessionId, { studentId, status })
      .then(() => client.sessionRoster(sessionId))
      .then((data) => setQuickViewRoster(data.roster))
      .catch(() => undefined)
  }

  function bulkPresentInQuickView() {
    const sessionId = quickViewSessionId
    if (!sessionId) return
    void client
      .bulkPresent(sessionId)
      .then(() => client.sessionRoster(sessionId))
      .then((data) => setQuickViewRoster(data.roster))
      .catch(() => undefined)
  }

  const quickViewSession = shownUnmarked?.find((session) => session.id === quickViewSessionId) ?? null
  // The dialog is `open` for exactly as long as a session id is chosen — closing it always
  // goes through `closeQuickView`, so the refetch above runs on Escape and the backdrop too,
  // not only the roster's own × button.
  const quickViewDialogRef = useModalDialog(quickViewSessionId !== null, closeQuickView)

  return (
    <section aria-labelledby="attendance-report-title" data-testid="attendance-report">
      <header>
        <h1 id="attendance-report-title">{t(locale, 'attendance.report.title')}</h1>
        {/* `9b`'s primitive, adopted rather than rebuilt: it pairs the two fields, sizes
            them alike and refuses an end before its start, in two directions and three
            locales. The picker and the export button share this header on purpose — gap 3
            was that they disagreed, and the cheapest guarantee that they never do again is
            that they are read off the same `window` two lines apart. */}
        {onWindowChange ? (
          <DateRangePicker
            errorMessage={t(locale, 'attendance.report.rangeInverted')}
            from={window.from}
            fromLabel={t(locale, 'attendance.report.rangeFrom')}
            onChange={onWindowChange}
            to={window.to}
            toLabel={t(locale, 'attendance.report.rangeTo')}
          />
        ) : null}
        {tooLong ? (
          <p data-testid="range-too-long" role="alert">
            {t(locale, 'attendance.report.rangeTooLong').replace(
              '{{days}}',
              String(MAX_REPORT_DAYS),
            )}
          </p>
        ) : null}
        <Button
          variant="secondary"
          data-testid="attendance-export"
          // The CSV covers the same range the table does, so a range the table refuses is a
          // range the CSV must not offer — the server would answer 422 and the manager
          // would get a failed download with no explanation.
          disabled={!rangeUsable}
          onClick={() => {
            setExportFailed(false)
            void downloadFile(
              attendanceExportPath(window),
              `attendance-${window.from}-${window.to}.csv`,
            ).catch(() => setExportFailed(true))
          }}
        >
          {t(locale, 'attendance.report.export')}
        </Button>
        {exportFailed ? (
          <span data-testid="attendance-export-failed">{t(locale, 'common.loadFailed.body')}</span>
        ) : null}
      </header>

      <section data-testid="unmarked-sessions">
        <h2>{t(locale, 'attendance.report.unmarkedSessions')}</h2>
        {/* finding 1 — the rule, said out loud. §5.14 is why `unmarked` is a real state at
            all, and a manager reading this screen has to know that a forgotten register is
            not a child who stopped coming. */}
        <p data-testid="unmarked-not-absence">
          {t(locale, 'attendance.report.unmarkedNotAbsence')}
        </p>

        {shownUnmarked === null ? null : shownUnmarked.length === 0 ? (
          // finding 6 — "Neither empty state is drawn, and both are the goal state." An
          // empty `ממתין לסימון` list is the club doing well, and a screen that renders
          // nothing there looks broken instead.
          <EmptyState title={t(locale, 'attendance.report.empty')} />
        ) : (
          <>
          {/* F12 — selection plus a bulk action: one press reminds every selected
              coach, and each row keeps its own outcome. */}
          {selectedSessions.length > 0 ? (
            <Button
              data-testid="bulk-remind-coaches"
              onClick={() => {
                for (const sessionId of selectedSessions) void remindCoach(sessionId)
                setSelectedSessions([])
              }}
              variant="secondary"
            >
              {t(locale, 'attendance.report.remindCoach')} · {selectedSessions.length}
            </Button>
          ) : null}
          {/* B1.2 — a real grid, `select · group · when · actions`, so the group name takes
              the free space and every row's `when` and `actions` cells line up down the
              column instead of trailing wherever the group name's text happened to end. */}
          <ul data-testid="unmarked-list">
            {shownUnmarked.map((session) => {
              const outcome = reminded[session.id]
              return (
                <li data-testid={`unmarked-${session.id}`} key={session.id}>
                  <input
                    aria-label={session.group_name}
                    checked={selectedSessions.includes(session.id)}
                    data-testid={`select-session-${session.id}`}
                    onChange={() =>
                      setSelectedSessions((current) =>
                        current.includes(session.id)
                          ? current.filter((id) => id !== session.id)
                          : [...current, session.id],
                      )
                    }
                    type="checkbox"
                  />
                  <bdi>{session.group_name}</bdi>
                  {/* B1.1 — weekday, date and time, composed into one string by
                      `formatSessionWhen` and held in one `<bdi dir="ltr">`, so a
                      right-to-left paragraph cannot interleave it with the group name
                      beside it (`RangeText`'s lesson, applied to a datetime). The visually
                      hidden label gives the cell the same "when" context a real table
                      column header would, since this row is a grid rather than a
                      `<table>`. */}
                  <span className="unmarked-list__when">
                    <span className="studio-visually-hidden">
                      {t(locale, 'attendance.report.when')}
                    </span>
                    <bdi data-testid={`unmarked-when-${session.id}`} dir="ltr">
                      {formatSessionWhen(session.starts_at, locale)}
                    </bdi>
                  </span>
                  {/* B1.3 — one `⋯` per row instead of two ghost buttons. The reminder's
                      outcome is a result, not an action, so it sits beside the trigger as a
                      `StatusChip` rather than behind it. */}
                  <div className="unmarked-list__actions">
                    {outcome ? (
                      <StatusChip
                        label={t(
                          locale,
                          outcome === 'sent'
                            ? 'attendance.report.coachReminded'
                            : outcome === 'quiet'
                              ? 'billing.reminder.quietHours'
                              : 'common.loadFailed.body',
                        )}
                        // `ChipStatus` has no "reminder" vocabulary of its own — it was
                        // built for money and attendance state. Reused by tone rather than
                        // by name: `paid` reads as the settled/positive outcome (sent),
                        // `pending` as deferred rather than failed (quiet hours — it will
                        // still go out), `cancelled` as the negative one (failed).
                        status={
                          outcome === 'sent' ? 'paid' : outcome === 'quiet' ? 'pending' : 'cancelled'
                        }
                      />
                    ) : null}
                    <RowActions
                      actions={[
                        {
                          id: 'remind',
                          label: t(locale, 'attendance.report.remindCoach'),
                          onSelect: () => void remindCoach(session.id),
                        },
                        {
                          id: 'mark',
                          label: t(locale, 'attendance.report.markHere'),
                          onSelect: () => openQuickView(session.id),
                        },
                      ]}
                      triggerLabel={fill(t(locale, 'attendance.report.rowActions'), {
                        group: session.group_name,
                      })}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          </>
        )}

        {/* B1.4 — `QuickViewRoster` opened in place. No cross-origin link is built: the
            register lives in the staff app, on a hostname this app has no business
            guessing, so marking happens here instead, through the client this screen
            already holds. */}
        {quickViewSessionId ? (
          <div
            className="attendance-quickview__backdrop"
            data-testid="unmarked-quickview-backdrop"
            onClick={closeQuickView}
          >
            <div
              aria-label={
                quickViewSession
                  ? `${quickViewSession.group_name} · ${formatSessionWhen(quickViewSession.starts_at, locale)}`
                  : undefined
              }
              aria-modal="true"
              className="attendance-quickview__panel"
              data-testid="unmarked-quickview-panel"
              onClick={(event) => event.stopPropagation()}
              ref={quickViewDialogRef}
              role="dialog"
            >
              <QuickViewRoster
                locale={locale}
                onBulkPresent={bulkPresentInQuickView}
                onClose={closeQuickView}
                onMark={markInQuickView}
                roster={quickViewRoster}
              />
            </div>
          </div>
        ) : null}
      </section>

      <section data-testid="group-rates">
        <h2>{t(locale, 'attendance.report.byGroup')}</h2>
        {/* The denominator, said out loud. The same rule the unmarked list states, applied
            to the number beside it: a percentage whose denominator is unstated is a
            percentage someone will quote wrongly, and this is the one a manager quotes. */}
        <p data-testid="rate-basis">{t(locale, 'attendance.report.rateBasis')}</p>
        {/* B1.5 — a real `Table` (group · rate · coverage) rather than a bulleted list whose
            spans had no shared column boundary. `caption` repeats the `<h2>` above it and
            stays visually hidden (the default `captionVisible={false}`, A5) rather than
            printing `אחוז נוכחות לפי קבוצה` a second time. */}
        <Table<GroupRate>
          caption={t(locale, 'attendance.report.byGroup')}
          columns={[
            {
              id: 'group',
              header: t(locale, 'attendance.report.col.group'),
              width: '30%',
              cell: (group) => <bdi>{group.group_name}</bdi>,
            },
            {
              id: 'rate',
              header: t(locale, 'attendance.report.col.rate'),
              width: '45%',
              cell: (group) =>
                group.rate_percent === null ? (
                  // No bar at all. A bar at zero is a claim about children who did not
                  // come, and "nobody marked anything here" is not that claim — it is the
                  // subject of the list directly above this card.
                  <span data-testid={`group-no-rate-${group.group_id}`}>
                    {t(locale, 'attendance.report.noRate')}
                  </span>
                ) : (
                  <span data-testid={`group-rate-${group.group_id}`}>
                    <ProgressBar
                      label={group.group_name}
                      max={100}
                      readout={`${group.rate_percent}%`}
                      value={group.rate_percent}
                    />
                  </span>
                ),
            },
            {
              id: 'coverage',
              header: t(locale, 'attendance.report.col.coverage'),
              width: '25%',
              cell: (group) => (
                // 100% over one marked register out of nine is a different fact from 100%
                // over nine, and a bar alone cannot tell them apart.
                //
                // The counts go in an explicit ltr island rather than relying on the bidi
                // algorithm to keep `1/9` in order. It usually would — a slash between two
                // digit runs is a common separator and joins them — but the sentence is
                // translated, and the moment a locale puts a neutral character next to the
                // placeholder the run stops being self-contained. The island is what makes
                // the ordering a property of this component rather than of the strings.
                // The sentence is split around `{{counts}}` so each locale keeps its own
                // word order; `t()` does no interpolation of its own. Right-aligned (in the
                // logical sense — `text-align: end` in `attendance.css`) and tabular, so
                // every row's coverage cell starts at the same inline offset regardless of
                // how many digits it holds — the `Table`'s own `<col>` widths, not content,
                // decide where the column begins.
                <span
                  className="attendance-report__coverage"
                  data-testid={`group-coverage-${group.group_id}`}
                >
                  {t(locale, 'attendance.report.markedOfSessions')
                    .split('{{counts}}')
                    .flatMap((part, index) =>
                      index === 0
                        ? [part]
                        : [
                            <span dir="ltr" key="counts">
                              {group.marked_sessions}/{group.sessions}
                            </span>,
                            part,
                          ],
                    )}
                </span>
              ),
            },
          ]}
          empty={<EmptyState title={t(locale, 'attendance.report.empty')} />}
          rowKey={(group) => group.group_id}
          rows={shownGroups}
        />
      </section>
    </section>
  )
}
