import { formatAgorot } from '@studio/core'

/**
 * A shekel amount, rendered from agorot.
 *
 * **The bidi problem this exists to solve.** A money amount is a left-to-right run of
 * digits inside a right-to-left sentence. Without isolation, `-320₪` in a Hebrew row
 * renders as `320₪-` — the minus jumps to the far end and a **credit reads as a debt**.
 * §5.10 makes negative amounts real ("negative for a credit or discount"), so this is not
 * hypothetical. `<bdi>` is the element for exactly this: it isolates the run so the bidi
 * algorithm cannot reorder it against the surrounding text. One tag, and it is correct in
 * both directions without a single direction-aware style.
 *
 * **Formatting comes from `@studio/core`**, never from a second implementation here. A
 * component with its own rounding rules is a component that eventually disagrees with the
 * ledger by an agora.
 *
 * **The tone is a semantic token and cannot be overridden** (D2, G13). There is
 * deliberately no `color` prop: the semantic tier is "never overridable" precisely so a
 * club branding itself red cannot swallow the debt amount, which §5.10 makes the most
 * important number in the parent app. The type also excludes `brand`, because D2 forbids
 * brand colour in status positions and the type system is the cheapest place to say so.
 *
 * **Colour is never the only carrier** (SC 1.4.1). The sign is in the text, and `label`
 * lets a caller give the number the context a screen reader needs.
 */
export type MoneyTone = 'debt' | 'paid' | 'pending' | 'cancelled'

export function MoneyDisplay({
  agorot,
  tone,
  label,
}: {
  agorot: number
  tone?: MoneyTone
  label?: string
}) {
  return (
    <span aria-label={label} className="studio-money" data-tone={tone}>
      {/* <bdi>, not <span dir="ltr">: bdi isolates without asserting a direction, so the
          amount keeps the document's own direction for punctuation while its digits stay
          in one unbreakable run. */}
      <bdi>{formatAgorot(agorot)}</bdi>
    </span>
  )
}
