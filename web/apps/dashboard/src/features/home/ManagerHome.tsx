import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fill, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import {
  Card,
  EmptyState,
  Icon,
  LoadFailed,
  MoneyDisplay,
  PageHeader,
  RangeText,
  SectionHeader,
  StatusChip,
} from '@studio/ui'
import type { IconName } from '@studio/ui'
import type { HomeClient, HomeData } from './homeClient'

/**
 * The manager home — docs/design/proposals/manager-home.md.
 *
 * A manager opening the dashboard has always landed on the weekly calendar, because
 * `resolveRoute` had no home branch. The calendar answers "what is scheduled?"; their
 * question at 07:00 is "what needs me today?", and answering it meant visiting
 * `#/billing`, `#/alerts`, `#/documents` and `#/schedule` in turn, and knowing to.
 *
 * **It owns no data and performs no mutation.** Every number is a link to the screen that
 * already explains it. A region that would need a control richer than a link belongs on
 * its own screen — that rule is what keeps this from growing into a second dashboard.
 *
 * Regions resolve independently (`homeClient` uses `allSettled`), so one endpoint being
 * down costs one region rather than the page.
 */
/**
 * One executive KPI card, in the prototype's own composition.
 *
 * A muted label; a large value with a secondary figure on its baseline; a tinted icon
 * badge on the far edge; a rule; then a foot carrying a note and the way in. The tone
 * drives the value's colour and the badge's tint from the SEMANTIC band, so a debt figure
 * is the same red here as everywhere else in the product — the surface palette re-values
 * the greys around it and never these.
 *
 * It is a link, not a card with a link inside it: the whole tile is the target, the way
 * `StatTile` already behaved, so the click area does not shrink to the words in the foot.
 */
function KpiCard({
  label,
  value,
  secondary,
  note,
  action,
  href,
  icon,
  tone,
}: {
  label: string
  value: ReactNode
  secondary?: string
  note?: string
  action: string
  href: string
  icon: IconName
  tone: 'debt' | 'paid' | 'pending' | 'neutral'
}) {
  return (
    <a className="dash-kpi" data-tone={tone} href={href}>
      <span className="dash-kpi__head">
        <span className="dash-kpi__text">
          <span className="dash-kpi__label">{label}</span>
          <span className="dash-kpi__figures">
            <span className="dash-kpi__value">{value}</span>
            {secondary ? <span className="dash-kpi__secondary">{secondary}</span> : null}
          </span>
        </span>
        <span aria-hidden="true" className="dash-kpi__badge">
          <Icon name={icon} />
        </span>
      </span>
      <span className="dash-kpi__foot">
        {note ? <span className="dash-kpi__note">{note}</span> : <span />}
        <span className="dash-kpi__action">{action}</span>
      </span>
    </a>
  )
}

/**
 * Where a class sits against the clock: finished, on the mat now, or still to come.
 *
 * Read from the wall clock rather than from `today`, which says which DAY is drawn and
 * nothing about which minute it is. Taken as an argument so the value is stable for one
 * render and the function stays testable at a fixed instant.
 */
export function whenIs(
  session: { startsAt: string; endsAt: string },
  nowMs: number,
): 'past' | 'live' | 'soon' {
  if (Date.parse(session.endsAt) <= nowMs) return 'past'
  if (Date.parse(session.startsAt) <= nowMs) return 'live'
  return 'soon'
}

