// §4.4's screen — `#/tasks`, checkpoint 8. The list itself is `useOpenTasks`'s; this file
// is only the chrome around it: the filter chips (drawn as §4.4 asks, "all / urgent /
// follow-up"), the empty state, and one card layout shared by every kind.
//
// **Not built, on purpose (§9):** the birthday section — hand-authored in the prototype
// and disconnected from any real date of birth, "one entry has a name and an id belonging
// to two different children" — and the refresh button, which in the prototype only spins
// for 500ms and refetches nothing. Every button on this screen has a real destination or a
// real handler; a decorative refresh icon would be the one exception, which is exactly why
// it is absent rather than wired to `alert()` or left spinning.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, MoneyDisplay, StatusChip } from '@studio/ui'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ContactFamiliesButton } from '../contact'
import type { StaffScheduleClient } from '../schedule/client'
import type { StaffPeopleClient } from '../people'
import type { StaffCommsClient } from '../comms'
import type { PromiseClient } from '../billing/promiseClient'
import type { TasksClient } from './tasksClient'
import { useOpenTasks } from './useOpenTasks'
import { openTaskCount } from './deriveTasks'
import type { TaskBucket, TaskCard } from './deriveTasks'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const noteStyle: CSSProperties = { color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }

const chipRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBlockEnd: 'var(--space-1)',
}

const chipStyle: CSSProperties = {
  minBlockSize: '44px',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-pill)',
  border: 'var(--border-width-hairline) solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-medium)',
  whiteSpace: 'nowrap',
}

const selectedChipStyle: CSSProperties = {
  ...chipStyle,
  background: 'var(--fg)',
  color: 'var(--on-fg)',
  border: 'var(--border-width-hairline) solid var(--fg)',
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
}

const titleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
}

const subtitleStyle: CSSProperties = { margin: 0, color: 'var(--text-secondary)' }

const alertBoxStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
}

const alertTextStyle: CSSProperties = {
  margin: 0,
  color: 'var(--fg)',
  fontSize: 'var(--text-caption)',
  lineHeight: 1.5,
}

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  marginBlockStart: 'var(--space-3)',
}

const linkActionStyle: CSSProperties = {
  alignItems: 'center',
  display: 'inline-flex',
  minBlockSize: '44px',
  paddingInline: 'var(--space-3)',
  textDecoration: 'none',
}

const FILTERS: { key: 'all' | TaskBucket; labelKey: string }[] = [
  { key: 'all', labelKey: 'tasks.filter.all' },
  { key: 'urgent', labelKey: 'tasks.filter.urgent' },
  { key: 'followUp', labelKey: 'tasks.filter.followUp' },
]

function FilterChip({
  selected,
  label,
  onSelect,
  testId,
}: {
  selected: boolean
  label: string
  onSelect: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={testId}
      style={selected ? selectedChipStyle : chipStyle}
      onClick={onSelect}
    >
      {label}
    </button>
  )
}

function TaskCardView({ task, locale }: { task: TaskCard; locale: Locale }) {
  return (
    <Card>
      <div style={cardHeaderStyle}>
        <StatusChip status={task.bucket === 'urgent' ? 'debt' : 'pending'} label={task.badgeText} />
        <span style={noteStyle}>
          <bdi>{task.scope}</bdi>
        </span>
      </div>
      <p style={titleStyle}>
        <bdi>{task.title}</bdi>
      </p>
      {task.subtitle ? (
        <p style={subtitleStyle}>
          <bdi>{task.subtitle}</bdi>
        </p>
      ) : null}
      {task.moneyAgorot != null ? <MoneyDisplay agorot={task.moneyAgorot} /> : null}
      <div style={alertBoxStyle}>
        <p style={alertTextStyle}>{task.alertText}</p>
      </div>
      <div style={actionsRowStyle}>
        {task.primaryAction.kind === 'link' ? (
          <a
            href={task.primaryAction.href}
            onClick={task.primaryAction.onSelect}
            className="studio-btn"
            data-variant="primary"
            style={linkActionStyle}
            data-testid={`task-action-${task.id}`}
          >
            {task.primaryAction.label}
          </a>
        ) : (
          <ContactFamiliesButton
            locale={locale}
            triggerLabel={task.primaryAction.triggerLabel}
            title={task.primaryAction.title}
            message={task.primaryAction.message}
            resolveFamilies={task.primaryAction.resolveFamilies}
          />
        )}
        {task.tick ? (
          <Button
            variant="secondary"
            onClick={task.tick.onTick}
            data-testid={`task-tick-${task.id}`}
          >
            {task.tick.label}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

export function TasksScreen({
  locale,
  scheduleClient,
  peopleClient,
  commsClient,
  promiseClient,
  tasksClient,
  viewerPersonId,
  viewerIsManager,
  today,
}: {
  locale: Locale
  scheduleClient: StaffScheduleClient
  peopleClient: StaffPeopleClient
  commsClient: StaffCommsClient
  promiseClient?: PromiseClient
  tasksClient?: TasksClient
  viewerPersonId: string | null
  viewerIsManager: boolean
  today: string
}) {
  const { tasks } = useOpenTasks({
    enabled: true,
    locale,
    scheduleClient,
    peopleClient,
    commsClient,
    promiseClient,
    tasksClient,
    viewerPersonId,
    viewerIsManager,
    today,
  })
  const [filter, setFilter] = useState<'all' | TaskBucket>('all')

  const openCount = openTaskCount(tasks)
  const urgentCount = tasks.filter((task) => task.bucket === 'urgent').length
  const followUpCount = openCount - urgentCount
  const countFor = (key: 'all' | TaskBucket) =>
    key === 'all' ? openCount : key === 'urgent' ? urgentCount : followUpCount
  const visible = filter === 'all' ? tasks : tasks.filter((task) => task.bucket === filter)

  return (
    <section aria-labelledby="tasks-title" data-testid="staff-tasks" style={pageStyle}>
      <h1 id="tasks-title">{t(locale, 'tasks.title')}</h1>
      <p style={noteStyle} data-testid="tasks-open-count">
        {plural(locale, 'tasks.openCount', openCount)}
      </p>

      <div role="group" aria-label={t(locale, 'tasks.filter.groupLabel')} style={chipRowStyle}>
        {FILTERS.map(({ key, labelKey }) => (
          <FilterChip
            key={key}
            selected={filter === key}
            onSelect={() => setFilter(key)}
            testId={`tasks-filter-${key}`}
            label={`${t(locale, labelKey)} ${countFor(key)}`}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={t(locale, 'tasks.empty')}
          description={t(locale, 'tasks.emptyHint')}
        />
      ) : (
        <ul style={listStyle}>
          {visible.map((task) => (
            <li key={task.id} data-testid={`task-${task.id}`}>
              <TaskCardView task={task} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
