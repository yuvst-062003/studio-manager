// Parent artboards 12h (אירועים) and 7d (הזמנה לאירוע).
//
// **No `registerSlot` here.** Both are pages. This lane's parent-app slot work is 12d's
// belt progression, which lives in features/belts/ beside the ladder it renders.
export { ParentEventsScreen, rsvpLine } from './ParentEventsScreen'
export { EventInviteScreen } from './EventInviteScreen'
export { blocksConfirmation, deadlinePassed, makeParentEventsClient } from './client'
export type { ParentEventOut, ParentEventsClient } from './client'
