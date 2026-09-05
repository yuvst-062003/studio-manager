// What each notification action opens, and what its button says.
//
// Extracted from `InboxScreen` when the redesign deleted that screen. It was always the
// wrong home for it — the map is a fact about the PRODUCT (which kinds have a screen), not
// about one rendering of an inbox, and `UpdatesScreen` needed it the moment it replaced
// that rendering.
//
// The server sends the FACT (`action.kind`) and never the words or the route: §5.11's
// trigger list grows every milestone, and a server that shipped Hebrew button text would
// need a deploy to fix a typo. A kind this map does not know renders as a plain row rather
// than as a button that goes nowhere — the safe direction for a kind a later lane adds.
export const ACTIONS: Record<string, { labelKey: string; route: string }> = {
  // Both health actions route home, where §6.1's gate holds the form. There is no
  // `#/health` to send anyone to, and inventing one would be a route with no screen.
  health_declaration: { labelKey: 'comms.inbox.fillDeclaration', route: '#/' },
  health_renewal: { labelKey: 'comms.inbox.action.healthRenewal', route: '#/' },
  payment: { labelKey: 'comms.inbox.action.payment', route: '#/payments' },
  event_rsvp: { labelKey: 'comms.inbox.action.eventRsvp', route: '#/events' },
  trial_join: { labelKey: 'comms.inbox.joinClub', route: '#/join' },
}
