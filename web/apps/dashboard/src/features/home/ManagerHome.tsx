import { useEffect, useMemo, useState } from 'react'
import { formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import {
  Card,
  EmptyState,
  LoadFailed,
  MoneyDisplay,
  PageHeader,
  RangeText,
  SectionHeader,
  StatTile,
  StatusChip,
  Table,
} from '@studio/ui'
import type { TableColumn } from '@studio/ui'
import type { HomeClient, HomeData, HomeTodaySession } from './homeClient'

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
export function ManagerHome({
  locale,
  client,
  studioId,
  studioName,
  today,
}: {
  locale: Locale
  client: HomeClient
  studioId: string
  studioName?: string
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

  // Only the rows with something in them. A zero row is noise on a screen whose whole job
  // is to be scannable — but the region itself never hides, because "nothing needs
  // attention" is information a manager came here for.
  const attentionRows = attention
    ? ([
        { key: 'health', count: attention.missingHealth, tone: 'pending', href: '#/documents' },
        { key: 'noCoach', count: attention.noCoach, tone: 'debt', href: '#/schedule' },
        { key: 'unmarked', count: attention.unmarked, tone: 'pending', href: '#/attendance' },
      ] as const).filter((row) => row.count > 0)
    : []

  const columns: TableColumn<HomeTodaySession>[] = [
    {
      id: 'group',
      header: t(locale, 'common.dash.home.today.group'),
      width: '40%',
      cell: (row) => row.groupName,
    },
    {
      id: 'time',
      header: t(locale, 'common.dash.home.today.time'),
      width: '20%',
      // The first draft of this cell used two sibling `<bdi>` ends and rendered
      // 16:00–17:00 as `17:00–16:00`. RangeText is that fix, extracted — it is the third
      // place in this codebase to have shipped the same bidi bug.
      cell: (row) => (
        <RangeText
          from={formatTimeInStudioZone(row.startsAt, locale)}
          to={formatTimeInStudioZone(row.endsAt, locale)}
        />
      ),
    },
    {
      id: 'hall',
      header: t(locale, 'common.dash.home.today.hall'),
      width: '15%',
      cell: (row) => row.hall ?? '—',
    },
    {
      id: 'coach',
      header: t(locale, 'common.dash.home.today.coach'),
      width: '25%',
      // `3a`: an uncovered session must not render like a covered one. The shipped week
      // board draws them identically, which is how two coachless classes went unnoticed.
      cell: (row) =>
        row.coach ?? (
          <StatusChip label={t(locale, 'common.dash.home.today.noCoach')} status="debt" />
        ),
    },
  ]

  return (
    <div className="dash-home">
      <PageHeader subtitle={studioName} title={t(locale, 'common.dash.home.title')} />

      {money ? (
        <div className="dash-home__money">
          <StatTile
            hint={t(locale, 'common.dash.home.money.debtHint')}
            href="#/billing"
            label={t(locale, 'common.dash.home.money.debt')}
            tone="debt"
            value={<MoneyDisplay agorot={money.debtAgorot} />}
          />
          <StatTile
            href="#/billing"
            label={t(locale, 'common.dash.home.money.collected')}
            tone="paid"
            value={<MoneyDisplay agorot={money.collectedAgorot} />}
          />
          <StatTile
            hint={t(locale, 'common.dash.home.money.overdueHint')}
            href="#/billing"
            label={t(locale, 'common.dash.home.money.overdue')}
            tone={money.debtHouseholds > 0 ? 'debt' : 'neutral'}
            value={money.debtHouseholds}
          />
        </div>
      ) : null}

      {attention ? (
        <Card>
          <SectionHeader
            action={<a href="#/alerts">{t(locale, 'common.dash.home.attention.all')}</a>}
            title={t(locale, 'common.dash.home.attention.title')}
          />
          {attentionRows.length === 0 ? (
            <p className="dash-home__quiet">{t(locale, 'common.dash.home.attention.none')}</p>
          ) : (
            <ul className="dash-home__alerts">
              {attentionRows.map((row) => (
                <li key={row.key}>
                  <a href={row.href}>{t(locale, `common.dash.home.attention.${row.key}`)}</a>
                  {/* The word beside the colour, never the colour alone (SC 1.4.1). */}
                  <StatusChip
                    label={t(
                      locale,
                      row.tone === 'debt'
                        ? 'common.dash.home.severity.danger'
                        : 'common.dash.home.severity.pending',
                    )}
                    status={row.tone}
                  />
                  <span className="dash-home__count">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {/* The attendance bars (owner request 2026-08-30): rate per group over the last 30
          days, from 4c's own endpoint. A group nobody marked draws NO bar and says so —
          0% would be a claim about children who were never counted. */}
      {data?.attendance && data.attendance.length > 0 ? (
        <Card>
          <SectionHeader
            action={<a href="#/attendance">{t(locale, 'common.dash.home.attendanceChart.all')}</a>}
            title={t(locale, 'common.dash.home.attendanceChart.title')}
          />
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
                      style={{ blockSize: `${Math.max(2, Math.min(100, group.rate_percent))}%` }}
                    />
                  ) : null}
                </span>
                <span className="dash-home__attendance-name">
                  <bdi>{group.group_name}</bdi>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {todaysClasses ? (
        <Card>
          <SectionHeader
            action={<a href="#/schedule">{t(locale, 'common.dash.home.today.fullWeek')}</a>}
            title={t(locale, 'common.dash.home.today.title')}
          />
          <Table
            caption={t(locale, 'common.dash.home.today.title')}
            columns={columns}
            empty={<EmptyState title={t(locale, 'common.dash.home.today.none')} />}
            rowKey={(row) => row.id}
            rows={todaysClasses}
          />
        </Card>
      ) : null}
    </div>
  )
}
