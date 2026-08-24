import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

/**
 * Artboard 4h, card מתגים ובחירה. A native input: accessible, keyboard-operable and
 * form-associated already. Reimplementing it with role="checkbox" would be strictly worse.
 */
export function Checkbox({
  label,
  id,
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <span className="studio-choice">
      <input className="studio-choice__input" id={inputId} type="checkbox" {...rest} />
      <label className="studio-choice__label" htmlFor={inputId}>
        {label}
      </label>
    </span>
  )
}
