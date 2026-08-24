import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

/**
 * Artboard 4h, card שדות קלט. Four states: empty, focused, filled, error.
 *
 * `focused` and `filled` are not props — they are CSS states (:focus-visible, and the
 * value simply being there). Only `error` needs to be told, because nothing in the DOM
 * implies it.
 *
 * The message is linked with aria-describedby and the field carries aria-invalid, per
 * .claude/rules/ui-rtl-a11y.md. A red border alone is colour-only (SC 1.4.1) and silent
 * to a screen reader.
 */
export function TextField({
  label,
  error,
  hint,
  id,
  className,
  ...rest
}: {
  label: string
  error?: string
  hint?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId()
  const inputId = id ?? generated
  const messageId = `${inputId}-message`
  // The error wins when both are present: two descriptions are read out one after the
  // other, and the error is the one that needs acting on.
  const message = error ?? hint

  return (
    <div className={className ? `studio-field ${className}` : 'studio-field'}>
      <label className="studio-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        aria-describedby={message ? messageId : undefined}
        aria-invalid={error ? true : undefined}
        className="studio-field__input"
        data-state={error ? 'error' : 'default'}
        id={inputId}
        {...rest}
      />
      {message ? (
        <p className="studio-field__message" data-tone={error ? 'danger' : 'muted'} id={messageId}>
          {message}
        </p>
      ) : null}
    </div>
  )
}
