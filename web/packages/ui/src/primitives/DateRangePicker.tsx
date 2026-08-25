import { useId } from 'react'

/**
 * Staff artboard `9b` בחירת תאריך — the טווח (range) half. A leaf primitive: two native
 * date inputs and the rule that binds them, and nothing else.
 *
 * **Not a calendar.** `9b` also draws a full month grid, and that is a composite the
 * schedule lane owns. This is the pair of bounds a filter needs, usable on its own by the
 * reports screens (`4g`), the attendance report (`4c`) and the billing period selector.
 *
 * **`<input type="date">` rather than a custom picker.** It brings the platform's own
 * keyboard, its own locale-aware presentation and its own accessibility for free, and on a
 * phone — which is where §6 says this is used — it opens the native wheel. A hand-rolled
 * picker would have to re-earn all of that, in two directions and three locales.
 *
 * **The value format is ISO `YYYY-MM-DD` and is not localized.** That is what the input
 * element requires and what the API takes. What the *user* sees is the platform's
 * rendering of that value in their locale, which is the correct split: the key is stable,
 * the label is localized. It matches `@studio/core`'s `studioDayKey` for the same reason.
 *
 * **Logical properties only** (D10 / G12). There is no `margin-left` anywhere in this
 * component or its CSS, so it needs no direction-aware branch: in `he` the "from" field
 * sits on the right and in `en` on the left, purely because `flex-direction: row` follows
 * the document direction.
 *
 * **Order is validated, not assumed.** A range whose end precedes its start is the mistake
 * a two-field control invites, and the reports it feeds would silently return nothing. The
 * component reports it through `aria-invalid` and an error message rather than clamping
 * the value, because silently rewriting what someone typed is worse than telling them.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  fromLabel,
  toLabel,
  errorMessage,
  min,
  max,
  disabled = false,
}: {
  /** ISO `YYYY-MM-DD`, or `''` for unset. */
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  fromLabel: string
  toLabel: string
  /** Shown when `to` precedes `from`. Supplied by the caller — G4, no inlined strings. */
  errorMessage?: string
  min?: string
  max?: string
  disabled?: boolean
}) {
  const id = useId()
  const fromId = `${id}-from`
  const toId = `${id}-to`
  const errorId = `${id}-error`

  // Lexicographic comparison is exact for ISO `YYYY-MM-DD` — no Date is constructed, so
  // no timezone can shift the comparison across a day boundary.
  const invalid = Boolean(from && to && to < from)

  return (
    <div className="studio-date-range">
      <div className="studio-date-range__field">
        <label className="studio-date-range__label" htmlFor={fromId}>
          {fromLabel}
        </label>
        <input
          aria-describedby={invalid ? errorId : undefined}
          aria-invalid={invalid || undefined}
          className="studio-date-range__input"
          disabled={disabled}
          id={fromId}
          max={max}
          min={min}
          onChange={(event) => onChange({ from: event.target.value, to })}
          type="date"
          value={from}
        />
      </div>

      <div className="studio-date-range__field">
        <label className="studio-date-range__label" htmlFor={toId}>
          {toLabel}
        </label>
        <input
          aria-describedby={invalid ? errorId : undefined}
          aria-invalid={invalid || undefined}
          className="studio-date-range__input"
          disabled={disabled}
          id={toId}
          max={max}
          // The end may not precede the start. Constraining the input is a hint; the
          // `invalid` check above is the guarantee, because `min` is bypassable by typing.
          min={from || min}
          onChange={(event) => onChange({ from, to: event.target.value })}
          type="date"
          value={to}
        />
      </div>

      {invalid && errorMessage ? (
        // `role="alert"` so the message is announced when it appears rather than only on
        // focus — the field that becomes invalid is often the one just left.
        <p className="studio-date-range__error" id={errorId} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
