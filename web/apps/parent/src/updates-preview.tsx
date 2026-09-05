// A render harness for checkpoint 3's design review, NOT a shipped entry. Deleted with the
// other previews once the redesign is accepted.
//
// The fixtures mirror the prototype's own feed — a health declaration for נועה, a tournament
// for יוסי, two club announcements, a belt exam and a receipt — so the comparison is of the
// DESIGN and not of two different clubs. Nothing here reaches the API.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@studio/ui'
import { ParentShell } from './features/shell/ParentShell'
import { UpdatesFeed } from './features/comms/redesign/UpdatesFeed'
import { applyFilter, classify, pendingCountOf, waitingCountOf } from './features/comms/redesign/classify'
import type { ActionCatalogue, Notification } from './features/comms/redesign/classify'
import type { UpdateFilter } from './features/comms/redesign/types'
import './tailwind.css'

const KIDS = { s1: 'נועה', s2: 'יוסי', s3: 'דנה' }

const CATALOGUE: ActionCatalogue = {
  health_declaration: { label: 'חתימה', href: '#/' },
  event_rsvp: { label: 'הרשמה', href: '#/events' },
  payment: { label: 'לתשלום', href: '#/payments' },
}

const FEED: Notification[] = [
  {
    id: 'n1', kind: 'health_declaration', created_at: '2026-08-19T08:00:00Z', read_at: null,
    title: 'הצהרת בריאות שנתית', body: 'מועד אחרון: 25.08 (בעוד 4 ימים)',
    action: { kind: 'health_declaration', outstanding: true, subject_name: 'נועה' },
  },
  {
    id: 'n2', kind: 'event_rsvp', created_at: '2026-08-20T08:00:00Z', read_at: null,
    title: 'אליפות המחוז — נתניה', body: 'ההרשמה נסגרת ביום חמישי. עלות: ₪80',
    action: { kind: 'event_rsvp', outstanding: true, subject_name: 'יוסי' },
  },
  {
    id: 'n3', kind: 'announcement', created_at: '2026-08-22T08:00:00Z', read_at: null,
    title: 'חופשת שבועות — אין אימונים', body: 'המועדון סגור בין 1.6 ל-3.6. האימונים יחזרו כרגיל ביום ד׳.',
  },
  {
    id: 'n4', kind: 'announcement', created_at: '2026-08-18T08:00:00Z', read_at: '2026-08-18T10:00:00Z',
    title: 'שיפוץ הדוג׳ו המרכזי', body: 'המזרנים החדשים הותקנו. תודה על הסבלנות!',
  },
  {
    id: 'n5', kind: 'belt_exam', created_at: '2026-08-21T08:00:00Z', read_at: null,
    payload: { student_id: 's3' },
    title: 'מבחן חגורה ירוקה — עברה בהצלחה', body: 'דנה עברה את המבחן בציון מצוין. החגורה תוענק בטקס.',
  },
  {
    id: 'n6', kind: 'payment', created_at: '2026-08-17T08:00:00Z', read_at: '2026-08-17T09:00:00Z',
    title: 'קבלה על תשלום שכר לימוד', body: 'קבלה מס׳ 2026-1183 על סך ₪320',
    action: { kind: 'payment', outstanding: false, settled_at: '2026-08-17T09:00:00Z', subject_name: 'יוסי' },
  },
]

function Preview() {
  const params = new URLSearchParams(window.location.search)
  const [filter, setFilter] = useState<UpdateFilter>({ kind: 'all' })
  const state = params.get('state')
  const rows = state === 'empty' ? [] : FEED
  const groups = classify(rows, KIDS, CATALOGUE)

  return (
    <ParentShell activeTab="updates" updatesBadgeCount={waitingCountOf(groups)}>
      <UpdatesFeed
        groups={applyFilter(groups, filter)}
        filter={filter}
        onFilterChange={setFilter}
        childNames={['נועה', 'יוסי', 'דנה']}
        pendingCount={pendingCountOf(groups)}
        waitingCount={waitingCountOf(groups)}
        unreadCount={[...groups.club, ...groups.personal].filter((r) => r.isNew).length}
        state={state === 'loading' ? 'loading' : state === 'failed' ? 'failed' : 'ready'}
        onRetry={() => {}}
        hasMore={!params.has('nomore')}
        onLoadMore={() => {}}
        onOpen={() => {}}
        onMarkAllRead={() => {}}
        dateLabel={(iso) => new Date(iso).toLocaleDateString('he-IL')}
      />
    </ParentShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Preview />
    </ThemeProvider>
  </StrictMode>,
)
