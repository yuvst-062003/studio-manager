import { useId } from 'react'
import { useTheme } from '../ThemeProvider'
import type { ResolvedTheme, ThemePreference } from '../theme'

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'] as const

/**
 * D4 — Light · Dark · System, user-settable, on every app. "System" follows the OS, which
 * both iOS and Android already schedule by hour; duplicating that scheduler would also
 * override someone who deliberately runs their phone dark all day.
 *
 * Native radios rather than buttons with aria-checked: arrow-key navigation, the roving
 * tab stop and the group semantics come free, and the three options are exclusive.
 *
 * The visible state label reports the RESOLVED theme, not the preference. Artboard 4h
 * captions its toggle card "תמיד עם תווית מצב", and 2e and 3f repeat it — it came from an
 * Arbox reviewer who could not tell whether a toggle was on. "System" selected leaves
 * exactly that ambiguity, so the resolved value is the thing worth showing.
 */
export function ThemeControl({
  legend,
  labels,
  stateLabels,
}: {
  legend: string
  labels: Record<ThemePreference, string>
  stateLabels: Record<ResolvedTheme, string>
}) {
  const { preference, resolved, setPreference } = useTheme()
  const name = useId()

  return (
    // role="radiogroup" is explicit: a bare <fieldset> maps to ARIA `group`, not
    // `radiogroup`, so assistive tech would not announce "1 of 3". The <legend> still
    // supplies the accessible name.
    <fieldset className="studio-theme-control" role="radiogroup">
      <legend className="studio-theme-control__legend">{legend}</legend>
      <div className="studio-theme-control__options">
        {PREFERENCES.map((p) => (
          <label className="studio-theme-control__option" data-selected={preference === p} key={p}>
            <input
              checked={preference === p}
              className="studio-theme-control__input"
              name={name}
              onChange={() => setPreference(p)}
              type="radio"
              value={p}
            />
            <span>{labels[p]}</span>
          </label>
        ))}
      </div>
      <p className="studio-theme-control__state">{stateLabels[resolved]}</p>
    </fieldset>
  )
}
