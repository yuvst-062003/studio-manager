// current → next, as two BeltBars and a direction-aware arrow.
//
// **Three artboards want this** — 9d's candidate rows, 4d's transition column and 12d's
// history rows — so it is one component, which is what 4d finding 8 asks for.
//
// **A missing next rank renders ONE swatch and no arrow.** That is the best thing on 9d:
// the fail row's belt visual is structurally different rather than annotated, so "no
// change" is shown instead of said. The same shape serves a candidate at the top of the
// ladder, who has nothing to be promoted to.
//
// The arrow is a CHARACTER, not an icon path. 12d's audit is explicit: `→` is bidi-mirrored
// by the text engine, so it points from-to correctly in both `he` and `en` with no logic. A
// coordinate-baked SVG would be right in RTL and backwards in LTR — which is exactly the
// class of bug the canvas's hard-coded chevrons carry.
import type { CSSProperties } from 'react'
import { BeltBar } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { BeltRankOut } from './client'

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-2)',
}

const nameStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
}

export function BeltTransition({
  current,
  next,
  locale,
}: {
  current: BeltRankOut | null
  next: BeltRankOut | null
  locale: Locale
}) {
  return (
    <span style={rowStyle}>
      {current ? (
        <>
          <BeltBar
            colorHex={current.color_hex}
            label={current.name}
            secondaryColorHex={current.secondary_color_hex ?? undefined}
          />
          <span style={nameStyle}>{current.name}</span>
        </>
      ) : (
        <span style={nameStyle}>{t(locale, 'events.belt.none')}</span>
      )}

      {next ? (
        <>
          <span aria-hidden="true">→</span>
          <BeltBar
            colorHex={next.color_hex}
            label={next.name}
            secondaryColorHex={next.secondary_color_hex ?? undefined}
          />
          <span style={nameStyle}>{next.name}</span>
        </>
      ) : null}
    </span>
  )
}
