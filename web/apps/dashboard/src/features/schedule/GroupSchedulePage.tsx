// Dashboard artboard 6a — עמוד קבוצה בודדת: רשימה + עריכת לו״ז שבועי.
//
// **A manager cannot change a schedule here without first reading what the change does.**
// `save-rules` sends `apply: false` and opens the dialog; only `confirm` sends
// `apply: true`. The server defaults `apply` to false for the same reason (§5.6), so the
// guarantee holds even if this component is bypassed — belt and braces, deliberately, on
// the one operation that can rewrite a year.
//
// Times are `<input type="time">` bound to the rule's naive local time, because that is
// what `group_schedule_rule` stores: a 17:00 class is 17:00 in November and 17:00 in June.
// Session times, by contrast, are UTC instants rendered through `@studio/core`'s
// Jerusalem-pinned formatter. Mixing the two up is how every summer class lands an hour
// early.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, StatusChip } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { GroupTrainingPanel } from '../training/GroupTrainingPanel'
import { ImpactDialog } from './ImpactDialog'
import { cancelReasonLabel } from './client'
import type { ImpactPreview, ScheduleClient, ScheduleRule, SessionRow, TrainingYear } from './client'

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  inlineSize: '100%',
}

const ruleRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'end',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  fontSize: 'var(--text-label)',
}

const sessionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const noteStyle: CSSProperties = { color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }

const errorStyle: CSSProperties = { color: 'var(--danger)' }

/** `17:00:00` from the API, `17:00` in an `<input type="time">`. */
const toInput = (value: string): string => value.slice(0, 5)
const toApi = (value: string): string => (value.length === 5 ? `${value}:00` : value)

function blankRule(groupId: string, effectiveFrom: string): ScheduleRule {
  return {
    group_id: groupId,
    weekday: 0,
    start_time: '17:00:00',
    end_time: '18:00:00',
    location_id: null,
    effective_from: effectiveFrom,
  }
}

