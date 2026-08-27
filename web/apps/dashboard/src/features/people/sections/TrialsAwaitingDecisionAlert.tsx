// §5.4a ⑤ — the trials that have happened and still need a manager's decision.
//
// `attended === true` AND `outcome === 'pending'`. A booking with `attended === null` is
// deliberately excluded: the lesson has not happened, so there is nothing to decide, and
// listing it here would put a decision in front of somebody who cannot make it yet.
//
// F2 wired the two buttons: each expands into the decision it opens — convert wants the
// group (§5.4a step 5: "picks group … three decisions in one request, because they are
// one decision"), lost wants the reason — and the second press is the confirmation step.
import { useEffect, useState } from 'react'
import { Button, EmptyState } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { AlertSectionProps } from '../AlertCentre'
import type { GroupOption, TrialBookingRow } from '../peopleClient'

export function TrialsAwaitingDecisionAlert({ locale, client }: AlertSectionProps) {
  const [rows, setRows] = useState<TrialBookingRow[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [deciding, setDeciding] = useState<{ studentId: string; kind: 'convert' | 'lost' } | null>(null)
  const [group, setGroup] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    client
      .trialBookings('pending')
      .then((body) => live && setRows(body.items.filter((row) => row.attended === true)))
      .catch(() => live && setRows([]))
    client
      .groups()
      .then((body) => live && setGroups(body.items))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, version])

  const settle = (work: Promise<unknown>) => {
    setBusy(true)
    void work
      .then(() => {
        setDeciding(null)
        setGroup('')
        setReason('')
        setVersion((n) => n + 1)
      })
      .finally(() => setBusy(false))
  }

  return (
    <section aria-labelledby="alert-decisions" data-testid="alert-trials-awaiting">
      <h2 id="alert-decisions">{t(locale, 'people.alerts.trialsAwaitingDecision')}</h2>
      {rows.length === 0 ? (
        <EmptyState title={t(locale, 'people.trial.outcome.pending')} />
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id} data-testid="alert-decision-row">
              <bdi>{row.student_display_name}</bdi>
              <span>{formatDateInStudioZone(row.booked_at, locale)}</span>
              {/* §5.4a ⑤ — two outcomes, and `lost` is a real one rather than an absence.
                  Both are offered, because a queue with only the happy path is a queue that
                  never empties. */}
              <Button
                data-testid={`alert-convert-${row.student_id}`}
                onClick={() => setDeciding({ studentId: row.student_id, kind: 'convert' })}
              >
                {t(locale, 'people.trial.convert')}
              </Button>
              <Button
                variant="ghost"
                data-testid={`alert-lost-${row.student_id}`}
                onClick={() => setDeciding({ studentId: row.student_id, kind: 'lost' })}
              >
                {t(locale, 'people.convert.markLost')}
              </Button>
              {deciding?.studentId === row.student_id && deciding.kind === 'convert' ? (
                <span>
                  <label>
                    {t(locale, 'people.convert.group')}
                    <select
                      data-testid={`alert-convert-group-${row.student_id}`}
                      onChange={(event) => setGroup(event.target.value)}
                      value={group}
                    >
                      <option value="">—</option>
                      {groups.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    data-testid={`alert-convert-submit-${row.student_id}`}
                    disabled={!group || busy}
                    onClick={() =>
                      settle(
                        client.convert(row.student_id, {
                          group_id: group,
                          started_on: new Date().toISOString().slice(0, 10),
                        }),
                      )
                    }
                  >
                    {t(locale, 'people.convert.submit')}
                  </Button>
                </span>
              ) : null}
              {deciding?.studentId === row.student_id && deciding.kind === 'lost' ? (
                <span>
                  <label>
                    {t(locale, 'people.convert.markLostReason')}
                    <input
                      data-testid={`alert-lost-reason-${row.student_id}`}
                      onChange={(event) => setReason(event.target.value)}
                      value={reason}
                    />
                  </label>
                  <Button
                    data-testid={`alert-lost-submit-${row.student_id}`}
                    disabled={!reason.trim() || busy}
                    onClick={() => settle(client.markLost(row.student_id, reason.trim()))}
                    variant="destructive"
                  >
                    {t(locale, 'people.convert.markLost')}
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
