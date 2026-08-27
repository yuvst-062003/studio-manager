// `2c` behind `#/student/<id>` (P1/P2). The container existed, its sections registered,
// and no route rendered it — the composite screen the slot system was built for was
// unreachable in the running app.
import { useEffect, useState } from 'react'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { StudentCard } from './StudentCard'
import type { EnrollmentOut, GuardianOut, PeopleClient, StudentSummary } from './peopleClient'

export function StudentCardSection({
  client,
  locale,
  studentId,
}: {
  client: PeopleClient
  locale: Locale
  studentId: string
}) {
  const [data, setData] = useState<{
    student: StudentSummary | null
    enrollments: EnrollmentOut[]
    guardians: GuardianOut[]
  } | null>(null)
  const [failed, setFailed] = useState(false)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    // The children are the screen; the other two reads are enrichment. Best-effort,
    // because a 403 on a side read must not turn the whole card into an error.
    void Promise.all([
      client.myStudents(),
      client.myGuardians().catch(() => ({ items: [] as GuardianOut[] })),
      client.enrollments(studentId).catch(() => [] as EnrollmentOut[]),
    ])
      .then(([students, guardians, enrollments]) => {
        if (!live) return
        setData({
          student: students.items.find((row) => row.id === studentId) ?? null,
          enrollments,
          guardians: guardians.items,
        })
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, studentId, attempt])

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
  if (data === null) return <p data-testid="student-card-loading">{t(locale, 'common.setup.loading')}</p>
  if (data.student === null) {
    // Not this family's child (or a stale link). The `/me` reads scope to the caller,
    // so the honest answer is "no such student here", never another family's card.
    return <p data-testid="student-card-missing">{t(locale, 'people.student.empty')}</p>
  }
  return (
    <StudentCard
      enrollments={data.enrollments}
      guardians={data.guardians}
      locale={locale}
      student={data.student}
    />
  )
}