export function GroupSchedulePage({
  locale,
  groupId,
  groupName,
  client,
}: {
  locale: Locale
  groupId: string
  groupName: string
  client: ScheduleClient
}) {
  const [rules, setRules] = useState<ScheduleRule[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [year, setYear] = useState<TrainingYear | null>(null)
  const [noActiveYear, setNoActiveYear] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImpactPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState('')

  useEffect(() => {
    let live = true
    void (async () => {
      const years = await client.listTrainingYears()
      const active = years.find((candidate) => candidate.status === 'active') ?? null
      if (!live) return
      if (!active) {
        setNoActiveYear(true)
        setLoaded(true)
        return
      }
      setYear(active)
      setEffectiveFrom(active.starts_on)
      const [loadedRules, loadedSessions] = await Promise.all([
        client.getSchedule(groupId),
        client.listSessions({ from: active.starts_on, to: active.ends_on, groupId }),
      ])
      if (!live) return
      setRules(loadedRules)
      setSessions(loadedSessions)
      setLoaded(true)
    })()
    return () => {
      live = false
    }
  }, [client, groupId])

  const updateRule = useCallback((index: number, patch: Partial<ScheduleRule>) => {
    setRules((current) =>
      current.map((rule, position) => (position === index ? { ...rule, ...patch } : rule)),
    )
  }, [])

  const payload = useCallback(
    () =>
      rules.map((rule) => ({
        ...rule,
        start_time: toApi(rule.start_time),
        end_time: toApi(rule.end_time),
      })),
    [rules],
  )

  const requestPreview = useCallback(async () => {
    // Checked here as well as by the schema, because a 422 arrives as a red box with no
    // idea which of five rows was wrong.
    if (rules.some((rule) => toApi(rule.end_time) <= toApi(rule.start_time))) {
      setError(t(locale, 'schedule.rules.endBeforeStart'))
      return
    }
    setError(null)
    setBusy(true)
    try {
      setPreview(
        await client.putSchedule(groupId, {
          rules: payload(),
          effective_from: effectiveFrom,
          apply: false,
        }),
      )
    } finally {
      setBusy(false)
    }
  }, [client, effectiveFrom, groupId, locale, payload, rules])

  const applyChange = useCallback(async () => {
    setBusy(true)
    try {
      await client.putSchedule(groupId, {
        rules: payload(),
        effective_from: effectiveFrom,
        apply: true,
      })
      if (year) {
        setSessions(await client.listSessions({ from: year.starts_on, to: year.ends_on, groupId }))
        setRules(await client.getSchedule(groupId))
      }
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }, [client, effectiveFrom, groupId, payload, year])

  if (noActiveYear) {
    return (
      <EmptyState
        title={t(locale, 'schedule.group.noActiveYear')}
        description={t(locale, 'schedule.group.noActiveYearHint')}
      />
    )
  }

  return (
    <section aria-labelledby="group-schedule-title" style={pageStyle}>
      <h2 id="group-schedule-title">{groupName}</h2>

      {/* What this group IS, for a training plan: base, extra or private, and whether it
          is an invite list. Here rather than on the groups index because the manager is
          already looking at ONE group, and the eligibility checklist is about this one. */}
      <GroupTrainingPanel locale={locale} groupId={groupId} />

      <section aria-labelledby="rules-title">
        <h3 id="rules-title">{t(locale, 'schedule.rules.title')}</h3>
        {loaded && rules.length === 0 ? <p>{t(locale, 'schedule.rules.empty')}</p> : null}

        <div data-testid="weekly-rules">
          {rules.map((rule, index) => (
            <div key={rule.id ?? `new-${index}`} data-testid="rule-row" style={ruleRowStyle}>
              <label style={fieldStyle}>
                {t(locale, 'schedule.rules.weekday')}
                <select
                  value={rule.weekday}
                  data-testid="weekday"
                  onChange={(event) => updateRule(index, { weekday: Number(event.target.value) })}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {t(locale, `schedule.weekday.${day}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldStyle}>
                {t(locale, 'schedule.rules.startTime')}
                <input
                  type="time"
                  data-testid="start-time"
                  value={toInput(rule.start_time)}
                  onChange={(event) => updateRule(index, { start_time: event.target.value })}
                />
              </label>
              <label style={fieldStyle}>
                {t(locale, 'schedule.rules.endTime')}
                <input
                  type="time"
                  data-testid="end-time"
                  value={toInput(rule.end_time)}
                  onChange={(event) => updateRule(index, { end_time: event.target.value })}
                />
              </label>
              <Button
                variant="secondary"
                data-testid="remove-rule"
                onClick={() => setRules((current) => current.filter((_, at) => at !== index))}
              >
                {t(locale, 'schedule.rules.remove')}
              </Button>
            </div>
          ))}
        </div>

        <Button
          variant="secondary"
          data-testid="add-rule"
          onClick={() => setRules((current) => [...current, blankRule(groupId, effectiveFrom)])}
        >
          {t(locale, 'schedule.rules.add')}
        </Button>

        <label style={fieldStyle}>
          {t(locale, 'schedule.group.changeFrom')}
          <input
            type="date"
            data-testid="effective-from"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>

        {error ? (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        ) : null}

        <Button data-testid="save-rules" disabled={busy} onClick={() => void requestPreview()}>
          {t(locale, 'schedule.group.reviewChange')}
        </Button>
      </section>

      <section aria-labelledby="sessions-title">
        <h3 id="sessions-title">{t(locale, 'schedule.group.sessions')}</h3>
        <Card>
          {sessions.map((session) => (
            <div key={session.id} data-testid="session-row" style={sessionRowStyle}>
              <span>{formatDateInStudioZone(session.starts_at, locale)}</span>
              <span data-testid="session-time">
                {formatTimeInStudioZone(session.starts_at, locale)}
                {'–'}
                {formatTimeInStudioZone(session.ends_at, locale)}
              </span>
              <StatusChip
                status={session.status === 'cancelled' ? 'cancelled' : 'planned'}
                label={t(locale, `schedule.session.status.${session.status}`)}
              />
              {/* An ad-hoc session carries BOTH flags — the service sets both — so the
                  labels are exclusive here. Showing them together reads as two separate
                  facts about one lesson when it is really one. */}
              {session.is_ad_hoc ? (
                <span style={noteStyle}>{t(locale, 'schedule.session.adHoc')}</span>
              ) : session.is_manually_edited ? (
                <span style={noteStyle}>{t(locale, 'schedule.session.manuallyEdited')}</span>
              ) : null}
              {session.cancel_reason ? (
                <span style={noteStyle}>{cancelReasonLabel(locale, session.cancel_reason)}</span>
              ) : null}
            </div>
          ))}
        </Card>
      </section>

      {preview ? (
        <ImpactDialog
          locale={locale}
          preview={preview}
          busy={busy}
          onConfirm={() => void applyChange()}
          onCancel={() => setPreview(null)}
        />
      ) : null}
    </section>
  )
}
