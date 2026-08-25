import type { Bundle } from '../types'

/** Mirror of `he/events.ts`, belts included under `belt.*`. `en` is `strict`. */
export const events: Bundle = {
  // -- the events list (dashboard 7a, staff 9i, parent 12h) ----------------------
  'title': 'Events and competitions',
  'list.empty': 'No events scheduled',
  'list.upcoming': 'Upcoming',
  'list.past': 'Past',
  'list.mine': 'My events',
  'create': 'New event',

  // -- an event's type and status ------------------------------------------------
  'type.competition': 'Competition',
  'type.belt_exam': 'Belt exam',
  'type.seminar': 'Seminar',
  'type.joint_training': 'Joint training',
  'type.trip': 'Trip',
  'type.other': 'Other',
  'status.draft': 'Draft',
  'status.published': 'Published',
  'status.cancelled': 'Cancelled',
  'status.completed': 'Completed',
  'status.draftHint': 'A draft event is not shown to parents',
  'publish': 'Publish event',
  'published': 'Event published',
  'cancel': 'Cancel event',
  'cancelReason': 'Reason for cancelling',

  // -- creating an event (dashboard 7b) ------------------------------------------
  'form.title': 'New event',
  'form.name': 'Event name',
  'form.description': 'Description',
  'form.type': 'Event type',
  'form.startsAt': 'Starts',
  'form.endsAt': 'Ends',
  'form.endBeforeStart': 'The end time must be after the start time',
  'form.location': 'Location',
  'form.locationExternal': 'External venue',
  'form.locationExternalHint': 'For a hall or venue that is not one of the club’s own locations',
  'form.rsvpDeadline': 'RSVP by',
  'form.save': 'Save',
  'form.saveDraft': 'Save as draft',

  // -- who it is for (§5.8's targeting) ------------------------------------------
  'target.title': 'Audience',
  'target.studio': 'The whole club',
  'target.class': 'Class',
  'target.group': 'Group',
  'target.student': 'Selected students',
  'target.add': 'Add an audience',
  'target.empty': 'No audience selected',
  'target.composeHint': 'Several audiences can be combined',

  // -- the fee --------------------------------------------------------------------
  'fee.label': 'Fee',
  'fee.free': 'Free',
  'fee.perStudent': 'per student',
  'fee.chargeOnConfirm': 'Confirming attendance creates a charge for the paying parent',

  // -- consent (§5.8) -------------------------------------------------------------
  'consent.required': 'Parent consent required',
  'consent.text': 'Consent text',
  'consent.textRequired': 'An event requiring consent must carry the consent text',
  'consent.sign': 'Agree and sign',
  'consent.signed': 'Consent signed',
  'consent.pending': 'Awaiting parent consent',
  'consent.blocksConfirmation': 'Attendance counts as confirmed only once the parent signs',

  // -- RSVP (parent 7d, dashboard 7c) ---------------------------------------------
  'rsvp.title': 'Confirm attendance',
  'rsvp.yes': 'Attending',
  'rsvp.no': 'Not attending',
  'rsvp.pending': 'No answer yet',
  'rsvp.answered': 'Your answer was saved',
  'rsvp.deadlinePassed': 'The RSVP deadline has passed',
  'rsvp.change': 'Change answer',

  // -- the event page's counters (dashboard 7c ▲ D9.2) -----------------------------
  'counts.registered': 'Registered',
  'counts.pending': 'No answer',
  'counts.declined': 'Not attending',
  'counts.paid': 'Paid',
  'remindNonResponders': 'Remind those who have not answered',
  'reminderSent': 'Reminder sent',
  'roster.empty': 'No students are attached to this event',

  'addToCalendar': 'Add to calendar',
  'attendance.take': 'Take attendance for this event',

  // -- belt exams (§5.9; staff 9d, dashboard 4d, 6b) -------------------------------
  'exam.title': 'Belt exam',
  'exam.plural': 'Belt exams',
  'exam.candidates': 'Candidates',
  'exam.nominate': 'Nominate candidates',
  'exam.eligibility': 'Eligibility',
  'exam.eligibleHint': 'Eligibility is derived from the current rank and time held',
  'exam.notEligible': 'Not yet eligible',
  'exam.result.pass': 'Pass',
  'exam.result.fail': 'Fail',
  'exam.result.pending': 'Not examined yet',
  'exam.note': 'Examiner’s note',
  'exam.record': 'Record results',
  'exam.recorded': 'Results recorded',
  'exam.passPromotesHint': 'A pass awards the next rank and updates the student’s card',
  'exam.empty': 'No belt exams scheduled',

  // -- the belt system (dashboard 5b, wizard 5d) ----------------------------------
  'belt.title': 'Belt system',
  'belt.rank': 'Rank',
  'belt.rankPlural': 'Ranks',
  'belt.add': 'New rank',
  'belt.name': 'Rank name',
  'belt.kyu': 'Kyu',
  'belt.kyuOptional': 'Not every club uses kyu numbers',
  'belt.order': 'Order',
  'belt.orderHint': 'The order is what defines the next rank',
  'belt.color': 'Colour',
  'belt.secondaryColor': 'Secondary colour',
  'belt.biColor': 'Two-colour belt',
  'belt.perClassHint': 'The belt system is defined per class',
  'belt.empty': 'No belt system defined',
  'belt.seedDefault': 'Load the default belt system',

  // -- a student's belt (parent 12d, dashboard 4d) --------------------------------
  'belt.current': 'Current rank',
  'belt.next': 'Next rank',
  'belt.none': 'No rank awarded yet',
  'belt.progress': 'Belt progress',
  'belt.history': 'Rank history',
  'belt.awardedOn': 'Awarded on',
  'belt.awardedBy': 'Awarded by',
  'belt.awardNote': 'Note',
  'belt.award': 'Award a rank',
  'belt.awarded': 'Rank awarded',
  'belt.awardOutsideExam': 'Award without an exam',
  'belt.groupPromote': 'Promote as a group',
  'belt.groupPromoteHint': 'Promote everyone who passed, in one action',
}
