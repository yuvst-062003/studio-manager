import { useState } from 'react'
import { t } from '@studio/i18n'
import { Button } from '../primitives/Button'
import { getDevNow, setDevNow } from './api'
import type { DevToolProps } from './tools'

/**
 * §19.5 — "Time travel. An X-Dev-Now header shifts the server's clock for that request
 * only, in non-production. This is the only practical way to test the billing run, the
 * debt escalation ladder (day 3 / 7 / 14), health reminders (day 1 / 3 / 7) and trial
 * follow-ups without waiting a fortnight."
 *
 * The current position is displayed rather than implied. A shift that silently failed
 * to apply looks exactly like no shift, and you would spend the afternoon debugging the
 * billing run instead of the header.
 */
export function TimeTravelTool({ locale }: DevToolProps) {
  const [at, setAt] = useState<string | null>(getDevNow())

  const move = (months: number) => {
    const base = at ? new Date(at) : new Date()
    base.setMonth(base.getMonth() + months)
    const iso = base.toISOString()
    setDevNow(iso)
    setAt(iso)
  }

  const reset = () => {
    setDevNow(null)
    setAt(null)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <Button onClick={() => move(1)} variant="ghost">
        {t(locale, 'common.dev.timeTravel.plusMonth')}
      </Button>
      {at ? (
        <>
          <span data-testid="dev-now">{at.slice(0, 10)}</span>
          <Button onClick={reset} variant="ghost">
            {t(locale, 'common.dev.timeTravel.now')}
          </Button>
        </>
      ) : null}
    </span>
  )
}
