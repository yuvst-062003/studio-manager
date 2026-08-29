import type { Bundle } from '../types'

/** Mirror of `he/reports.ts`, privacy included under `privacy.*`. `en` is `strict`. */
export const reports: Bundle = {
  // -- the reports screen (dashboard 4g) -----------------------------------------
  'title': 'Reports',
  'empty': 'No data for the selected period',
  'period': 'Period',
  'period.thisMonth': 'This month',
  'period.lastMonth': 'Last month',
  'period.nextMonth': 'Next month',
  'period.last12Months': 'Last 12 months',
  'period.custom': 'Custom range',
  'export': 'Export',
  'export.csv': 'Export to CSV',
  'export.xlsx': 'Export to Excel',
  'export.ready': 'Your file is ready',

  // -- studio overview (§5.14) -----------------------------------------------------
  'overview.title': 'Overview',
  'overview.activeStudents': 'Active students',
  'overview.activeGroups': 'Active groups',
  'overview.sessionsThisWeek': 'Sessions this week',
  'overview.attendanceToday': 'Attendance today',
  'overview.openRegistrations': 'Open registration requests',
  'overview.outstandingDebt': 'Outstanding debt',

  // -- financial (§5.14) ------------------------------------------------------------
  'financial.title': 'Financial report',
  'financial.collectedVsExpected': 'Collected vs expected',
  'financial.notYetDue': 'Not yet due',
  'financial.studentsBilled': 'Students billed',
  'financial.collectionRate': 'Collection rate',
  'financial.collected': 'Collected',
  'financial.expected': 'Expected',
  'financial.trend12m': '12-month trend',
  'financial.debtByPayer': 'Debt by payer',
  'financial.byMethod': 'Payments by method',
  'financial.chargesCreated': 'Charges created',
  'financial.chargesSettled': 'Charges settled',
  'financial.chargesVoided': 'Charges voided',
  'financial.chargesWrittenOff': 'Charges written off',
  'financial.unreconciled': 'Unmatched payments',
  'financial.pendingOrders': 'Orders pending over 24 hours',

  // -- funnel (§5.14, from student_status_history) -----------------------------------
  'funnel.title': 'Registration funnel',
  'funnel.enquiries': 'Enquiries',
  'funnel.trialsBooked': 'Trials booked',
  'funnel.trialsAttended': 'Trials attended',
  'funnel.converted': 'Converted',
  'funnel.conversionRate': 'Conversion rate',
  'funnel.daysToConvert': 'Average days to convert',
  'funnel.bySource': 'By source',
  'funnel.trialsThisWeek': 'Trials this week',
  'funnel.notFollowedUp': 'Not followed up',

  // -- operational (§5.14) ------------------------------------------------------------
  'operational.title': 'Operational report',
  'operational.attendanceRate': 'Attendance rate',
  'operational.byGroup': 'By group',
  'operational.byStudent': 'By student',
  'operational.sessionsHeld': 'Sessions held vs planned',
  'attendance.unmarkedExcluded': 'Sessions nobody marked are not counted as absences',
  'operational.newEnrollments': 'New enrolments',
  'operational.dropouts': 'Dropouts',
  'operational.netChange': 'Net change',
  'operational.missingHealth': 'Missing health declaration',
  'operational.coachSessionCounts': 'Sessions by coach',

  // -- at risk (§5.14) ------------------------------------------------------------------
  'atRisk.title': 'Students at risk',
  'atRisk.subtitle': 'Three or more consecutive absences',
  'atRisk.consecutiveAbsences': '{{count}} consecutive absences',
  'atRisk.contactParent': 'Contact the parent',
  'atRisk.empty': 'No students at risk',
  'atRisk.contacted': 'Contacted',

  // -- §11.3's data export ------------------------------------------------------------
  // ==================================================================================
  // §6.1 step 5's BLOCKING gate. **The policy and terms below are an UNREVIEWED DRAFT** —
  // see the long note in `he/reports.ts` for what they were written against and why every
  // acceptance of them is recorded at `consent_record.version = 0`.
  // ==================================================================================
  'privacy.draft.badge': 'Draft',
  'privacy.draft.notice':
    'The text below was written by the development team and has not been reviewed by a lawyer. It describes truthfully what the system actually does, but it is not legal advice and it is expected to change. Consents recorded against this text are marked with the current version and can be found again.',
  'privacy.doc.version': 'Text version',

  // -- terms of service ---------------------------------------------------------------
  'privacy.terms.title': 'Terms of service',
  'privacy.terms.s1.title': 'What this service is',
  'privacy.terms.s1.body':
    'The app is operated for the club your children are enrolled in, and is used for enrolment, the timetable, attendance, payments, health declarations and messages from the club.',
  'privacy.terms.s2.title': 'Who may use it',
  'privacy.terms.s2.body':
    'The account is for the guardian of an enrolled student, or for an adult student. You sign in with a Google or Apple account; we neither create nor store a password.',
  'privacy.terms.s3.title': 'Your responsibilities',
  'privacy.terms.s3.body':
    'The information you provide — the health declaration above all — must be accurate and current. The coach on the mat sees health flags only, and those flags are derived from your answers. A missing or wrong answer is a safety risk to your child.',
  'privacy.terms.s4.title': 'Payments',
  'privacy.terms.s4.body':
    'The club sets prices and the refund policy. Card payments are processed by uPay, the payment provider, and we do not store card details. A standing order cannot be opened through the app; a payment received that way is marked paid by the club by hand.',
  'privacy.terms.s5.title': 'Fair use',
  'privacy.terms.s5.body':
    'Do not use anyone else’s account, do not attempt to reach data that is not yours, and do not copy information about other students or their families.',
  'privacy.terms.s6.title': 'Availability and changes',
  'privacy.terms.s6.body':
    'The service is provided as is, with no promise of continuous availability. A material change to these terms will show them again and ask you to accept again — agreeing to one version is not agreeing to the next.',
  'privacy.terms.s7.title': 'Closing your account',
  'privacy.terms.s7.body':
    'You can ask for your account to be closed and your details erased at any time from this screen. Records the law requires us to keep — financial records above all — are retained afterwards, without a name.',
  'privacy.terms.s8.title': 'Governing law',
  'privacy.terms.s8.body': 'These terms are governed by Israeli law.',

  // -- privacy policy -----------------------------------------------------------------
  'privacy.policy.title': 'Privacy policy',
  'privacy.policy.s1.title': 'Who is responsible for your data',
  'privacy.policy.s1.body':
    'The club your children are enrolled in is the controller of this data and is responsible for it. The club’s contact details are on the profile screen, and any privacy question goes to the club.',
  'privacy.policy.s2.title': 'What we collect',
  'privacy.policy.s2.body':
    'Student and guardian details — name, date of birth, phone and email; group and timetable assignment; attendance and absence records; charges and payments; the health declaration and the signature on it; the messages sent to you; and a technical record of actions taken in the system.',
  'privacy.policy.s3.title': 'Mandatory or voluntary',
  'privacy.policy.s3.body':
    'Providing student and guardian details and completing the health declaration is a condition of training: without them the club cannot enrol your child and cannot keep them safe on the mat. Consent to publishing photographs is entirely voluntary — refusing does not affect participation, and refusing is not recorded as consent.',
  'privacy.policy.s4.title': 'What we use it for',
  'privacy.policy.s4.body':
    'Managing enrolment and attendance, collecting payment, safety in training, messages from the club to you, and operational reports for the club itself. We do not sell data and we do not use it for advertising.',
  'privacy.policy.s5.title': 'Health information',
  'privacy.policy.s5.body':
    'A health declaration is sensitive data under the law, so it is collected only with the guardian’s explicit consent. The answers and the signature are encrypted in the database and the encryption keys are held outside it. Only a manager may open the full declaration, and every such opening is written to a log that cannot be altered. A coach sees flags only — asthma, allergy — and never the text of an answer.',
  'privacy.policy.s6.title': 'Who we share it with',
  'privacy.policy.s6.body':
    'uPay, the payment provider, for the purpose of taking a payment and nothing else; the infrastructure and storage provider the service runs on; and the sign-in provider you chose, Google or Apple, which verifies who you are. One club’s data is not reachable from another club. We pass data to no one else without your consent, unless the law requires it.',
  'privacy.policy.s7.title': 'How long we keep it',
  'privacy.policy.s7.body':
    'For as long as the student is enrolled, and afterwards for as long as running the club requires. Financial records are kept for about seven years as tax law requires, which is why an erasure request removes the identifying details and leaves the financial record without a name. Automatic deletion after a period of inactivity is planned and is not in service today — until it is, data is deleted only on request.',
  'privacy.policy.s8.title': 'Your rights',
  'privacy.policy.s8.body':
    'To see what is held about you and your children; to correct anything wrong; to have data deleted in the circumstances the law recognises; to object to processing and to have it restricted; to withdraw consent at any time; and to receive your data in a structured, machine-readable file. This screen opens the request; the club is who answers it.',
  'privacy.policy.s9.title': 'Withdrawing consent',
  'privacy.policy.s9.body':
    'A withdrawal is written as a new record and does not erase the consent that preceded it — that is what keeps a record of what was agreed and when. Withdrawing consent to this policy brings the consents screen back and stops your use of the app, because without it there is no basis to continue processing the data.',
  'privacy.policy.s10.title': 'Security',
  'privacy.policy.s10.body':
    'Complete separation between clubs at the database level; permissions by role; encryption of medical answers and of signatures; an action log the system can only append to, never alter or delete; and a record of every opening of a health declaration.',
  'privacy.policy.s11.title': 'Minors',
  'privacy.policy.s11.body':
    'A minor has no legal capacity to consent on their own, so the consent here is given by the guardian. A guardian may exercise any of the rights above on the child’s behalf.',
  'privacy.policy.s12.title': 'Changes and complaints',
  'privacy.policy.s12.body':
    'A change to this text will be shown to you and will ask you to accept again. A privacy question goes to the club first; if you are not answered, you can approach the Privacy Protection Authority at the Ministry of Justice.',

  // -- §6.1 step 5's gate ------------------------------------------------------------
  'privacy.gate.title': 'Consents',
  'privacy.gate.body':
    'Before you can use the app you must accept the terms of service and the privacy policy. Both are required, and each is stored with the date and the version you accepted.',
  'privacy.gate.acceptTerms': 'I have read and accept the terms of service',
  'privacy.gate.acceptPrivacy': 'I have read and accept the privacy policy',
  'privacy.gate.submit': 'Accept and continue',
  'privacy.gate.working': 'Saving…',
  'privacy.gate.mustAccept': 'Tick both boxes to continue',
  'privacy.gate.failed': 'We could not save your acceptance. Please try again.',
  'privacy.gate.show': 'Show the full text',
  'privacy.gate.hide': 'Hide the text',

  'privacy.title': 'Privacy and personal data',
  'privacy.screen.subtitle': 'What is held about you and your children, and what you can do about it',
  'privacy.screen.back': 'Back',
  'privacy.screen.loadFailed': 'We could not load this. Please try again.',
  'privacy.screen.documents': 'The text you accepted',
  'privacy.export.title': 'Data export request',
  'privacy.export.description': 'Everything held about your children, in one file',
  'privacy.export.request': 'Request an export',
  'privacy.export.requested': 'Request received',
  'privacy.export.status.pending': 'Pending',
  'privacy.export.status.running': 'Preparing',
  'privacy.export.status.completed': 'Ready to download',
  'privacy.export.status.failed': 'Preparation failed',
  'privacy.export.status.expired': 'The link has expired',
  'privacy.export.download': 'Download the file',
  'privacy.export.linkExpires': 'The link is available for a limited time',
  'privacy.export.requestAgain': 'Request again',
  'privacy.export.preparingHint': 'Preparation can take a few minutes',
  // The status the worker actually produces today (HB-privacy-worker-unbuilt).
  'privacy.export.failedReason': 'Why it failed',
  'privacy.export.failedHelp':
    'Preparing the file is not available right now. Your request was recorded and has not been cancelled — contact the club and they will provide the data.',
  'privacy.export.none': 'You have not requested an export',

  // -- §11.4's erasure request, and the honest status of it ---------------------------
  'privacy.delete.title': 'Erasure request',
  'privacy.delete.request': 'Request erasure',
  'privacy.delete.confirmTitle': 'Erase this data?',
  'privacy.delete.confirmBody':
    'This cannot be undone. Identifying details are erased, health declarations and signatures are destroyed, and access to the app stops.',
  'privacy.delete.confirm': 'Yes, erase',
  'privacy.delete.cancel': 'Cancel',
  'privacy.delete.requested': 'Your erasure request was recorded',
  'privacy.delete.status.pending': 'Pending',
  'privacy.delete.status.running': 'In progress',
  'privacy.delete.status.completed': 'Completed',
  'privacy.delete.status.failed': 'Erasure failed',
  // The most important line on the screen — see the note in `he/reports.ts`.
  'privacy.delete.failedHelp':
    'The erasure did not run and nothing was deleted. The request was recorded and stays open — contact the club to complete it.',
  'privacy.delete.none': 'You have not requested erasure',

  // -- the request list both screens read --------------------------------------------
  'privacy.requests.title': 'Your requests',
  'privacy.requests.operatorTitle': 'Privacy requests in this club',
  'privacy.requests.operatorSubtitle': 'Exports and erasures that were asked for, and what became of them',
  'privacy.requests.empty': 'No requests',
  'privacy.requests.requestedAt': 'Recorded on',
  'privacy.requests.subject': 'Subject',
  'privacy.requests.kind.export': 'Data export',
  'privacy.requests.kind.deletion': 'Data erasure',
  'privacy.requests.needsAttention': 'Requests that failed',

  // -- §6.1 step 7's photo consent, off the blocking gate on purpose ------------------
  'privacy.photo.title': 'Publishing photographs',
  'privacy.photo.body':
    'May the club publish photographs of your children from training and competitions? You can change your answer at any time, and giving no answer is kept as no consent.',
  'privacy.photo.allow': 'May be published',
  'privacy.photo.disallow': 'May not be published',

  // -- §11.4's anonymization -----------------------------------------------------------
  'privacy.anonymize.title': 'Erase personal details',
  'privacy.anonymize.action': 'Erase details',
  'privacy.anonymize.confirm': 'Confirm erasure',
  'privacy.anonymize.done': 'Details erased',
  'privacy.anonymize.whatHappens': 'Name, date of birth, phone, email and photo are erased. Health declarations and signatures are destroyed',
  'privacy.anonymize.whatRemains': 'Charge and payment records are retained as the law requires, without a name',
  'privacy.anonymize.irreversible': 'This cannot be undone',

  // -- §11.5's retention ----------------------------------------------------------------
  'privacy.retention.title': 'Data retention',
  'privacy.retention.setting': 'Erase automatically after',
  'privacy.retention.months': '{{count}} months',
  'privacy.retention.preview': 'What the next run will erase',
  'privacy.retention.previewCount': '{{count}} students who left',
  'privacy.retention.exempt': 'Exempt from erasure',
  'privacy.retention.exempted': 'Exempted',
  'privacy.retention.empty': 'Nothing due for erasure',

  // -- §11.6's consent -------------------------------------------------------------------
  'privacy.consent.title': 'Consents',
  'privacy.consent.version': 'Version',
  'privacy.consent.givenAt': 'Given on',
  'privacy.consent.revoke': 'Withdraw consent',
  'privacy.consent.revokedRecorded': 'The withdrawal was recorded',
  'privacy.consent.type.terms': 'Terms of service',
  'privacy.consent.type.privacy_policy': 'Privacy policy',
  'privacy.consent.type.photo': 'Publishing photos',
  'privacy.consent.type.medical_flags': 'Sharing health flags with coaches',
  'privacy.consent.type.event': 'Event participation',
  'privacy.photo.allowed': 'Photos may be published',
  'privacy.photo.notAllowed': 'Photos may not be published',
  'privacy.photo.notRecorded': 'No consent recorded',

  // Send-monthly (feature pass 2026-08-27) — emails the report, so a confirm stands
  // between the button and real inboxes.
  'send.button': 'Email monthly report',
  'send.title': 'Send the monthly report?',
  'send.body': 'The report for {{month}} will be sent to your email address.',
  'send.confirm': 'Send',
  'send.cancel': 'Cancel',
  'send.done': 'Report sent by email',

  // -- artboard `4g`'s own strings; see he/reports.ts for what each finding settles ----
  'period.month': 'Month',
  'period.season': 'Season',
  'period.year': 'Year',
  'period.seasonMissing': 'No active season',

  'overview.churn': 'Monthly churn',
  'overview.avgMonthlyRevenue': 'Average monthly revenue',
  'overview.avgAttendance': 'Average attendance',
  'overview.noValue': 'No figure',

  'delta.sincePeriodStart': 'since the period started',
  'delta.vsPrevious': 'vs the previous period',
  'delta.perStudent': 'per student',
  'delta.noChange': 'No change',
  'delta.noComparison': 'No previous period to compare',

  'attendance.decidedCount': 'of {{count}} decided marks',
  'attendance.unmarkedCount': '{{count}} marks left unmarked',
  'attendance.noData': 'No attendance data for this period',

  'financial.collectedVsDebt': 'Revenue vs debt',
  'financial.billed': 'Billed',
  'financial.outstanding': 'Still owed',
  'financial.chartBasis': 'Each column is that month’s total billing',
  'financial.chartLabel': 'Revenue vs debt, by month',
  'financial.monthSummary': 'Billing summary for {{month}}',

  'retention.title': 'Retention by tenure',
  'retention.basis': 'Of those who reached this much tenure, how many made it to the end of it',
  'retention.bucket.m0_3': 'Up to 3 months',
  'retention.bucket.m3_6': '3–6 months',
  'retention.bucket.m6_12': '6–12 months',
  'retention.bucket.m12_plus': 'Over a year',
  'retention.cohort': 'Cohort of {{count}}',
  'retention.noCohort': 'Not enough tenure yet',
  'retention.weakest': 'Weakest stretch',
  'retention.insightEarly':
    'Most departures happen in the first three months — that is where follow-up pays.',
  'retention.undatedDepartures': '{{count}} departures carry no date and are excluded',

  'belts.title': 'Belt promotions this period',
  'belts.chartLabel': 'Belt promotions by rank',
  'belts.promotions': '{{count}} promotions',
  'belts.empty': 'No belts were awarded in this period',

  'export.failed': 'The export failed. Try again.',
  'export.nothing': 'Nothing to export',

}
