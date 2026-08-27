// `11b` behind `#/attendance/<id>/trial` (S2) — §5.4a's trial student added during a
// lesson. The group comes off the session, which is the one fact the form cannot ask a
// coach to retype mid-class.
import { useEffect, useState } from 'react'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { TrialInClass } from './TrialInClass'
import type { StaffPeopleClient } from './peopleClient'
import type { StaffAttendanceClient } from '../attendance/client'

export function TrialSection({
  sessionId,
  locale,
  client,
  attendanceClient,
  canGrantOverride = false,
}: {
  sessionId: string
  locale: Locale
  client: StaffPeopleClient
  attendanceClient: StaffAttendanceClient
  canGrantOverride?: boolean
}) {
  const [groupId, setGroupId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void attendanceClient
      .sessionRoster(sessionId)
      .then((body) => live && setGroupId(body.session.group_id))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [attendanceClient, sessionId, attempt])

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (groupId === null) return <p data-testid="trial-loading">{t(locale, 'common.setup.loading')}</p>
  return (
    <TrialInClass
      canGrantOverride={canGrantOverride}
      client={client}
      groupId={groupId}
      locale={locale}
      onLogged={() => {
        globalThis.location.hash = `#/attendance/${sessionId}`
      }}
      sessionId={sessionId}
    />
  )
}
