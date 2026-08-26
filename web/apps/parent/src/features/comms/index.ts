// Parent artboard `2b` (עדכוני מועדון), §5.12's calendar panel, and §5.11's banner.
//
// **No `registerSlot` here.** `2b` is a page, and this lane's parent-app work is all pages
// plus one banner the page renders itself. The `alert-centre` and `parent-profile` slots are
// the dashboard's and M9's respectively.
//
// `EventCalendarButtons` is exported and NOT mounted: its home is `7d`/`12h` in
// `features/events/`, which belongs to lane EVENTS and has no slot to register into. See its
// own header.
export { InboxScreen } from './InboxScreen'
export { PushDisabledBanner } from './PushDisabledBanner'
export { CalendarSync } from './CalendarSync'
export { EventCalendarButtons, eventIcsUrl } from './EventCalendarButtons'
export { usePushRegistration, platformOf } from './usePushRegistration'
export type { PushState } from './usePushRegistration'
export { makeParentCommsClient, googleSubscribeUrl, webcalUrl } from './commsClient'
export type { NotificationOut, ParentCommsClient } from './commsClient'
