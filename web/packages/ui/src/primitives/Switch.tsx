/**
 * Artboard 4h, card מתגים ובחירה — captioned "תמיד עם תווית מצב".
 *
 * `stateLabels` is REQUIRED. 2e and 3f both repeat "לכל מתג יש תווית מצב", and it came
 * from an Arbox reviewer who could not tell whether a toggle was on (research/02). An
 * optional prop is a rule that gets broken; a required one cannot be.
 *
 * A button with role="switch" because there is no native element for one. Space and Enter
 * come free from the button; aria-checked carries the state to a screen reader, and the
 * visible label carries it to everyone else.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  stateLabels,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  label: string
  stateLabels: { on: string; off: string }
  disabled?: boolean
}) {
  return (
    <span className="studio-switch">
      <button
        aria-checked={checked}
        className="studio-switch__track"
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        role="switch"
        type="button"
      >
        <span className="studio-switch__label">{label}</span>
        <span aria-hidden="true" className="studio-switch__knob" />
      </button>
      <span className="studio-switch__state" data-on={checked}>
        {checked ? stateLabels.on : stateLabels.off}
      </span>
    </span>
  )
}
