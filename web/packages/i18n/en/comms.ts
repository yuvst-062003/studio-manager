import type { Bundle } from '../types'

/** Mirror of `he/comms.ts`. `en` is `strict` in the parity policy — a gap fails the build. */
export const comms: Bundle = {
  // -- the parent inbox (parent 2b ▲ D9.1 — inbox only) --------------------------
  'inbox.fillDeclaration': 'Fill the declaration',
  'inbox.later': 'Later',
  'inbox.title': 'Club updates',
  'inbox.empty': 'No updates',
  'inbox.emptyHint': 'Messages from the club appear here',
  'inbox.unread': 'Unread',
  'inbox.markRead': 'Mark as read',
  'inbox.markAllRead': 'Mark all as read',
  'inbox.new': 'New',
  'inbox.older': 'Earlier',
  // -- screen 7's axis: what the club is still WAITING for, which is not what is unread --
  'inbox.waiting': 'Waiting for you',
  'inbox.settled': 'Done',
  'inbox.updates': 'Updates',
  'inbox.of': 'of',
  'inbox.byArrival': 'in the order they arrived',
  'inbox.queueLabel': 'Things waiting for you',
  'inbox.action.healthRenewal': 'Renew the declaration',
  'inbox.action.payment': 'Go to payments',
  'inbox.action.eventRsvp': 'Answer the invitation',

  // -- publishing (dashboard 4f) --------------------------------------------------
  'announcement.title': 'Messages',
  'announcement.create': 'New message',
  'announcement.subject': 'Subject',
  'announcement.body': 'Message',
  'announcement.empty': 'No messages sent yet',
  'announcement.publish': 'Send',
  'announcement.published': 'Message sent',
  'announcement.schedule': 'Schedule',
  'announcement.scheduledFor': 'Will send on',
  'announcement.draft': 'Draft',
  'announcement.cancelSchedule': 'Cancel the schedule',
  'announcement.delete': 'Delete message',

  // -- who it goes to -------------------------------------------------------------
  'audience.title': 'Audience',
  'audience.studio': 'The whole club',
  'audience.class': 'Class',
  'audience.group': 'Group',
  'audience.recipients': 'Reaches {{count}} families',
  'audience.none': 'No audience selected',
  'audience.limitedToOwnGroups': 'You can send to the groups you coach',

  'preview.title': 'Preview',
  'preview.asParent': 'As the parent sees it',
  'preview.pushLine': 'How the notification looks on a lock screen',

  // -- §5.11's delivery report ------------------------------------------------------
  'delivery.title': 'Delivery report',
  'delivery.sent': 'Sent to {{count}} families',
  'delivery.received': '{{count}} received',
  'delivery.missed': '{{count}} did not receive',
  'delivery.inFlight': 'The message is still sending',
  'delivery.allReceived': 'Every family received the message',
  'delivery.reason.no_token': 'App not installed',
  'delivery.reason.denied': 'Notifications turned off',
  'delivery.reason.failed': 'Sending failed',
  'delivery.copyNumbers': 'Copy the numbers',
  'delivery.numbersCopied': 'Numbers copied',
  'delivery.resend': 'Send again',
  'delivery.shareToWhatsapp': 'Also send on WhatsApp',

  // -- the push-disabled banner (§5.11) ---------------------------------------------
  'pushDisabled.title': 'Notifications are off',
  'pushDisabled.body': 'You will not hear about cancelled classes',
  'pushDisabled.iosNeedsInstall':
    'On iPhone, add the app to your home screen to receive notifications',
  'pushEnabled.confirmation': 'Notifications are on',
  // The row's own heading in Profile → הגדרות, where this lives now.
  'push.settingTitle': 'Notifications',
  'push.enable': 'Turn on notifications',

  // -- notification preferences (§5.11) ---------------------------------------------
  'preferences.title': 'Notification settings',
  'preferences.subtitle': 'Each type can be turned off on its own',
  'preferences.on': 'On',
  'preferences.off': 'Off',
  'preferences.alwaysOn': 'This notification is always sent',
  'preferences.kind.session_cancelled': 'Class cancelled or moved',
  'preferences.kind.coach_substituted': 'Coach substituted',
  'preferences.kind.announcement': 'Club messages',
  'preferences.kind.event': 'Events and competitions',
  'preferences.kind.payment': 'Payments and charges',
  'preferences.kind.belt': 'Belts and exams',
  'preferences.kind.attendance': 'Attendance',
  'preferences.kind.health': 'Health declarations',

  // -- §5.12's calendar feed ---------------------------------------------------------
  'calendar.title': 'Calendar sync',
  'calendar.subtitle': 'Classes and events appear in your own calendar',
  'calendar.addGoogle': 'Add to Google Calendar',
  'calendar.addApple': 'Add to Apple Calendar',
  'calendar.copyLink': 'Copy the link',
  'calendar.linkCopied': 'Link copied',
  'calendar.rotate': 'Replace the link',
  'calendar.rotated': 'Link replaced — the old one no longer works',
  'calendar.rotateWarning': 'Replacing the link disconnects every calendar already synced',
  'calendar.lastRotated': 'Last replaced',
  'calendar.rotateKeep': 'Keep the current link',
  'calendar.refreshDelay':
    'Google Calendar can lag by up to a day. Cancellations are always sent as a notification',
  'calendar.addSingleEvent': 'Add this event to your calendar',

  // -- §6.5's value pre-prompt, and the iOS path with no prompt at all ---------------
  'push.prePrompt.title': 'Shall we let you know?',
  'push.prePrompt.body': "We'll tell you if a class is cancelled",
  'push.prePrompt.accept': 'Yes, notify me',
  'push.prePrompt.decline': 'Not now',
  'push.iosTabHasNoApi': 'To get notifications on iPhone, add the app to your home screen',
  'push.registered': 'This device will receive notifications',

  // -- §6.5's install-state list, beside the delivery report -------------------------
  'install.title': 'Who can receive notifications',
  'install.installed': '{{count}} installed the app',
  'install.notInstalled': '{{count}} have not installed',
  'install.callThem': 'These families can only be reached by phone',
  'install.emptyGood': 'Every family has installed the app',
  'install.platform.ios': 'iPhone',
  'install.platform.android': 'Android',
  'install.platform.web': 'Browser',

  // -- §5.14's at-risk alert ---------------------------------------------------------
  'atRisk.title': 'Students at risk',
  'atRisk.body': '{{name}} has missed {{count}} classes in a row',
  'atRisk.contactParent': 'Call the parent',
  'atRisk.noPhone': 'No phone number on file',
  'atRisk.empty': 'No students at risk',

  // -- §4.9's contact hand-off (2026-09-06, staff redesign C2) -----------------------
  'contact.messageLabel': 'Message text',
  'contact.readyHint': 'The message is ready. Nothing is sent automatically — sending it is up to you.',
  'contact.missingPhoneCount': '{{count}} families have no phone number on file',
  'contact.missingPhoneCount.one': 'One family has no phone number on file',
  'contact.noNumbers': 'No phone numbers are available for these families. You can still share to WhatsApp',
  'contact.loading': 'Loading contact details…',

  'calendar.coachSubtitle': 'The sessions you teach appear in your calendar',
  'inbox.joinClub': 'Join the club',
  // -- עדכונים, the redesigned parent updates tab (2026-09-05) -------------------
  'updates.title': 'Updates and messages',
  'updates.pendingCount': '{{count}} waiting for you',
  'updates.allClear': "You're up to date ✓",
  'updates.filterLabel': 'Filter by category',
  'updates.filterAll': 'All',
  'updates.filterAction': 'Needs action',
  'updates.filterClub': 'Club',
  'updates.urgentHeading': 'Needs your attention now',
  'updates.urgentNote': 'Must be settled',
  'updates.clubHeading': 'Club announcements',
  'updates.clubNote': 'Everyone',
  'updates.personalHeading': 'Your family',
  'updates.personalNote': 'Per child',
  'updates.isNew': 'New',
  // Per row, beside the חדש pill it clears. See MarkReadButton for why the row
  // needed its own affordance at all.
  'updates.markRead': 'Mark as read',
  'updates.markAllRead': 'Mark all as read',
  'updates.settled': 'Done',
  'updates.emptyTitle': 'No new updates',
  'updates.emptyBody': 'When the club sends a message, it will appear here.',
  'updates.emptyFiltered': 'No updates in this category',
  'updates.loading': 'Loading updates…',
  'updates.loadFailed': "We couldn't load your updates",
  'updates.retry': 'Try again',
  // Counterpart of he/comms.ts's loadingMore.
  'updates.loadingMore': 'Loading more updates…',
  'updates.loadMore': 'Load earlier updates',
}
