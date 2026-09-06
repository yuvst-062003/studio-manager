/** The library's own mark, drawn as a figure mid-throw: two bodies and the line between
 *  them.
 *
 * **Why it is still here and not in `packages/ui`'s `Icon.tsx`.** That was the plan while
 * the parent app's tab bar was `@studio/ui`'s `TabBar`, which draws its icons with
 * `<Icon name="…" />`. The redesign replaced that bar with `ParentTabBar`, a Tailwind port
 * whose icons are styled entirely by className — the active tab sets `stroke-[2.4]` and a
 * fill on the glyph. `Icon` takes `size` and `style` and no `className`, so an icon moved
 * into it could not be styled by the bar that would be its only caller, and `packages/ui`
 * is loaded by staff and dashboard too. So it stays with the feature it belongs to, and
 * takes the same props a `lucide-react` glyph takes instead.
 *
 * `strokeWidth` is the tab bar's idle 1.7 as an ATTRIBUTE, which a `stroke-[2.4]` class
 * overrides the way it overrides lucide's own — a CSS declaration beats a presentation
 * attribute. Same for `fill="none"` against the active `fill-…` classes.
 */
export function TechniqueIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="24"
    >
      <circle cx="8" cy="5" r="2.2" />
      <path d="M8 7.4v4.2l4 2.4" />
      <path d="M4.5 20.5 8 11.6" />
      <path d="M12 14h5.5" />
      <path d="m17.5 14 2.5 5" />
      <circle cx="18.6" cy="10.4" r="1.8" />
    </svg>
  )
}
