// The plan badge's data, read once and shared by every screen that draws one.
//
// Three screens show it — the students list, a student's own screen, and the attendance
// roster a manager marks from — and all three need the same two reads: which plan each
// student is on, and how many sessions a week that plan covers. A hook rather than three
// copies, because the SECOND read is the part that is easy to get wrong: the plan map
// gives ids, and an id is not a frequency.
import { useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'

/** `undefined` = no plan set; `null` = an open membership; a number = sessions a week. */
export type PlanFrequencies = Record<string, number | null | undefined>

export type PlanBadgeData = {
  /** Keyed by student id. A student with no plan is simply absent from the map. */
  frequencies: PlanFrequencies
  /** Plan NAME by student id, for a screen with room for one. Absent means no plan. */
  names: Record<string, string>
  /** True until both reads finish. The badge draws nothing rather than a wrong answer. */
  loading: boolean
}

/**
 * Plan frequency per student, for a manager.
 *
 * **Both endpoints are manager-only, and that is the point.** `price_plan_id` is what
 * invariant 3's detector reads as a financial field, so it cannot travel on `GET /students`
 * — which is coach-tagged — and `/students/price-plans` exists precisely to carry it on a
 * route no coach can reach. Callers must not mount this for a coach; the attendance roster
 * gates it on the same permission that shows money anywhere else.
 *
 * A failed read leaves the map empty and `loading` false, so every badge renders as "no
 * plan" rather than as a spinner that never resolves. That is the wrong answer for a
 * student who does have a plan — which is why the caller is told to gate on `enabled`
 * instead of relying on this to fail quietly.
 */
export function usePlanBadges(enabled = true): PlanBadgeData {
  // One piece of state, null until the reads settle. `loading` is DERIVED from it rather
  // than held separately: a second `setLoading(false)` in the disabled branch would be a
  // synchronous setState inside an effect, which cascades a render for a value that was
  // knowable without one.
  const [resolved, setResolved] = useState<{
    frequencies: PlanFrequencies
    names: Record<string, string>
  } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    void (async () => {
      try {
        const [plansResponse, studentsResponse] = await Promise.all([
          apiFetch('/api/v1/price-plans?limit=200'),
          apiFetch('/api/v1/students/price-plans'),
        ])
        if (!plansResponse.ok || !studentsResponse.ok) throw new Error('read failed')
        const plans = (await plansResponse.json()) as {
          items: { id: string; name: string; sessions_per_week: number | null }[]
        }
        const students = (await studentsResponse.json()) as {
          items: { student_id: string; price_plan_id: string | null }[]
        }
        // id → frequency, so the student map can be turned into something drawable.
        const byPlan = new Map(plans.items.map((plan) => [plan.id, plan]))
        const next: PlanFrequencies = {}
        const nextNames: Record<string, string> = {}
        for (const row of students.items) {
          if (row.price_plan_id === null) continue
          // A plan id the price-plans read did not return — a closed plan, or a page
          // boundary. Left out, so the badge says "no plan" rather than inventing a count.
          const plan = byPlan.get(row.price_plan_id)
          if (!plan) continue
          next[row.student_id] = plan.sessions_per_week
          nextNames[row.student_id] = plan.name
        }
        if (alive) setResolved({ frequencies: next, names: nextNames })
      } catch {
        // A manager who cannot read plans still gets the roster. The badge is a hint on a
        // row, never the reason the row is there.
        if (alive) setResolved({ frequencies: {}, names: {} })
      }
    })()
    return () => {
      alive = false
    }
  }, [enabled])

  return {
    frequencies: resolved?.frequencies ?? {},
    names: resolved?.names ?? {},
    loading: enabled && resolved === null,
  }
}
