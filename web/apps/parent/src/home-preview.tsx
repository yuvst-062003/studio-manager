// A render harness for checkpoint 2's design review, NOT a shipped entry — the same
// arrangement `wizard-preview.tsx` and `shell-preview.tsx` record. Deleted with them.
//
// The fixtures deliberately MIRROR the prototype's own seed data (three children, the same
// belts, the same two Tuesday lessons) so the comparison is of the DESIGN and not of two
// different families. Everything here is fake; nothing reaches the API.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@studio/ui'
import { ParentShell } from './features/shell/ParentShell'
import { HomeScreen } from './features/home/redesign/HomeScreen'
import type { Lesson } from './features/home/redesign/derive'
import type { HomeChild } from './features/home/redesign/types'
import './tailwind.css'

const CHILDREN: HomeChild[] = [
  { id: 'dana', firstName: 'דנה', displayName: 'דנה כהן', groupNames: ['אימון טכניקה וקאטה'], beltColorHex: '#10b981', beltName: 'ירוקה' },
  { id: 'yossi', firstName: 'יוסי', displayName: 'יוסי כהן', groupNames: ['אימון רנדורי מורחב'], beltColorHex: '#2563eb', beltName: 'כחולה' },
  { id: 'noa', firstName: 'נועה', displayName: 'נועה כהן', groupNames: ['ג׳ודו צעירים — יסודות'], beltColorHex: '#f59e0b', beltName: 'צהובה' },
]

//: 2026-08-25 is the prototype's own selected day. Times are UTC and land on 18:00 / 16:45
//: in Jerusalem (UTC+3 in August), which is what the prototype's cards print.
const LESSONS: Lesson[] = [
  { id: 's1', groupName: 'אימון רנדורי מורחב', startsAt: '2026-08-25T15:00:00Z', endsAt: '2026-08-25T16:15:00Z', locationName: 'אולם מרכזי', coachName: 'מאמן ולדי', status: 'scheduled' },
  { id: 's2', groupName: 'אימון טכניקה וקאטה', startsAt: '2026-08-25T13:45:00Z', endsAt: '2026-08-25T14:45:00Z', locationName: 'דוג׳ו משני', coachName: 'מאמנת נועה', status: 'scheduled' },
  { id: 's3', groupName: 'ג׳ודו צעירים — יסודות', startsAt: '2026-08-26T14:00:00Z', endsAt: '2026-08-26T14:45:00Z', locationName: 'דוג׳ו משני', coachName: 'מאמנת נועה', status: 'scheduled' },
]

function Preview() {
  const params = new URLSearchParams(window.location.search)
  const [epoch, setEpoch] = useState(0)
  //: `?state=` walks the three the prototype cannot show: an empty day, a still-loading
  //: read, and a failed one.
  const state = params.get('state')
  //: `?clean` clears the urgent banner, which is the state a family in good standing sees.
  const clean = params.has('clean')

  return (
    <ParentShell activeTab="home" updatesBadgeCount={2}>
      <HomeScreen
        key={epoch}
        locale="he"
        clubName="מועדון ג׳ודו גלדיאטור"
        familyName="כהן"
        childList={state === 'loading' ? null : CHILDREN}
        lessons={state === 'loading' ? null : state === 'empty' ? [] : LESSONS}
        lessonsFailed={state === 'failed'}
        intents={params.has('reported') ? { 's2:dana': 'not_coming' } : {}}
        urgent={clean ? { debtAgorot: null, childrenNeedingDeclaration: [] } : { debtAgorot: 32000, childrenNeedingDeclaration: ['נועה'] }}
        debtLabel={clean ? null : '₪320'}
        unreadCount={2}
        todayKey="2026-08-23"
        writer={{ reportAbsence: async () => { await new Promise((r) => setTimeout(r, 400)) } }}
        cancelReasonLabel={() => 'האימון בוטל על ידי המועדון'}
        onAbsenceReported={() => setEpoch((n) => n + 1)}
        onRetry={() => setEpoch((n) => n + 1)}
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
