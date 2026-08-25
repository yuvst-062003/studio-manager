import { useState } from 'react'
import { t } from '@studio/i18n'
import { Button } from '../primitives/Button'
import { resetDemoStudio } from './api'
import type { DevToolProps } from './tools'

/**
 * §19.4 — "[↺ reset demo data]". Calls `POST /api/v1/dev/demo/reset`
 * (app/routers/dev.py, §19.7) and reports what came back — the same reason
 * TimeTravelTool shows where the clock landed: a reset that silently failed to run
 * looks identical to one that worked, and you would spend the afternoon staring at
 * stale demo data wondering why your fixture never applied.
 */
export function ResetDemoTool({ locale }: DevToolProps) {
  const [status, setStatus] = useState<string | null>(null)

  const reset = async () => {
    setStatus(null)
    const response = await resetDemoStudio()
    setStatus(String(response.status))
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <Button onClick={reset} variant="secondary">
        {t(locale, 'common.dev.tool.resetDemo')}
      </Button>
      {status ? <span data-testid="reset-demo-result">{status}</span> : null}
    </span>
  )
}
