import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'

/**
 * Artboard 4h, card כפתורים. Five appearances, four of them variants and one — disabled —
 * a state of any variant, which is why `disabled` stays a native attribute rather than
 * becoming a fifth variant: it must also switch off the click, the focus and the
 * accessibility state, and only the real attribute does all four.
 *
 * `type` defaults to "button". The HTML default is "submit", which makes any button
 * inside a form submit it — a bug that only surfaces once forms exist, i.e. in someone
 * else's lane.
 */
export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...rest
}: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={className ? `studio-btn ${className}` : 'studio-btn'}
      data-variant={variant}
      type={type}
      {...rest}
    />
  )
}
