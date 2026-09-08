// The container behind `#/student/<id>`. Replaces `StudentCardSection.tsx`, deleted in the
// same commit.
//
// **The guardians read changed, and it is the whole reason this file is not a rename.**
// It read `GET /me/guardians`, which walks every one of the caller's children and
// deduplicates by person — so a household with two children showed an identical list on
// both cards, and a grandparent who guards only one of them appeared on the other (A3).
// It is now `GET /me/students/{id}/guardians`: one child, every guardian linked to them, no
// dedup.
//
// Filtering the old deduplicated list client-side would have been worse, not better: dedup
// keeps only the FIRST child's row for a person who guards both, so a shared parent
// filtered by `student_id` would vanish from the second child's card entirely.
import { useEffect, useState } from 'react'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { TraineeCard } from './TraineeCard'
import type { EnrollmentOut, GuardianOut, PeopleClient, StudentSummary } from '../peopleClient'

export function TraineeCardSection({
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
      client.studentGuardians(studentId).catch(() => ({ items: [] as GuardianOut[] })),
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
    <TraineeCard
      enrollments={data.enrollments}
      guardians={data.guardians}
      locale={locale}
      student={data.student}
    />
  )
}
