// `11a` behind `#/attendance/<id>/handover` (S2) — entry FROM THE SESSION, not from
// `#/cash`, which is the payment-promise queue and a different feature. The sheet wants
// the students *present in this lesson*, so this wrapper reads the same roster the
// register does and narrows it to the present marks. Ground rule 3 holds by data shape:
// `HandoutOptionOut` carries no money field, so there is no price here to hide.
import { useEffect, useState } from 'react'
import { apiFetch, useNetworkMode } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { HandOverSheet } from './HandOverSheet'
import type { PresentStudent } from './HandOverSheet'
import { makeHandoutClient } from './handoutClient'
import type { HandoutOption } from './handoutClient'
import type { StaffAttendanceClient } from '../attendance/client'

const handoutClient = makeHandoutClient(apiFetch)

export function HandOverSection({
  sessionId,
  locale,
  attendanceClient,
}: {
  sessionId: string
  locale: Locale
  attendanceClient: StaffAttendanceClient
}) {
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const [data, setData] = useState<{
    options: HandoutOption[]
    present: PresentStudent[]
  } | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void Promise.all([handoutClient.options(), attendanceClient.sessionRoster(sessionId)])
      .then(([options, body]) => {
        if (!live) return
        setData({
          options,
          present: body.roster
            .filter((row) => row.status === 'present')
            .map((row) => ({ id: row.student_id, displayName: row.display_name })),
        })
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [attendanceClient, sessionId, attempt])

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
  if (data === null) return <p data-testid="handover-loading">{t(locale, 'common.setup.loading')}</p>
  return (
    <HandOverSheet
      client={handoutClient}
      locale={locale}
      onHandedOut={() => {}}
      options={data.options}
      presentStudents={data.present}
    />
  )
}
