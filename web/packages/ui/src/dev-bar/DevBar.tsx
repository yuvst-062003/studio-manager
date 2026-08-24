import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Alert } from '../primitives/Alert'
import { StatusChip } from '../primitives/StatusChip'
import { useSlot } from '../slots'
import { PENDING_TOOLS } from './tools'
import type { DevToolKey, DevToolProps } from './tools'

/**
 * §19.4 — the dev bar. "Rendered only when the authenticated identity has
 * is_developer. Never shipped to anyone else — the component is tree-shaken out of
 * production client bundles by an env flag, so it is not merely hidden."
 *
 * The tree-shaking is `./index.ts`'s job (Task 17); this file is the bar itself and is
 * imported only from there (and from its own tests, which must import it DIRECTLY —
 * under vitest the flag is unset, so the switched export is the absent one).
 *
 * **No stylesheet, on purpose.** Verified in M0.4: a CSS file imported by a module
 * rollup drops is still EMITTED into the production stylesheet. A dev-bar stylesheet
 * would ship dev-only rules to every user, which is exactly the "hidden, not absent"
 * outcome §19.4 refuses. Inline style objects over the M0.3 tokens instead — the
 * pattern HelloProof already uses, and the one D10's ESLint rule actually reads.
 *
 * `identity` is null until M1: it is the seam where the verified JWT arrives. Until
 * then every app passes null and the bar renders nothing, which is the correct
 * behaviour for "no developer is signed in" and not a stub.
 */
export type DevIdentity = {
  isDeveloper: boolean
  studioName: string
  /** §19.4 — the persona the API is resolving permissions from. M1 fills it. */
  actingAs?: string
}

const barStyle: CSSProperties = {
  position: 'sticky',
  insetBlockStart: 0,
  zIndex: 9999,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-3)',
  background: 'var(--surface)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
  fontSize: 'var(--text-caption)',
}

const pendingStyle: CSSProperties = {
  opacity: 0.6,
}

export function DevBar({
  identity,
  locale = 'he',
}: {
  identity: DevIdentity | null
  locale?: Locale
}) {
  const entries = useSlot<DevToolProps>('dev-bar')

  // §19.4 — rendered only for a developer identity. Before the flag exists, that is
  // every identity, which is why the apps pass null.
  if (!identity?.isDeveloper) return null

  const registered = new Set(entries.map((entry) => entry.key as DevToolKey))
  const pending = PENDING_TOOLS.filter((tool) => !registered.has(tool.key))

  return (
    <aside aria-label={t(locale, 'common.dev.title')} data-testid="studio-dev-bar" style={barStyle}>
      <StatusChip label={t(locale, 'common.dev.title')} status="pending" />
      <strong>{identity.studioName}</strong>
      <span>
        {t(locale, 'common.dev.actingAs')}:{' '}
        <bdi>{identity.actingAs ?? t(locale, 'common.dev.noPersona')}</bdi>
      </span>

      {entries.map(({ key, render: Tool }) => (
        <span data-testid={`dev-tool-${key}`} key={key}>
          <Tool locale={locale} />
        </span>
      ))}

      {pending.map((tool) => (
        <span data-testid={`dev-tool-pending-${tool.key}`} key={tool.key} style={pendingStyle}>
          {t(locale, tool.labelKey)} · {t(locale, 'common.dev.pendingIn')}
          {tool.milestone}
        </span>
      ))}

      {/* §19.3 — "the dev bar says so explicitly, so the gap is visible rather than
          confusing." */}
      <Alert iconLabel={t(locale, 'common.dev.noticeIcon')} tone="pending">
        {t(locale, 'common.dev.noStudentPersona')}
      </Alert>
    </aside>
  )
}
