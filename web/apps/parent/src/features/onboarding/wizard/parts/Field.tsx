// The prototype's field styling, written once. Every input in the student form is 44px, a
// 12px radius, `#f2f3ff` with a transparent border, turning white with a `#0056c5` border
// on focus; in error a 2px red border on a red tint with the label red and a `שדה חובה`
// badge beside it.
//
// The error is wired with `aria-describedby` and the input marked `aria-invalid`, which the
// prototype does neither of -- `.claude/rules/ui-rtl-a11y.md`: "errors are linked via
// aria-describedby".
import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { AlertCircle } from 'lucide-react'

const REQUIRED_BADGE = 'שדה חובה'

function ErrorLine({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      className="text-[11.5px] text-red-600 font-medium flex items-center gap-1 mt-0.5"
      role="alert"
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />
      <span>{message}</span>
    </p>
  )
}

function Label({
  htmlFor,
  children,
  required,
  invalid,
}: {
  htmlFor: string
  children: ReactNode
  required?: boolean
  invalid: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label
        htmlFor={htmlFor}
        className={`text-[13px] font-medium transition-colors ${
          invalid ? 'text-red-700 font-bold' : 'text-[#161b28]'
        }`}
      >
        {children}
        {required ? <span className="text-red-500 font-bold"> *</span> : null}
      </label>
      {invalid ? (
        <span className="text-[10.5px] font-bold text-red-600 bg-red-100/90 border border-red-200 px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0">
          <AlertCircle className="w-3 h-3" />
          {REQUIRED_BADGE}
        </span>
      ) : null}
    </div>
  )
}

const baseInput =
  'h-11 px-3 rounded-xl text-[14px] w-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0056c5]/40'
const okInput =
  'bg-[#f2f3ff] text-[#161b28] border border-transparent focus:border-[#0056c5] focus:bg-white'
const badInput =
  'border-2 border-red-500 bg-red-50/40 text-red-950 placeholder-red-400 focus:border-red-600'

export type TextFieldProps = {
  label: string
  error: string | null
  required?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>

export function TextField({ label, error, required, ...rest }: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const invalid = error !== null
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} required={required} invalid={invalid}>
        {label}
      </Label>
      <input
        {...rest}
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={`${baseInput} ${invalid ? badInput : okInput}`}
      />
      {invalid ? <ErrorLine id={errorId} message={error} /> : null}
    </div>
  )
}

export type SelectFieldProps = {
  label: string
  error: string | null
  required?: boolean
  placeholder?: string
  options: readonly { value: string; label: string }[]
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id' | 'children'>

export function SelectField({
  label,
  error,
  required,
  placeholder,
  options,
  ...rest
}: SelectFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const invalid = error !== null
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} required={required} invalid={invalid}>
        {label}
      </Label>
      <select
        {...rest}
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={`${baseInput} ${invalid ? badInput : okInput}`}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {invalid ? <ErrorLine id={errorId} message={error} /> : null}
    </div>
  )
}

export function SectionBand({ icon, title, trailing }: { icon: ReactNode; title: string; trailing?: ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-[#f2f3ff] border border-[#e9edff] flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-[#0056c5]">{icon}</span>
        <span className="text-[16px] font-bold text-[#001849]">{title}</span>
      </div>
      {trailing}
    </div>
  )
}
