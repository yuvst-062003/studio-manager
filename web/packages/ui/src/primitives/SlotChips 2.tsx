// Landing L2 — a WRAPPING, single-select chip group.
//
// `SegmentedControl` renders one non-wrapping track and cannot serve 13a's slot picker: a
// month of trial slots is a dozen chips, and a track that clips them hides bookable weeks.
// Same accessibility shape as the segmented control — a fieldset of real radio inputs, so
// arrow keys, a single tab stop and form semantics come from the platform — with two chip
// states the picker needs:
//
//   selectable — the ordinary chip
//   disabled   — §5.4: "the picker greys out a slot rather than hiding it, so a parent
//                can see the class exists and pick a different week instead of concluding
//                there is nothing." A disabled radio is skipped by keyboard and reported
//                by assistive tech, which is exactly the drawn behaviour.
import { useId } from 'react'

export type SlotChipOption = {
  id: string
  label: string
  /** Rendered greyed and unselectable, never hidden. */
  disabled?: boolean
}

export function SlotChips({
  legend,
  options,
  value,
  onValueChange,
}: {
  /** Names the group for assistive tech; rendered visually hidden like the segmented control. */
  legend: string
  options: readonly SlotChipOption[]
  value: string | null
  onValueChange: (id: string) => void
}) {
  const name = useId()
  return (
    <fieldset className="studio-slot-chips" data-testid="slot-chips">
      <legend className="studio-slot-chips__legend">{legend}</legend>
      <div className="studio-slot-chips__row">
        {options.map((option) => {
          const inputId = `${name}-${option.id}`
          return (
            <span
              key={option.id}
              className="studio-slot-chips__chip"
              data-option-id={option.id}
              data-selected={value === option.id ? 'true' : undefined}
              data-disabled={option.disabled ? 'true' : undefined}
            >
              <input
                checked={value === option.id}
                className="studio-slot-chips__input"
                disabled={option.disabled}
                id={inputId}
                name={name}
                onChange={() => onValueChange(option.id)}
                type="radio"
              />
              <label className="studio-slot-chips__label" htmlFor={inputId}>
                {option.label}
              </label>
            </span>
          )
        })}
      </div>
    </fieldset>
  )
}
