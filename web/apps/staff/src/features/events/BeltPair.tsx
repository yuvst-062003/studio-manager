// current → next, for the staff app.
//
// The dashboard has its own `BeltTransition`; this is the same idea in the app that cannot
// import from it — `web/apps/*` are three separate Vite apps and nothing crosses between
// them. **The duplication is real and is reported**: 4d finding 8 asks for one
// `BeltTransition`, and the only place it could live once and serve all three is
// `@studio/ui`, which is not this lane's to add a component to.
//
// A missing `next` renders ONE swatch and no arrow. On 9d that is a fail — the belt does
// not change — and it is the artboard's best idea: structurally different rather than
// annotated, so "no change" is shown instead of said.
import type { CSSProperties } from 'react'
import { BeltBar } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { CandidateOut } from './client'

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-2)',
  marginInlineStart: 'auto',
}

const nameStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
}

export function BeltPair({
  current,
  next,
  locale,
}: {
  current: CandidateOut['current_rank']
  next: CandidateOut['next_rank']
  locale: Locale
}) {
  return (
    <span style={rowStyle}>
      {current ? (
        <BeltBar
          colorHex={current.color_hex}
          label={current.name}
          secondaryColorHex={current.secondary_color_hex ?? undefined}
        />
      ) : (
        <span style={nameStyle}>{t(locale, 'events.belt.none')}</span>
      )}
      {next ? (
        <>
          {/* A character, not an icon path: `→` is bidi-mirrored by the text engine, so it
              reads from-to correctly in he and en with no direction logic. */}
          <span aria-hidden="true">→</span>
          <BeltBar
            colorHex={next.color_hex}
            label={next.name}
            secondaryColorHex={next.secondary_color_hex ?? undefined}
          />
        </>
      ) : null}
    </span>
  )
}
