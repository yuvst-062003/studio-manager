// Parent artboard `2b` (עדכוני מועדון), §5.12's calendar feed, and §5.11's banner.
//
// **§5.12's panel is gone (#29, 2026-09-08).** `CalendarSync.tsx` — the section that
// stood under לוח הילד at `#/calendar` — was DELETED, not unrouted: the owner asked for
// a popup off הגדרות instead, and it lives at
// `features/people/redesign/CalendarSyncPopup.tsx` because הגדרות is the screen that
// opens it. `googleSubscribeUrl` / `webcalUrl` stay here, and that popup imports them —
// the two URL shapes are the part of §5.12 that did not change.
//
// **No `registerSlot` here.** `2b` is a page, and this lane's parent-app work is all pages
// plus one banner the page renders itself. The `alert-centre` and `parent-profile` slots are
// the dashboard's and M9's respectively.
//
// `EventCalendarButtons` is exported and NOT mounted: its home is `7d`/`12h` in
// `features/events/`, which belongs to lane EVENTS and has no slot to register into. See its
// own header.
export { PushDisabledBanner } from './PushDisabledBanner'
export { EventCalendarButtons, eventIcsUrl } from './EventCalendarButtons'
export { usePushRegistration, platformOf, reconcilePushRegistration } from './usePushRegistration'
export type { PushState } from './usePushRegistration'
export { makeParentCommsClient, googleSubscribeUrl, webcalUrl } from './commsClient'
export type { NotificationOut, ParentCommsClient } from './commsClient'
