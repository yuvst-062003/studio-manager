/**
 * D7 / G10 — a belt bar is NEVER fill-only. It always carries a 1px ring in the current
 * foreground colour: #17150f on light grounds, #fffefb on dark. `--belt-ring` flips with
 * the theme, so one declaration covers both.
 *
 * Why it is unconditional, measured on the real palette:
 *   white  #fffefb on the light ground  1.08:1   invisible
 *   black  #17150f on the dark ground   1.02:1   invisible
 *   yellow #d9a800 on the light ground  2.02:1   fails even the 3:1 non-text threshold
 *   brown  #6f4a2f on the dark ground   2.38:1   fails
 *   green  #1f6b3f on the dark ground   2.86:1   fails
 * Five of seven belts across the two modes, not the three D7 names — the canvas audit
 * only measured belts against the LIGHT ground. Yellow is one of the most common
 * children's grades, so none of this is an edge case. The ring measures 16.76:1 on light
 * and 18.41:1 on dark and rescues every row at once. It is also truer to the object: a
 * real judo belt has an edge.
 *
 * THERE IS NO PROP THAT TURNS IT OFF, deliberately. BeltBar.test.tsx asserts that both
 * behaviourally and over the signature.
 *
 * `box-shadow: inset` rather than a border: a border would shrink the content box and the
 * 8px bar would render 6px of fill. It is also direction-agnostic, so it can never become
 * the `border-left` D10 exists to prevent.
 *
 * The fill is a PROP, not a token: belt_rank.color_hex is per-studio data (D3, SPEC §5.9).
 * D3 rejected belt colours as a brand palette for the same reason.
 *
 * `secondaryColorHex` covers bi-colour grades. Artboard 4h shows only solid belts — the
 * bi-colour ones live on 5b, which M7 owns — but if BeltBar could not render one, M7
 * would write its own bar and reintroduce exactly the fill-only bug this exists to stop.
 */
export function BeltBar({
  colorHex,
  label,
  secondaryColorHex,
}: {
  colorHex: string
  label: string
  secondaryColorHex?: string
}) {
  const background = secondaryColorHex
    ? `linear-gradient(to bottom, ${colorHex} 0 50%, ${secondaryColorHex} 50% 100%)`
    : colorHex

  return (
    <span
      aria-label={label}
      className="studio-belt-bar"
      role="img"
      style={{
        background,
        boxShadow: 'inset 0 0 0 var(--belt-ring-width) var(--belt-ring)',
      }}
    />
  )
}

/**
 * L2 — the landing hero's belt strip: the WHOLE ladder, no "current" marker.
 *
 * Colours come from `belt_rank.color_hex` — per-studio data, like `BeltBar`'s fill — and
 * never from the canvas: the design file carries two conflicting belt palettes and draws
 * the black belt near-white, which is a bug in the drawing. Composing `BeltBar` is what
 * keeps D7's ring unconditional here too; a white belt with no ring sits at 1.08:1 on the
 * light ground, and the first belt on the ladder is always white.
 */
export function BeltLadder({
  items,
}: {
  items: readonly { colorHex: string; label: string; secondaryColorHex?: string | null }[]
}) {
  return (
    <span className="studio-belt-ladder" data-testid="belt-ladder" role="list">
      {items.map((item) => (
        <span key={item.label} role="listitem">
          <BeltBar
            colorHex={item.colorHex}
            label={item.label}
            secondaryColorHex={item.secondaryColorHex ?? undefined}
          />
        </span>
      ))}
    </span>
  )
}
