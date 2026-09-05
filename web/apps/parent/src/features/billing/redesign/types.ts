// The shapes חנות המועדון's ported components take.
//
// THIS IS THE SCREEN WHERE THE PROTOTYPE AND THIS PRODUCT DIVERGE MOST, and the divergence
// is in the data, not the design. `Product` (app/models/billing.py) is deliberately small:
//
//     id · name · description · price_agorot · sizes[] · is_active
//
// The prototype's `ProductItem` also carries `image`, `category`, `tag`, `tagColor`,
// `isBelt` and a list of belt `colors`. None of those exists here, and none can be guessed:
//
//  - NO PHOTOGRAPHS. There is no image column and no upload anywhere in the manager. A
//    stock photo of somebody else's גי is a picture of a product this club does not sell.
//  - NO CATEGORIES. The prototype's chips (חגורות · ג׳ודוגי · ביגוד) filter on a field the
//    catalogue has no equivalent of. Deriving one from the product's NAME — "does it contain
//    the word חגורה" — would be a guess about somebody else's supplier, which the model's own
//    docstring rules out for sizes for exactly this reason.
//  - NO BELT COLOUR CUSTOMISER. Same: the club sells "חגורה" at one price, and the colour a
//    child is entitled to is decided by their grading, not by a shopping choice.
//  - NO ORDER TRACKER. §4.3 says it outright — "inventory is a different product". An order
//    becomes ordinary manual charges, so there is no fulfilment state to show and no
//    endpoint that would return one. What happens next lives on the payments screen.
//
// Everything the catalogue DOES carry is here, including `description`, which the API has
// returned all along and the previous client type simply dropped.

export type ShopProduct = {
  id: string
  name: string
  /** The manager's own words. Optional in the model, so optional here. */
  description: string | null
  /** Integer agorot. Never divided outside a formatter. */
  priceAgorot: number
  /** Empty means the item HAS no sizes — a חגורה — which is a different thing from a size
   *  picker nobody has answered yet. There is deliberately no `hasSizes` flag beside it. */
  sizes: readonly string[]
}

/** One line of the basket. Keyed by product AND size: two sizes of one גי are two lines. */
export type CartLine = {
  productId: string
  name: string
  priceAgorot: number
  size: string | null
  quantity: number
  /** The parent's own words on the line — "רקמה: יוסי". The server rides it on the charge's
   *  label so the manager reads it without opening anything. */
  note: string | null
}

/** How the basket is going out. */
export type CheckoutState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'placed'; lines: number; totalAgorot: number }
  | { kind: 'failed' }
