// `9g` behind `#/attendance/<id>/summary` (S2). The step after taking a register — a
// coach finishing a class had nowhere to go; the register simply stayed open. This
// wrapper loads the same roster read the register makes and hands it to the
// presentational screen, which is also the app's only consumer of `usePendingCount`.
import { useEffect, useState } from 'react'
import { apiFetch, useNetworkMode } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { RosterRow as RosterRowData } from '@studio/core'
import { SessionSummary } from './SessionSummary'
import type { StaffAttendanceClient } from './client'

export function SessionSummarySection({
  sessionId,
  locale,
  client,
  personId,
}: {
  sessionId: string
  locale: Locale
  client: StaffAttendanceClient
  personId: string | null
}) {
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const [roster, setRoster] = useState<RosterRowData[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void client
      .sessionRoster(sessionId)
      .then((body) => live && setRoster(body.roster))
      // Unlike the register, this screen has no cached fallback to be honest with —
      // counts of zero would read as an empty lesson, so a failed read says so.
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, sessionId, attempt])

  if (failed) {
    return (
      <LoadFailed
        offline={networkMode !== 'online'}
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (roster === null) {
    return <p data-testid="summary-loading">{t(locale, 'common.setup.loading')}</p>
  }
  return (
    <SessionSummary
      locale={locale}
      onBackToRoster={() => {
        globalThis.location.hash = `#/attendance/${sessionId}`
      }}
      onReportInjury={async (studentId, description) => {
        // Immediate, online-only — never queued (§10.2's absence-report reasoning,
        // mirrored). A non-2xx must reject so the card can say "try again".
        const response = await apiFetch(`/api/v1/sessions/${sessionId}/injury-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: studentId, description }),
        })
        if (!response.ok) throw new Error(String(response.status))
      }}
      personId={personId}
      roster={roster}
      sessionId={sessionId}
    />
  )
}
