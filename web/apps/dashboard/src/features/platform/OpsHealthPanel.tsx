// §18.3's operations board — the "is this deployment working" half of #/platform.
//
// **The board answers the question an error hook cannot.** Four workers were scheduled
// nowhere for a whole milestone and nothing noticed, because a job that never runs raises
// nothing. So the primary column here is `last success`, not `last error`, and a job with
// no successful run inside the tolerance it declares in `infra/railway/jobs.json` reads
// `לא רצה בזמן` — even when it has never run at all, which is the case the board exists
// for.
//
// **A job this environment does not schedule is not a failure.** Seven of the nine entries
// are production's; read on staging they have all been silent forever, which is true and
// means nothing. They render `מתוזמנת בסביבה אחרת` and are never red. A screen showing
// seven permanent alarms is a screen its reader learns to skip, which costs more than no
// screen at all.
//
// **RTL.** Cron expressions, job names and timestamps are `dir="ltr"` islands: `*/15 * * *
// *` laid out right-to-left is a different expression, and `.claude/rules/ui-rtl-a11y.md`
// requires the island for bare digits regardless. Everything else flows with the document.
import type { ReactNode } from 'react'
import { Alert, Card, StatusChip, Table } from '@studio/ui'
import type { ChipStatus, TableColumn } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { JobHealth, OpsHealth, OpsSignal } from './client'

export type JobState = 'failing' | 'overdue' | 'elsewhere' | 'ok'

/** The state a job row is in, in the order the states matter.
 *
 *  `elsewhere` is checked FIRST: a production job read on staging has been silent for
 *  ever and is not overdue, because nobody asked it to run here.
 *
 *  `failing` outranks `overdue` because they need different fixes — one job ran and threw,
 *  the other never ran, and only the second is a question about the scheduler. */
export function jobState(job: JobHealth): JobState {
  if (!job.scheduled_here) return 'elsewhere'
  if (job.failing) return 'failing'
  if (job.overdue) return 'overdue'
  return 'ok'
}

//: The chip vocabulary is §4h's six statuses, not a private set. `paid`/`debt` carry the
//: green and red; `planned` is the muted tone for a job that belongs to another
//: environment, which is neither good news nor bad.
const JOB_TONE: Record<JobState, ChipStatus> = {
  failing: 'debt',
  overdue: 'debt',
  elsewhere: 'planned',
  ok: 'paid',
}

const SIGNAL_TONE: Record<string, ChipStatus> = {
  red: 'debt',
  unknown: 'pending',
  ok: 'paid',
}

/** An ISO instant as the studio reads it. G3 — stored UTC, rendered Asia/Jerusalem. */
function moment(iso: string | null, locale: Locale): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(locale === 'he' ? 'he-IL' : locale, {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function Ltr({ children }: { children: ReactNode }) {
  return <span dir="ltr">{children}</span>
}

export function OpsHealthPanel({ health, locale }: { health: OpsHealth; locale: Locale }) {
  const jobColumns: TableColumn<JobHealth>[] = [
    {
      id: 'name',
      header: t(locale, 'common.ops.jobs.name'),
      width: '22%',
      cell: (job) => <Ltr>{job.name}</Ltr>,
    },
    {
      id: 'state',
      header: t(locale, 'common.ops.jobs.state'),
      width: '20%',
      cell: (job) => {
        const state = jobState(job)
        return (
          <span data-testid={`job-state-${job.name}`}>
            <StatusChip label={t(locale, `common.ops.jobs.${state}`)} status={JOB_TONE[state]} />
          </span>
        )
      },
    },
    {
      id: 'lastSuccess',
      header: t(locale, 'common.ops.jobs.lastSuccess'),
      width: '24%',
      // "Has never run", not a blank or an em dash. An empty cell reads as a screen that
      // has not finished loading; this is a finding, and the most important one the board
      // can report.
      cell: (job) =>
        job.last_success_at ? (
          <Ltr>{moment(job.last_success_at, locale)}</Ltr>
        ) : (
          <span data-testid={`job-never-${job.name}`}>{t(locale, 'common.ops.jobs.never')}</span>
        ),
    },
    {
      id: 'schedule',
      header: t(locale, 'common.ops.jobs.schedule'),
      width: '20%',
      cell: (job) => <Ltr>{job.schedule}</Ltr>,
    },
    {
      id: 'tolerance',
      header: t(locale, 'common.ops.jobs.tolerance'),
      width: '14%',
      cell: (job) => <Ltr>{job.max_silence_minutes}</Ltr>,
    },
  ]

  return (
    <section aria-labelledby="ops-title" data-testid="ops-health">
      <header>
        <h3 id="ops-title">{t(locale, 'common.ops.title')}</h3>
        <p>
          <span data-testid="ops-status">
            <StatusChip
              label={t(locale, `common.ops.status.${health.status === 'red' ? 'red' : 'ok'}`)}
              status={health.status === 'red' ? 'debt' : 'paid'}
            />
          </span>{' '}
          <span data-testid="ops-checked-at">
            {t(locale, 'common.ops.checkedAt')}: <Ltr>{moment(health.checked_at, locale)}</Ltr>
          </span>
        </p>
      </header>

      {/* "No alerts" and "no delivery" look identical from an empty inbox and mean
          opposite things, so the screen says which one this is. */}
      {health.email_configured ? (
        <p data-testid="ops-email-on">{t(locale, 'common.ops.email.on')}</p>
      ) : (
        <Alert tone="pending" iconLabel={t(locale, 'common.dev.noticeIcon')}>
          <span data-testid="ops-email-off">{t(locale, 'common.ops.email.off')}</span>
        </Alert>
      )}

      <Card caption={t(locale, 'common.ops.jobs.title')}>
        <Table
          caption={t(locale, 'common.ops.jobs.title')}
          columns={jobColumns}
          rowKey={(job) => job.name}
          rows={health.jobs}
        />
      </Card>

      <Card caption={t(locale, 'common.ops.signals.title')}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {health.signals.map((signal: OpsSignal) => (
            <li data-testid={`ops-signal-${signal.id}`} key={signal.id}>
              {t(locale, `common.ops.signal.${signal.id}`)}{' '}
              <StatusChip
                label={t(locale, `common.ops.signal.${signal.status}`)}
                status={SIGNAL_TONE[signal.status] ?? 'pending'}
              />{' '}
              {signal.value === null ? null : <Ltr>{signal.value}</Ltr>}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}
