import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

/**
 * Artboard 4h, card מתגים ובחירה. A native input: accessible, keyboard-operable and
 * form-associated already. Reimplementing it with role="checkbox" would be strictly worse.
 */
export function Checkbox({
  label,
  block = false,
  id,
  ...rest
}: {
  /**
   * Stretch to the full width of the container, so the whole ROW toggles rather than only
   * the 20px box and the words next to it. What a list of options on a phone wants; the
   * default stays inline, which is what a single checkbox beside a sentence wants.
   */
  block?: boolean
  /**
   * `ReactNode`, not `string`. A row that pairs a name with a `MoneyDisplay` — the shop's
   * whole list — could not use this primitive while the label was a string, and hand-rolled
   * a bare `<input type="checkbox">` instead: 13x13 at the browser default, no focus ring,
   * on a phone. The accessible name still comes from the rendered text, so a rich label is
   * no worse for assistive tech than a plain one.
   */
  label: ReactNode
} & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <span className="studio-choice" data-block={String(block)}>
      <input className="studio-choice__input" id={inputId} type="checkbox" {...rest} />
      <label className="studio-choice__label" htmlFor={inputId}>
        {label}
      </label>
    </span>
  )
}
