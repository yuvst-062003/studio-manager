// §5.2 — 'A person belonging to more than one studio gets a studio switcher; otherwise it
// is hidden.'
//
// Hidden by COUNTING, not by a flag from the server. The API sends no `show_switcher`
// boolean because that would be the same fact stated twice, and two statements of one
// fact can disagree.
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type SwitchableStudio = {
  studioId: string
  studioName: string
  studioIsDemo: boolean
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
}

const labelStyle: CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: 'var(--text-muted)',
}

export function StudioSwitcher({
  studios,
  activeStudioId,
  onSwitch,
  locale,
}: {
  studios: SwitchableStudio[]
  activeStudioId: string | null
  onSwitch: (studioId: string) => void
  locale: Locale
}) {
  // One studio is not a choice, and a disabled select that shows the only option is
  // clutter on a phone screen §6.2 says is used one-handed on a mat.
  if (studios.length < 2) return null

  return (
    <div style={wrapStyle}>
      <label htmlFor="studio-switcher" style={labelStyle}>
        {t(locale, 'common.nav.studioSwitcher')}
      </label>
      <select
        id="studio-switcher"
        value={activeStudioId ?? ''}
        onChange={(event) => onSwitch(event.target.value)}
      >
        {studios.map((studio) => (
          <option key={studio.studioId} value={studio.studioId}>
            {/* §19.1 — the demo studio exists in production so a live deploy can be
                smoke-tested. Marking it here is what stops someone believing they are
                looking at a real club's numbers. */}
            {studio.studioIsDemo
              ? `${studio.studioName} · ${t(locale, 'common.nav.demoStudio')}`
              : studio.studioName}
          </option>
        ))}
      </select>
    </div>
  )
}
