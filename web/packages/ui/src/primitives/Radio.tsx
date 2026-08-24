import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

/**
 * Artboard 4h, card מתגים ובחירה. A native input, for the same reasons as Checkbox — and
 * one more: sharing a `name` gives arrow-key navigation and a single tab stop across the
 * group for free.
 */
export function Radio({
  label,
  id,
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <span className="studio-choice studio-choice--radio">
      <input className="studio-choice__input" id={inputId} type="radio" {...rest} />
      <label className="studio-choice__label" htmlFor={inputId}>
        {label}
      </label>
    </span>
  )
}
