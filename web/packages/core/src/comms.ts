// §4.9/§5.11's two hand-off actions, shared by every app that contacts a family.
//
// **The names and numbers are the feature, not an integration.** §5.11 states the product
// permits no email, no SMS and no WhatsApp channel of its own: the club already has a
// WhatsApp group, so the app hands over the numbers and a pre-composed message and lets a
// human do the sending. "Same outcome as automation, half a day of work, zero risk."
//
// **Owned here, not per-app.** The dashboard wrote these first (§5.11's delivery report);
// the staff app's schedule card, student card and task list all need the identical two
// actions against differently-shaped data. A second copy in `apps/staff` would drift the
// moment either one changed its escaping or its join character, so both apps import this
// module instead.
/** Any row `phoneList` can read a number off. Deliberately narrower than any one
 *  endpoint's schema — `MissedRecipientOut` (the dashboard's delivery report) and a
 *  roster-derived contact (the staff app's) both satisfy this structurally, with no
 *  adapter object required at either call site. */
export type Contactable = { phone?: string | null }

/**
 * §5.11's `[ העתק מספרים ]` — "The manager pastes those numbers into the WhatsApp group the
 * club already has. Same outcome as automation, half a day of work, zero risk."
 *
 * Newline-separated, because that is what pastes usefully into a message. **A family with
 * no number on file is dropped rather than pasted as a blank line** — a blank line reads
 * as a person the manager forgot to look up, not as a person with nothing to look up.
 */
export function phoneList(rows: readonly Contactable[] | undefined): string {
  return (rows ?? [])
    .map((row) => row.phone)
    .filter((phone): phone is string => Boolean(phone))
    .join('\n')
}

/**
 * §5.11's `שלח גם בוואטסאפ`, and §12 is why it is a URL rather than an integration.
 *
 * "The WhatsApp Groups API caps a group at 8 participants (the business number takes one)
 * and exposes NO endpoint to add a participant... Only a share-sheet handoff is viable."
 * And the unofficial libraries "violate WhatsApp ToS; the phone number gets banned" —
 * unusable in a product that would be risking *customers'* numbers.
 *
 * So: `https://wa.me/?text=`, which opens WhatsApp with the message pre-composed and lets
 * whoever presses the link pick the chat or group themselves. No API, no cost, no
 * dependency, and no phone number embedded — this is a broadcast handoff, not a message to
 * one person.
 */
export function whatsappShareUrl(title: string, body: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${title}\n\n${body}`)}`
}
