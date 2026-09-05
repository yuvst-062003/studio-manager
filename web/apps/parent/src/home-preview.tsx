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
  //: Stands in for the server's own record of what has been reported. `Resolve` re-reads
  //: `/me/attendance-intents` after a write and passes the result down WITHOUT remounting
  //: the screen; the harness has to do the same, or the sheet showing the run's results is
  //: torn down before anyone can read it. Keying `HomeScreen` on `epoch` did exactly that
  //: and made the whole-day report look like it silently closed.
  const [reported, setReported] = useState<Record<string, 'not_coming'>>(
    params.has('reported') ? { 's2:dana': 'not_coming' } : {},
  )
  //: `?state=` walks the three the prototype cannot show: an empty day, a still-loading
  //: read, and a failed one.
  const state = params.get('state')
  //: `?clean` clears the urgent banner, which is the state a family in good standing sees.
  const clean = params.has('clean')

  return (
    <ParentShell activeTab="home" updatesBadgeCount={2}>
      <HomeScreen
        locale="he"
        clubName="מועדון ג׳ודו גלדיאטור"
        familyName="כהן"
        childList={state === 'loading' ? null : CHILDREN}
        lessons={state === 'loading' ? null : state === 'empty' ? [] : LESSONS}
        lessonsFailed={state === 'failed'}
        intents={reported}
        urgent={clean ? { debtAgorot: null, childrenNeedingDeclaration: [] } : { debtAgorot: 32000, childrenNeedingDeclaration: ['נועה'] }}
        debtLabel={clean ? null : '₪320'}
        unreadCount={2}
        todayKey="2026-08-23"
        writer={{
          reportAbsence: async (sessionId, studentId) => {
            await new Promise((r) => setTimeout(r, 250))
            //: `?fail` makes the LAST child's write refuse, so the partial-failure state the
            //: prototype cannot have is reachable in a screenshot.
            if (params.has('fail') && studentId === 'yossi') {
              throw Object.assign(new Error('too_late'), { code: 'too_late' })
            }
            setReported((current) => ({ ...current, [`${sessionId}:${studentId}`]: 'not_coming' }))
          },
        }}
        cancelReasonLabel={() => 'האימון בוטל על ידי המועדון'}
        //: `Resolve` re-reads the intents here. The harness has already updated its own
        //: `reported` map inside the writer, so there is nothing further to do.
        onAbsenceReported={() => {}}
        onRetry={() => {}}
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
