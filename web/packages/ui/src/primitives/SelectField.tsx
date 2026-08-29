import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

/**
 * A labelled `<select>`, wired exactly like `TextField`.
 *
 * **Why this exists.** Twenty-five raw `<select>` elements were spread across the
 * dashboard, each with a bare `<label>` wrapped round it and no styling at all. Beside a
 * `TextField` they rendered at the UA's own size — the students screen put a 158×22 search
 * box next to a 95×20 status filter with their baselines two pixels apart — and the owner
 * reported that family of screens as "the status or search is overlaid and misdesigned"
 * (2026-08-29). The complaint was about a missing primitive, not about three screens.
 *
 * It mirrors `TextField` deliberately, down to the class names: the two are almost always
 * side by side in the same row, and a select that styled itself differently would leave
 * exactly the mismatch this replaces. `hint`/`error` wiring is copied for the same reason
 * that primitive gives — `aria-describedby`, `aria-invalid` and `data-state` written once
 * rather than per call site, because a divergence in accessibility plumbing is invisible
 * until somebody uses a screen reader.
 *
 * Options are children rather than a prop: half the call sites need `<option>` groups,
 * a leading placeholder, or a disabled entry, and an `options` array would have to grow a
 * shape for each. The native element already has one.
 */
export function SelectField({
  label,
  error,
  hint,
  id,
  className,
  children,
  ...rest
}: {
  label: string
  error?: string
  hint?: string
  children: ReactNode
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId()
  const selectId = id ?? generated
  const messageId = `${selectId}-message`
  // The error wins when both are present, as in TextField: two descriptions are read out
  // one after the other and the error is the one that needs acting on.
  const message = error ?? hint

  return (
    <div className={className ? `studio-field ${className}` : 'studio-field'}>
      <label className="studio-field__label" htmlFor={selectId}>
        {label}
      </label>
      <select
        aria-describedby={message ? messageId : undefined}
        aria-invalid={error ? true : undefined}
        className="studio-field__input studio-field__input--select"
        data-state={error ? 'error' : 'default'}
        id={selectId}
        {...rest}
      >
        {children}
      </select>
      {message ? (
        <p className="studio-field__message" data-tone={error ? 'danger' : 'muted'} id={messageId}>
          {message}
        </p>
      ) : null}
    </div>
  )
}
