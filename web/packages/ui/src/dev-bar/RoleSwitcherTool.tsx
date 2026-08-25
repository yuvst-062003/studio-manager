// §19.4's persona switcher. Holdback 4, frontend half.
//
// Registered into the 'dev-bar' slot by ./devTools.ts. **The container is not reopened** —
// DevBar.tsx already renders whatever the slot holds, which is the whole point of the
// registry M0.2 landed and the mechanism the milestone plan names for this task.
//
// No stylesheet, deliberately. DevBar.tsx's own header explains why: a CSS file imported
// by a module rollup drops is still EMITTED into the production stylesheet, so a dev-bar
// stylesheet would ship dev-only rules to every user — exactly the "hidden, not absent"
// outcome §19.4 refuses. Inline style objects over M0.3's tokens instead.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import { Alert } from '../primitives/Alert'
import { actAs, listPersonas } from './api'
import type { DevPersona } from './api'
import type { DevToolProps } from './tools'

/**
 * What to do with the new access token. Defaulted rather than required so the tool can be
 * registered from `devTools.ts` with no wiring, and overridden in tests.
 *
 * §19.4 mints a NEW token rather than mutating the caller's, so a client that dropped it
 * on the floor would keep acting as whoever it was before — which looks exactly like the
 * switch not working.
 */
export type RoleSwitcherProps = DevToolProps & {
  onSwitched?: (accessToken: string, personaLabel: string) => void
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
}

const labelStyle: CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: 'var(--text-muted)',
}

/**
 * The event the default handler dispatches. `@studio/core`'s session listens for it and
 * replaces the access token it holds.
 *
 * An event rather than a direct call, because the slot contract passes tools only
 * `{ locale }` (see `DevToolProps`) — there is no seam through which the app could hand
 * this tool a callback. Importing `@studio/core` from `@studio/ui` would work and is the
 * wrong shape: `core` does not depend on `ui`, and a dev tool is the last thing that
 * should reverse that.
 */
export const ACT_AS_EVENT = 'studio:dev-act-as'

export type ActAsEventDetail = { accessToken: string; personaLabel: string }

function defaultOnSwitched(accessToken: string, personaLabel: string): void {
  globalThis.dispatchEvent?.(
    new CustomEvent<ActAsEventDetail>(ACT_AS_EVENT, {
      detail: { accessToken, personaLabel },
    }),
  )
}

export function RoleSwitcherTool({ locale, onSwitched = defaultOnSwitched }: RoleSwitcherProps) {
  const [personas, setPersonas] = useState<DevPersona[]>([])
  const [note, setNote] = useState('')
  const [active, setActive] = useState('')

  useEffect(() => {
    let cancelled = false
    listPersonas()
      .then((list) => {
        if (cancelled) return
        setPersonas(list.items)
        setNote(list.no_student_persona_note)
      })
      // A dev tool that throws would take the bar down with it, and the bar is what a
      // developer is using to diagnose whatever else is wrong.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  async function choose(personId: string) {
    if (!personId) return
    setActive(personId)
    const result = await actAs(personId)
    onSwitched(result.access_token, result.persona_label)
  }

  return (
    <span style={wrapStyle}>
      <label style={labelStyle} htmlFor="dev-persona">
        {t(locale, 'common.dev.persona.label')}
      </label>
      <select
        id="dev-persona"
        value={active}
        onChange={(event) => void choose(event.target.value)}
      >
        <option value="">{t(locale, 'common.dev.persona.placeholder')}</option>
        {personas.map((persona) => (
          <option key={persona.person_id} value={persona.person_id} title={persona.tests}>
            {persona.key
              ? t(locale, `common.dev.persona.${persona.key}`)
              : persona.label}
          </option>
        ))}
      </select>
      {/* §19.3 — 'the dev bar says so explicitly, so the gap is visible rather than
          confusing.' The wording comes from the server so the two cannot drift. */}
      {note ? (
        <Alert iconLabel={t(locale, 'common.dev.noticeIcon')} tone="pending">
          {note}
        </Alert>
      ) : null}
    </span>
  )
}
