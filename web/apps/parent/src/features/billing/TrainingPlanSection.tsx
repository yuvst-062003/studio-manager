// The container for the plan screen. Same split as `PaymentsSection`: the screen is
// presentational and takes its data as a prop, so a test renders it without a server.
//
// **Per CHILD.** A family with two children has two plans, two allowances and two upgrade
// decisions — the screen answers for one of them, and the hash says which. A single screen
// summing both would be a screen that cannot mark anything, because a booking names a
// student.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { TrainingPlanScreen } from './TrainingPlanScreen'
import { makeTrainingPlanClient } from './trainingPlanClient'
import type { TrainingPlanView } from './trainingPlanClient'

export function TrainingPlanSection({
  locale,
  studentId,
}: {
  locale: Locale
  studentId: string
}) {
  const client = useMemo(() => makeTrainingPlanClient(apiFetch), [])
  const [view, setView] = useState<TrainingPlanView | null>(null)
  // Bumped after every write. A counter rather than calling the loader directly, so there
  // is exactly one place that writes `view` — the same reason `PaymentsSection` does it.
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    client
      .read(studentId)
      .then((next) => alive && setView(next))
      .catch(() => alive && setView(null))
    return () => {
      alive = false
    }
  }, [client, studentId, reloads])

  const refresh = useCallback(() => setReloads((n) => n + 1), [])

  if (view === null) return null

  return (
    <TrainingPlanScreen
      locale={locale}
      view={view}
      // Re-read after every write rather than patching the view in place: the allowance,
      // the offer list and the reasons are all derived from the same server state, and a
      // client that recomputed them would be a second implementation of §5.1.
      onMark={async (sessionId) => {
        await client.mark(studentId, sessionId)
        refresh()
      }}
      onRelease={async (bookingId) => {
        await client.release(bookingId)
        refresh()
      }}
      onRequestPlan={async (planId) => {
        await client.requestPlan(studentId, planId)
        refresh()
      }}
      onCancelChange={async (changeId) => {
        await client.cancelChange(studentId, changeId)
        refresh()
      }}
    />
  )
}
