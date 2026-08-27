// `9c`/`2d` behind `#/students/<id>` (S2/S3) — the card opened from a roster row's
// info control and from the student list. `StudentCardScreen` composes the slot
// sections; `StaffStudentCard` registers into it, so routing this reaches both of the
// audit's orphans with one route.
import { useEffect, useState } from 'react'
import { LoadFailed } from '@studio/ui'
import { useNetworkMode } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { StudentCardScreen } from '../attendance/StudentCardScreen'
import type { StaffAttendanceClient } from '../attendance/client'
import type { StaffPeopleClient, StudentDetail } from './peopleClient'

export function StudentCardRoute({
  studentId,
  locale,
  peopleClient,
  attendanceClient,
}: {
  studentId: string
  locale: Locale
  peopleClient: StaffPeopleClient
  attendanceClient: StaffAttendanceClient
}) {
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void peopleClient
      .student(studentId)
      .then((detail) => live && setStudent(detail))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [peopleClient, studentId, attempt])

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
  if (student === null) {
    return <p data-testid="student-card-loading">{t(locale, 'common.setup.loading')}</p>
  }
  return (
    <StudentCardScreen
      client={attendanceClient}
      locale={locale}
      student={{ id: student.id, first_name: student.first_name, last_name: student.last_name }}
    />
  )
}
