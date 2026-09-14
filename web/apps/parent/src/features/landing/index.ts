export { PublicLanding } from './PublicLanding'
export { TrialBookingPage } from './TrialBookingPage'
export { LegalPage } from './LegalPage'
export { BookingConfirmed, icsFor } from './BookingConfirmed'
export { makeLandingClient, bookingErrorFor } from './landingClient'
export type { LandingClient, BookingResult, PublicGroup, TrialSlot } from './landingClient'
export {
  landingHostsFrom,
  landingSlugFor,
  landingViewHref,
  matchLandingPath,
} from './route'
export type { LandingRoute, LandingView } from './route'
// §20 — the share affordance. Lives here because building the link needs this feature's
// own knowledge of where the club's public page actually answers (#25's apex rule).
export { clubPublicUrl, shareClubHref } from './shareClub'
