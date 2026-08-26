import { useId } from 'react'
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

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
 *
 * **`multiline` selects a `<textarea>`, and it lives here rather than in a lane.**
 * Four artboards want a multi-line field — `7b`'s event consent text (4000 chars), `12c`,
 * `9g`, and `9d`'s examiner note — plus `charge.proration_note` and
 * `ChargeAdjustmentIn.reason`. The whole reason it belongs to the primitive is that the
 * label wiring, `aria-describedby`, `aria-invalid` and `data-state` are written once: two
 * lanes each building a local `<textarea>` is how those four wires diverge, and a
 * divergence in accessibility plumbing is invisible until somebody uses a screen reader.
 *
 * The props are a discriminated union on `multiline` rather than an intersection, because
 * `rows`/`maxLength` and `type`/`inputMode` are different attribute sets — an
 * intersection would accept `<TextField multiline type="tel" />`, which renders a
 * textarea with a meaningless attribute on it.
 */
type SharedProps = {
  label: string
  error?: string
  hint?: string
}

type SingleLineProps = SharedProps & {
  multiline?: false
} & InputHTMLAttributes<HTMLInputElement>

type MultiLineProps = SharedProps & {
  multiline: true
} & TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextField(props: SingleLineProps | MultiLineProps) {
  const { label, error, hint, id, className, multiline, ...rest } = props
  const generated = useId()
  const inputId = id ?? generated
  const messageId = `${inputId}-message`
  // The error wins when both are present: two descriptions are read out one after the
  // other, and the error is the one that needs acting on.
  const message = error ?? hint

  // Every wire below is shared by both branches on purpose. Adding one to the input and
  // forgetting the textarea is the exact failure this primitive exists to make impossible.
  const shared = {
    'aria-describedby': message ? messageId : undefined,
    'aria-invalid': error ? true : undefined,
    'data-state': error ? 'error' : 'default',
    id: inputId,
  } as const

  return (
    <div className={className ? `studio-field ${className}` : 'studio-field'}>
      <label className="studio-field__label" htmlFor={inputId}>
        {label}
      </label>
      {multiline ? (
        <textarea
          className="studio-field__input studio-field__input--multiline"
          {...shared}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          className="studio-field__input"
          {...shared}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {message ? (
        <p className="studio-field__message" data-tone={error ? 'danger' : 'muted'} id={messageId}>
          {message}
        </p>
      ) : null}
    </div>
  )
}
