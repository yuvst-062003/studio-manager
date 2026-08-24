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
  value,
  options,
  onValueChange,
}: {
  legend: string
  value: string
  options: readonly { value: string; label: string }[]
  onValueChange: (next: string) => void
}) {
  const name = useId()
  return (
    <fieldset className="studio-segmented" role="radiogroup">
      <legend className="studio-segmented__legend">{legend}</legend>
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