export function ManagerHome({
  locale,
  client,
  studioId,
  studioName,
  today,
  alerts,
}: {
  locale: Locale
  client: HomeClient
  studioId: string
  studioName?: string
  /** D8's alert centre, passed in rather than mounted here.
   *
   *  The sections need the PEOPLE client, and this screen has no business holding one:
   *  it owns no data and performs no mutation, and taking a second client would be the
   *  first crack in that. App.tsx already has both, so it composes them. */
  alerts?: ReactNode
  /** The ISO instant from `useToday`, which is stable for as long as the studio's day is.
   *  Taken as a string and widened here rather than as a `Date`: `new Date()` at the call
   *  site would be a fresh value every render and would re-fire the load below. */
  today: string
}) {
  const [data, setData] = useState<HomeData | null>(null)
  const [failed, setFailed] = useState(false)
  // Bumped by the retry button. `load` already swallows a single region's failure, so
  // reaching this state means the whole request threw — which is worth offering again.
  const [attempt, setAttempt] = useState(0)
  const day = useMemo(() => new Date(today), [today])
  // Captured when the data lands, not read during render.
  //
  // `Date.now()` in a render body is impure and the lint rule refuses it — for the same
  // reason this file's own header gives for taking `today` as a prop rather than calling
  // `new Date()`: a component that reads the clock cannot be tested at a fixed instant,
  // and re-renders would silently move it. Stamped alongside the load it describes, so
  // every card on one render agrees about what "now" was.
  const [nowMs, setNowMs] = useState(0)

  useEffect(() => {
    let alive = true
    // The success path clears `failed` rather than the effect body doing it up front:
    // a synchronous setState here is a render the user pays for on every load, and
    // react-hooks/set-state-in-effect rejects it.
    void client
      .load(studioId, day)
      .then((loaded) => {
        if (!alive) return
        setData(loaded)
        setNowMs(Date.now())
        setFailed(false)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [client, studioId, day, attempt])

  if (failed) return <LoadFailed locale={locale} onRetry={() => setAttempt((n) => n + 1)} />

  const money = data?.money ?? null
  const attention = data?.attention ?? null
  const todaysClasses = data?.today ?? null
  // B6.4 — every group's rate null (nobody marked anything in 30 days) is a different
  // fact from some groups being null (mixed-marked, one column per group is correct).
  // `data.attendance` is checked non-empty at the call site below before this is read.
  const attendanceAllUnmarked = (data?.attendance ?? []).every((group) => group.rate_percent === null)

  return (
    <div className="dash-home">
      <PageHeader subtitle={studioName} title={t(locale, 'common.dash.home.title')} />

      {/* The KPI band — the prototype's four executive cards, with our own figures.
          Each is: a muted label, a large value with a secondary figure beside it, a tinted
          icon badge, a rule, and a foot carrying a note and the way in. The prototype's
          other two cards are deliberately absent: one draws a percentage of a revenue
          TARGET and one a club-occupancy percentage, and this product stores neither a
          target nor a capacity (D2). Their slots go to two numbers a manager actually
          chases and we genuinely hold. */}
      {money || attention ? (
        <div className="dash-home__kpis">
          {money ? (
            <KpiCard
              action={t(locale, 'common.dash.home.money.debtAction')}
              href="#/billing"
              icon="payments"
              label={t(locale, 'common.dash.home.money.debt')}
              note={t(locale, 'common.dash.home.money.overdue')}
              secondary={fill(t(locale, 'common.dash.home.money.households'), {
                count: money.debtHouseholds,
              })}
              tone="debt"
              value={<MoneyDisplay agorot={money.debtAgorot} />}
            />
          ) : null}
          {money ? (
            <KpiCard
              action={t(locale, 'common.dash.home.money.collectedAction')}
              href="#/billing"
              icon="reports"
              label={t(locale, 'common.dash.home.money.collected')}
              tone="paid"
              value={<MoneyDisplay agorot={money.collectedAgorot} />}
            />
          ) : null}
          {attention ? (
            // Missing declarations rather than uncovered sessions, and the choice matters:
            // an uncovered class is ALREADY on this screen, as a red chip on its own row in
            // today's list directly below. A missing declaration appears nowhere else on
            // the home — it had a row in the attention list this band replaced, and losing
            // it would have left the fact carried only by a badge in the nav.
            <KpiCard
              action={t(locale, 'common.dash.home.attention.all')}
              href="#/documents"
              icon="documents"
              label={t(locale, 'common.dash.home.attention.health')}
              tone={attention.missingHealth > 0 ? 'pending' : 'neutral'}
              value={attention.missingHealth}
            />
          ) : null}
          {attention ? (
            <KpiCard
              action={t(locale, 'common.dash.home.attendanceChart.all')}
              href="#/attendance"
              icon="attendance"
              label={t(locale, 'common.dash.home.attention.unmarked')}
              tone={attention.unmarked > 0 ? 'pending' : 'neutral'}
              value={attention.unmarked}
            />
          ) : null}
        </div>
      ) : null}

      {/* D8 — the alert centre, rendered here rather than only behind `#/alerts`.
          Six sections from five feature lanes register into that slot: the debt alert,
          attendance-at-risk, coach unavailability, the health-review hold, trials
          awaiting a decision and upcoming trials. Every one of them was live and correct
          and sat on a route with no reason to visit it, which is the definition of an
          alert nobody sees.
          Directly under the money band, where the prototype puts its urgent tray, and
          above today's classes: several sections deliberately render `null` when they
          hold nothing, so on a quiet morning this collapses to no space at all rather
          than to a row of reassuring zeroes. */}
      {alerts ? <div className="dash-home__tray">{alerts}</div> : null}

      {/* B6.2 — a two-column body below the money band: the wide column answers "what
          needs me today?" (today's classes, then the attendance trend), the narrow
          column is "what needs me at all" (open alerts). `.dash-reports__body` already
          owns this exact grid/breakpoint rule; home.css matches it rather than inventing
          a second one, so the two main screens share a body shape. */}
      <div className="dash-home__body">
        <div className="dash-home__main">
          {/* Today's classes led the diagram but was the last card on the page — moved
              to the top of the wide column, since it answers what needs the manager today. */}
          {todaysClasses ? (
            <Card>
              <SectionHeader
                action={<a href="#/schedule">{t(locale, 'common.dash.home.today.fullWeek')}</a>}
                title={t(locale, 'common.dash.home.today.title')}
              />
              {/* Cards, not a table. The prototype draws each class as its own block
                  carrying a STATE — finished, on the mat now, still to come — which a
                  row of cells cannot show without a column nobody reads. The state is
                  computed from the wall clock against the session's own window. */}
              {todaysClasses.length === 0 ? (
                <EmptyState title={t(locale, 'common.dash.home.today.none')} />
              ) : (
                <ul className="dash-home__today" data-testid="home-today-list">
                  {todaysClasses.map((row) => {
                    const when = whenIs(row, nowMs)
                    return (
                      <li className="dash-home__class" data-when={when} key={row.id}>
                        <div className="dash-home__class-when">
                          <RangeText
                            from={formatTimeInStudioZone(row.startsAt, locale)}
                            to={formatTimeInStudioZone(row.endsAt, locale)}
                          />
                          <StatusChip
                            label={t(locale, `common.dash.home.today.when.${when}`)}
                            status={when === 'live' ? 'paid' : when === 'past' ? 'unmarked' : 'planned'}
                          />
                        </div>
                        <div className="dash-home__class-body">
                          <strong>
                            <bdi>{row.groupName}</bdi>
                          </strong>
                          <span className="dash-home__class-meta">
                            <bdi>{row.hall ?? '—'}</bdi>
                          </span>
                        </div>
                        {/* `3a`: an uncovered session must not render like a covered one. */}
                        {row.coach ? (
                          <span className="dash-home__class-coach">
                            <bdi>{row.coach}</bdi>
                          </span>
                        ) : (
                          <StatusChip
                            label={t(locale, 'common.dash.home.today.noCoach')}
                            status="debt"
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          ) : null}

        </div>

        <div className="dash-home__side">
          {/* The attendance bars (owner request 2026-08-30): rate per group over the last
              30 days, from 4c's own endpoint. A group nobody marked draws NO bar and says
              so — 0% would be a claim about children who were never counted. */}
          {data?.attendance && data.attendance.length > 0 ? (
            <Card>
              <SectionHeader
                // B6.4 — once every group is null the per-column "action" link moves into
                // the EmptyState itself; two links to the same place in one card reads as
                // clutter rather than as two ways out.
                action={
                  attendanceAllUnmarked ? undefined : (
                    <a href="#/attendance">{t(locale, 'common.dash.home.attendanceChart.all')}</a>
                  )
                }
                title={t(locale, 'common.dash.home.attendanceChart.title')}
              />
              {attendanceAllUnmarked ? (
                // B6.4 — seven grey tracks each captioned "אין נתונים" is seven
                // repetitions of one fact. One EmptyState says it once.
                <EmptyState
                  action={<a href="#/attendance">{t(locale, 'common.dash.home.attendanceChart.all')}</a>}
                  title={t(locale, 'common.dash.home.attendanceEmptyAll')}
                />
              ) : (
                <ol
                  className="dash-home__attendance-chart"
                  aria-label={t(locale, 'common.dash.home.attendanceChart.title')}
                  data-testid="home-attendance-chart"
                >
                  {data.attendance.map((group) => (
                    <li key={group.group_id} className="dash-home__attendance-column">
                      <span className="dash-home__attendance-value">
                        {group.rate_percent === null
                          ? t(locale, 'common.dash.home.attendanceChart.noRate')
                          : `${Math.round(group.rate_percent)}%`}
                      </span>
                      <span className="dash-home__attendance-track" aria-hidden="true">
                        {group.rate_percent !== null ? (
                          <span
                            className="dash-home__attendance-bar"
                            style={{
                              blockSize: `${Math.max(2, Math.min(100, group.rate_percent))}%`,
                            }}
                          />
                        ) : null}
                      </span>
                      <span className="dash-home__attendance-name">
                        <bdi>{group.group_name}</bdi>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ) : null}
        </div>

      </div>
    </div>
  )
}
