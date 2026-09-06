import type { Bundle } from '../types'

/** Mirror of `he/tasks.ts`. `en` is `strict`. */
export const tasks: Bundle = {
  'title': 'Tasks',
  'empty': 'Nothing needs attention',
  'emptyHint': 'The list updates automatically as things happen at the club',

  'openCount': '{{count}} open tasks',
  'openCount.one': 'One open task',

  'filter.groupLabel': 'Filter tasks',
  'filter.all': 'All',
  'filter.urgent': 'Urgent',
  'filter.followUp': 'Follow-up',

  'closeSession.scope': 'My session',
  'closeSession.badge': 'Urgent',
  'closeSession.title': 'Close an open session',
  'closeSession.alert':
    'The session has ended and attendance has not been taken yet. Open the roster and mark everyone.',
  'closeSession.action': 'Open attendance',

  'healthForm.badge': 'Health form',
  'healthForm.subtitle': 'Missing health declaration',
  'healthForm.alert':
    'No health declaration is on file for this student. Contact the parent and ask them to complete it.',
  'healthForm.action': 'Contact parent',
  'healthForm.message':
    'Hi, this is a reminder from the judo club to complete the health declaration for {{name}} before the next session. Thank you!',

  'callParent.scope': 'Student follow-up',
  'callParent.badge': 'Follow-up call',
  'callParent.title': 'Call the parent — {{name}}',
  'callParent.missedCount': '{{count}} sessions missed in a row',
  'callParent.missedCount.one': 'One session missed in a row',
  'callParent.alert':
    'This student has missed three sessions in a row. A warm check-in call with the family is recommended.',
  'callParent.action': 'Contact',
  'callParent.message':
    'Hi, we noticed {{name}} has missed a few sessions in a row. We wanted to check in and make sure everything is okay.',
  'callParent.tick': 'Mark as done',

  'cash.scope': 'Billing',
  'cash.badge': 'Awaiting confirmation',
  'cash.title': 'Cash payments waiting to be confirmed',
  'cash.count': '{{count}} payments waiting',
  'cash.count.one': 'One payment waiting',
  'cash.alert':
    'Cash or cheque payment promises have come in and have not been confirmed yet. Review the list and confirm or decline each one.',
  'cash.action': 'Open payments',

  'healthReview.scope': 'Manager approval',
  'healthReview.badge': 'Awaiting review',
  'healthReview.action': 'Open student card',
}
