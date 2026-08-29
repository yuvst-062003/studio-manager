import { useId } from 'react'

/**
 * Artboard 4h's שבוע / חודש switcher, generalised: D5 specifies three calendar views —
 * day, week and month — so this takes an options list rather than a pair.
 *
 * 4h's own wrapper carries `margin-right: 8px`, the single physical CSS declaration in
 * that artboard. It is deliberately not reproduced: spacing from a neighbour is the
 * caller's `gap`, which is flow-relative (D10, SPEC §9).
 *
 * role="radiogroup" is explicit — a bare <fieldset> maps to ARIA `group`, so assistive
 * tech would not announce "1 of 3".
 */
export function SegmentedControl({
  legend,
  legendVisible = false,
  value,
  options,
  onValueChange,
}: {
  legend: string
  /**
   * Show the legend on screen as well as to assistive tech.
   *
   * Off by default, because 4h's switcher names itself — the options ARE the label, and a
   * visible "תצוגה" above `שבוע | חודש` is noise. Turn it on wherever the options do NOT
   * name the control: the payments screen stacks a months picker and an instalments picker
   * that both render as `[1] [2] [3]`, and with the legend hidden a sighted parent saw two
   * identical rows with nothing to tell them apart, while a screen-reader user got the
   * distinction the markup had all along.
   */
  legendVisible?: boolean
  value: string
  options: readonly { value: string; label: string }[]
  onValueChange: (next: string) => void
}) {
  const name = useId()
  return (
    <fieldset className="studio-segmented" role="radiogroup">
      <legend className="studio-segmented__legend" data-visible={String(legendVisible)}>
        {legend}
      </legend>
      <div className="studio-segmented__track">
        {options.map((option) => (
          <label
            className="studio-segmented__option"
            data-selected={option.value === value}
            key={option.value}
          >
            <input
              checked={option.value === value}
              className="studio-segmented__input"
              name={name}
              onChange={() => onValueChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
