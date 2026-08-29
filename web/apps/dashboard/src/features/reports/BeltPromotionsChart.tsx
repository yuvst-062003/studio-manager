// ▲ `קידומי חגורה בתקופה` — THE ONE DELIBERATE EXCEPTION TO THE MONOCHROME RULE.
//
// **Read this before porting the screen.** `4g` is titled "without colourful charts" and
// holds that line everywhere except here. The exception is defensible and it is narrow:
// **belt colours are data (D3, §5.9)**, stored per studio in `belt_rank.color_hex` and
// renameable and recolourable by the manager on `5b`. A promotions chart whose bars were
// not belt-coloured would be harder to read, not more restrained. It is the only place on
// this screen where a colour is not a semantic token, and nothing else here may follow it.
//
// **This is NOT a `BeltBar`, and it must not become one.** `BeltBar` is one student's
// identity strip — "this child holds this rank". This is a *distribution*: how many
// students reached each rank in the window. Same palette, same ring, different component,
// the same distinction `6b`'s outcome strip draws. Composing `BeltBar` here would mean
// bending a fixed-height identity bar into a variable-height column, and the next lane
// that needed a different height would write its own fill-only bar — which is exactly the
// bug D7's unconditional ring exists to prevent.
//
// **The ring is unconditional, and the artboard is wrong.** D7's own table: black on the
// dark ground is 1.02:1 and white on the light ground is 1.08:1, with yellow at 2.02:1
// failing even the 3:1 non-text threshold and brown and green failing on dark (D12). The
// artboard rings only the near-white bar and leaves **the black bar bare**, so in dark
// mode that chart loses a column entirely and nobody is told. Every bar here is ringed,
// there is no prop that turns it off, and a test asserts it.
//
// **The counts are printed.** The artboard carries no value labels at all, so a manager
// can compare heights and cannot read a promotion count off it. The spec says to add the
// numbers. These are them.
//
// Direction is inherited: rendered in `order_index` order, lowest rank first, and RTL puts
// the first column at the reading start. `4g`: "Low-to-high in reading order."
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { BeltPromotion } from './client'

const MIN_VISIBLE = '3px'

/** `5b` allows bi-colour grades; a chart that could not draw one would push the next lane
 *  into writing its own bar. Identical to `BeltBar`'s own gradient. */
function fill(belt: BeltPromotion): string {
  return belt.secondary_color_hex
    ? `linear-gradient(to bottom, ${belt.color_hex} 0 50%, ${belt.secondary_color_hex} 50% 100%)`
    : belt.color_hex
}

export function BeltPromotionsChart({ locale, belts }: { locale: Locale; belts: BeltPromotion[] }) {
  const scale = Math.max(1, ...belts.map((belt) => belt.promotions))

  return (
    <ol
      className="dash-belts"
      data-testid="belt-chart"
      aria-label={t(locale, 'reports.belts.chartLabel')}
    >
      {belts.map((belt) => (
        <li className="dash-belts__column" key={belt.belt_rank_id}>
          <span className="dash-belts__track">
            <span
              className="dash-belts__bar"
              data-testid={`belt-bar-${belt.belt_rank_id}`}
              style={{
                background: fill(belt),
                // INLINE, exactly as `BeltBar` writes it, and for `BeltBar.test.tsx`'s own
                // stated reason: "A stylesheet ring would be asserted nowhere: jsdom
                // applies no CSS rules." A ring that only a human can see in a browser is
                // a ring the next refactor deletes.
                boxShadow: 'inset 0 0 0 var(--belt-ring-width) var(--belt-ring)',
                // A rank that promoted nobody still draws its ring, at the hairline the
                // ring itself is. A column with no bar at all would read as a rank the
                // studio does not have.
                blockSize:
                  belt.promotions > 0
                    ? `max(${MIN_VISIBLE}, ${(belt.promotions / scale) * 100}%)`
                    : 'var(--belt-ring-width)',
              }}
            />
          </span>
          {/* The number the artboard omits. `dir="ltr"` because a bare digit run inside an
              RTL row is free to be reordered against its neighbours. */}
          <span className="dash-belts__count" data-testid={`belt-count-${belt.belt_rank_id}`}>
            <bdi dir="ltr">{belt.promotions}</bdi>
          </span>
          {/* The rank's name is DATA — `5b` lets the manager rename it — so it is never a
              translation key, and `<bdi>` keeps a Latin-named rank from reordering the row. */}
          <span className="dash-belts__name">
            <bdi>{belt.name}</bdi>
          </span>
        </li>
      ))}
    </ol>
  )
}
