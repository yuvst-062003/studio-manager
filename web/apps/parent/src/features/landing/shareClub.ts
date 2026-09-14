// §20's one acquisition feature: the club's public page, handed to a friend over WhatsApp.
//
// **Why this is the whole of it.** The club gets under five enquiries a month and every one
// of them arrives in person, by word of mouth — a parent telling a friend, a child bringing
// a schoolfriend. Both of those conversations happen in WhatsApp, and the landing page has
// produced zero bookings in its life because nobody has a way to hand it over. This module
// is that hand-over and nothing more: no vendor, no API, no token, no monthly cost.
//
// `whatsappShareUrl` in @studio/core is the same `wa.me/?text=` affordance §5.11 chose for
// announcements — no recipient in the URL, so the sender picks who gets it and nothing about
// who they picked leaves the device.
import { whatsappShareUrl } from '@studio/core'

/** The club's public page, as a link a stranger can open.
 *
 * **The landing host wins when it is configured.** #25 puts the shop window on the apex
 * (`gladiatorclub.co.il`), while the app itself answers on `app.` — so the naive
 * `location.origin` would share a sign-in wall with somebody who has no account, which is
 * the one audience this link exists for.
 *
 * Falls back to `/t/{slug}` on the current origin, which is canonical on every host (see
 * `route.ts`) and therefore always correct, if less pretty. Returns `null` when there is no
 * slug to build from: a share button that copies a broken link is worse than one that is
 * not there, and the caller hides itself on `null`.
 */
export function clubPublicUrl(
  slug: string | undefined,
  landingHosts: readonly string[],
  origin: string,
): string | null {
  const trimmed = slug?.trim()
  if (!trimmed) return null
  //: The first configured host is the canonical one — production lists the apex first and
  //: `www.` second, and a share link should carry the shorter of the two.
  const host = landingHosts.map((candidate) => candidate.trim()).find(Boolean)
  if (host) return `https://${host}/`
  //: No apex configured (staging, development): the slug path, which resolves everywhere.
  return `${origin.replace(/\/$/, '')}/t/${trimmed}`
}

/** The WhatsApp hand-off: the club's own words, then the link on its own line.
 *
 * The message and the URL are separate arguments rather than one pre-joined string because
 * `whatsappShareUrl` puts a blank line between its two halves — which is what makes the
 * link preview render as its own block in the conversation rather than trailing a sentence.
 */
export function shareClubHref(message: string, url: string): string {
  return whatsappShareUrl(message, url)
}
