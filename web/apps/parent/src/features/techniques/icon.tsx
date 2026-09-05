/** The library's own mark.
 *
 * `Icon.tsx` has 23 names and none of them is a technique — `belts` is the nearest and
 * already means a grade. Adding one there is an edit to a shared file in `packages/ui`
 * while another session is in this repo, so the icon lives here until the commit that
 * wires the tab moves it across.
 *
 * A figure mid-throw: two bodies and the line between them. Drawn at the same 1.7 stroke
 * on a 24 box as every icon in the tab bar, so it does not read as heavier than its
 * neighbours.
 */
export function TechniqueIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width={size}
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
