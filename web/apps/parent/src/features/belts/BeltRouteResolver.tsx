// P7 — the single-segment belt link, resolved or refused, NEVER falling through to
// home in silence. A guardian following an older or shared `#/belts/<studentId>` link:
// if the child has belt history, the latest award names its class and the hash is
// completed to the two-segment form; if not, the screen says so and offers a way
// forward. The decision (recorded in the parent log): resolve through the child's own
// belt history rather than through the club's class list, because the award rows are a
// read the guardian already has and they answer "which ladder" exactly.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import { EmptyState, LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeParentBeltsClient } from './client'

export function BeltRouteResolver({ studentId, locale }: { studentId: string; locale: Locale }) {
  const client = useMemo(() => makeParentBeltsClient(apiFetch), [])
  const [state, setState] = useState<'resolving' | 'none' | 'failed'>('resolving')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    if (!studentId) return
    client
      .studentBelts(studentId)
      .then((page) => {
        if (!live) return
        const latest = [...page.items].sort((a, b) => (a.awarded_on < b.awarded_on ? 1 : -1))[0]
        if (latest) {
          globalThis.location.hash = `#/belts/${studentId}/${latest.class_id}`
          return
        }
        setState('none')
      })
      .catch(() => live && setState('failed'))
    return () => {
      live = false
    }
  }, [client, studentId, attempt])

  // `#/belts/` with no segments refuses the same visible way — derived, not set in an
  // effect.
  if (!studentId || state === 'none') {
    return (
      <EmptyState
        title={t(locale, 'events.belt.noneYet')}
        description={t(locale, 'events.belt.noneYetHint')}
        action={<a href="#/">{t(locale, 'common.home.title')}</a>}
      />
    )
  }
  if (state === 'failed') {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setState('resolving')
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  return <p data-testid="belt-resolving">{t(locale, 'common.setup.loading')}</p>
}
