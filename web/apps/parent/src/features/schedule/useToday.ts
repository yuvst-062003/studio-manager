// **Duplicated per app, not shared.** `web/packages/core` is not this lane's to extend and
// a cross-app import would couple two deployables to each other. `client.ts` beside this
// file is duplicated for the same reason. Both consolidate into `@studio/core` the day
// somebody owns that package for a wave — the three copies are identical on purpose, so
// that consolidation is a move rather than a merge.
import { useEffect, useState } from 'react'
import { studioDayKey } from '@studio/core'

/**
 * The current instant, **stable for as long as the studio's day is**.
 *
 * Every screen in this vertical takes `today` as a prop rather than reading the clock, so
 * that a test can fix the date. That leaves one caller — `App.tsx` — needing to produce it,
 * and the obvious `today={new Date().toISOString()}` in a render body is a new value at
 * millisecond precision on every render. Downstream that is a dependency of several
 * effects, and `GroupsAndCycles` answers a change to it with `1 + 3N` requests, `N` of them
 * sequentially awaited previews. Not a loop — nothing here re-renders `App` — but it fires
 * on every locale switch and every navigation, which is enough.
 *
 * `useMemo(() => new Date().toISOString(), [])` fixes that and buys a different bug: a
 * dashboard left open overnight keeps yesterday's "today", so the week board's היום button
 * jumps to last week and 4b's "next session" offers a lesson that already happened.
 *
 * So: poll, and re-stamp **only when the Jerusalem calendar day actually changes**. The
 * returned value is referentially stable within a day — `setToday` returning `current`
 * unchanged makes React bail out of the re-render entirely — and changes exactly once,
 * shortly after midnight.
 *
 * A minute's granularity rather than a timer aimed at midnight: computing "milliseconds
 * until the next Jerusalem midnight" means DST arithmetic twice a year, and being up to
 * sixty seconds late to roll a dashboard over costs nothing.
 */
const CHECK_INTERVAL_MS = 60_000

export function useToday(): string {
  const [today, setToday] = useState(() => new Date().toISOString())

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().toISOString()
      setToday((current) => (studioDayKey(current) === studioDayKey(now) ? current : now))
    }, CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return today
}
