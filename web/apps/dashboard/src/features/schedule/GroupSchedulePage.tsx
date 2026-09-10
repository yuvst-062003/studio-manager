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
import { Button, EmptyState, PageHeader, StatusChip } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { GroupTrainingPanel } from '../training/GroupTrainingPanel'
import { ClassCoachPanel } from './ClassCoachPanel'
import { GroupCoachPanel } from './GroupCoachPanel'
import { ImpactDialog } from './ImpactDialog'
import { cancelReasonLabel } from './client'
import type { ImpactPreview, ScheduleClient, ScheduleRule, SessionRow, TrainingYear } from './client'

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

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
  //: Which class this group belongs to. Resolved here rather than threaded in as a prop:
  //: the page already takes `groupName` and not the group itself, and two coach panels need
  //: the class — so it is fetched once and shared instead of twice and possibly disagreeing.
  const [klass, setKlass] = useState<{ id: string; name: string } | null>(null)
  //: Bumped when the class roster changes, so the group picker below re-reads it.
  const [rosterVersion, setRosterVersion] = useState(0)
  const [rules, setRules] = useState<ScheduleRule[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [year, setYear] = useState<TrainingYear | null>(null)
  const [noActiveYear, setNoActiveYear] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImpactPreview | null>(null)

  useEffect(() => {
    let alive = true
    void client
      .listGroups()
      .then((rows) => {
        if (!alive) return
        const found = rows.find((row) => row.id === groupId)
        setKlass(
          found && found.classId ? { id: found.classId, name: found.className || '' } : null,
        )
      })
      .catch(() => alive && setKlass(null))
    return () => {
      alive = false
    }
  }, [client, groupId])
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
    } catch {
      // Without this the promise rejected unhandled and the button simply did nothing:
      // no dialog, no message. On the screen whose whole job is "read what the change
      // does before it happens", silence is the worst available answer.
      setError(t(locale, 'schedule.group.previewFailed'))
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
    } catch {
      // The dialog is CLOSED and the error surfaces on the page behind it. Leaving the
      // dialog open with an error inside would invite a second press of Confirm, and a
      // partially-applied rewrite of a year is not something to retry blind — the manager
      // should re-read the impact, which means asking for the preview again.
      setPreview(null)
      setError(t(locale, 'schedule.group.applyFailed'))
    } finally {
      setBusy(false)
    }
  }, [client, effectiveFrom, groupId, locale, payload, year])

  if (noActiveYear) {
    return (
      <EmptyState
        title={t(locale, 'schedule.group.noActiveYear')}
        description={t(locale, 'schedule.group.noActiveYearHint')}
      />
    )
  }

  return (
    <section aria-labelledby="group-schedule-title" className="group-page">
      <PageHeader
        subtitle={t(locale, 'schedule.group.subtitle')}
        title={groupName}
        titleId="group-schedule-title"
      />

      {/* What this group IS, for a training plan: base, extra or private, and whether it
          is an invite list. Here rather than on the groups index because the manager is
          already looking at ONE group, and the eligibility checklist is about this one.
          Panelled, like every sibling section: unfenced, the page read as one loose run of
          controls (2026-08-30). */}
      <div className="group-panel">
        <GroupTrainingPanel locale={locale} groupId={groupId} />
      </div>

      {/* 2026-09-09 — the CLASS's roster, above the group's own picker, because that is the
          order the work happens in: a coach joins the class, and only then can they be put
          on one of its groups. The picker below reads this list, so the two are one screen
          rather than two places to keep in step. */}
      {klass ? (
        <div className="group-panel">
          <ClassCoachPanel
            classId={klass.id}
            className={klass.name}
            locale={locale}
            onChanged={() => setRosterVersion((n) => n + 1)}
          />
        </div>
      ) : null}

      {/* F4.1 — coach assignment lives on the group page; the staff screen's uncovered
          alert links here.

          Merged 2026-09-10: main's BEHAVIOUR, this branch's LOOK. Both panels arrived from
          main wrapped in `<Card>`, which this page no longer imports — the redesign gave
          every section on it the same `.group-panel` fence, and two of eight in a different
          shell would read as two different kinds of thing. The props are main's and are not
          decoration: `classId` and `rosterVersion` are what make the group's picker read
          the class's roster live. */}
      <div className="group-panel">
        <GroupCoachPanel
          classId={klass?.id}
          groupId={groupId}
          locale={locale}
          rosterVersion={rosterVersion}
        />
      </div>

      <section aria-labelledby="rules-title" className="group-panel">
        <h3 className="group-panel__title" id="rules-title">
          {t(locale, 'schedule.rules.title')}
        </h3>
        {loaded && rules.length === 0 ? (
          <p className="group-panel__note">{t(locale, 'schedule.rules.empty')}</p>
        ) : null}

        <div data-testid="weekly-rules">
          {rules.map((rule, index) => (
            <div className="rule-row" data-testid="rule-row" key={rule.id ?? `new-${index}`}>
              <label className="group-field">
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
              <label className="group-field">
                {t(locale, 'schedule.rules.startTime')}
                <input
                  type="time"
                  data-testid="start-time"
                  value={toInput(rule.start_time)}
                  onChange={(event) => updateRule(index, { start_time: event.target.value })}
                />
              </label>
              <label className="group-field">
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

        <div className="group-panel__actions">
          <Button
            variant="secondary"
            data-testid="add-rule"
            onClick={() => setRules((current) => [...current, blankRule(groupId, effectiveFrom)])}
          >
            {t(locale, 'schedule.rules.add')}
          </Button>

          <label className="group-field">
            {t(locale, 'schedule.group.changeFrom')}
            <input
              type="date"
              data-testid="effective-from"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </label>

          <Button data-testid="save-rules" disabled={busy} onClick={() => void requestPreview()}>
            {t(locale, 'schedule.group.reviewChange')}
          </Button>
        </div>

        {error ? (
          <p className="group-panel__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="sessions-title" className="group-panel">
        <h3 className="group-panel__title" id="sessions-title">
          {t(locale, 'schedule.group.sessions')}
        </h3>
        {/* A season is ~100 rows per group; unscrolled they made this page a kilometre
            long and buried the schedule editor above them (2026-08-30). */}
        <ul aria-label={t(locale, 'schedule.group.sessions')} className="group-sessions">
          {sessions.map((session) => (
            <li className="session-row" data-testid="session-row" key={session.id}>
              <span className="session-row__when">
                {formatDateInStudioZone(session.starts_at, locale)}
              </span>
              <span className="session-row__time" data-testid="session-time" dir="ltr">
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
                <span className="session-row__note">{t(locale, 'schedule.session.adHoc')}</span>
              ) : session.is_manually_edited ? (
                <span className="session-row__note">
                  {t(locale, 'schedule.session.manuallyEdited')}
                </span>
              ) : null}
              {session.cancel_reason ? (
                <span className="session-row__note">
                  {cancelReasonLabel(locale, session.cancel_reason)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
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
