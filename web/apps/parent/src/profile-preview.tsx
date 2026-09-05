// A render harness for checkpoint 5's design review, NOT a shipped entry. Deleted with the
// other previews once the redesign is accepted.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, useTheme } from '@studio/ui'
import { formatAgorot } from '@studio/core'
import { LOCALES } from '@studio/i18n'
import { ParentShell } from './features/shell/ParentShell'
import { ProfileTop } from './features/people/redesign/ProfileTop'
import { ProfileBody } from './features/people/redesign/ProfileBody'
import { ContactSheet } from './features/people/redesign/ContactSheet'
import type { ProfileChild } from './features/people/redesign/types'
import './tailwind.css'

const ENDONYMS: Record<string, string> = { he: 'עברית', en: 'English', ru: 'Русский' }

const CHILDREN: ProfileChild[] = [
  { id: 'dana', firstName: 'דנה', lastName: 'כהן', displayName: 'דנה כהן', beltName: 'חגורה ירוקה', beltColorHex: '#10b981', groupNames: ['קדטים'], attendancePercent: 94, needsDeclaration: false },
  { id: 'yossi', firstName: 'יוסי', lastName: 'כהן', displayName: 'יוסי כהן', beltName: 'חגורה כחולה', beltColorHex: '#2563eb', groupNames: ['בוגרים'], attendancePercent: 88, needsDeclaration: false },
  { id: 'noa', firstName: 'נועה', lastName: 'כהן', displayName: 'נועה כהן', beltName: null, beltColorHex: null, groupNames: ['צעירים'], attendancePercent: 82, needsDeclaration: true },
]

const ATTENDANCE = [
  { studentId: 'dana', attended: 15, marked: 16, percent: 94 },
  { studentId: 'yossi', attended: 14, marked: 16, percent: 88 },
  { studentId: 'noa', attended: 0, marked: 0, percent: 0 },
]

const PURCHASES = [
  { id: 'a', label: 'ג׳ודוגי תחרותי · מידה 140', amountAgorot: 42000, dueDate: '2026-08-20', status: 'open' },
  { id: 'b', label: 'חגורה רשמית', amountAgorot: 6500, dueDate: '2026-08-12', status: 'settled' },
  { id: 'c', label: 'מגן שיניים', amountAgorot: 4500, dueDate: '2026-07-30', status: 'settled' },
]

const CLUB = { name: 'מועדון ג׳ודו גלדיאטור', address: 'רחוב ויצמן 42, כפר סבא', phone: '050-8492019' }

function Preview() {
  const params = new URLSearchParams(window.location.search)
  const theme = useTheme()
  const [locale, setLocale] = useState('he')
  const [selected, setSelected] = useState<string | null>('dana')
  const [contact, setContact] = useState(params.has('contact'))
  const settled = params.has('settled')

  return (
    <ParentShell activeTab="profile" updatesBadgeCount={2}>
      <ProfileTop
        familyName="כהן"
        locale={locale}
        locales={LOCALES}
        localeLabel={(code) => ENDONYMS[code] ?? code}
        onChooseLocale={setLocale}
        theme={theme.preference}
        onChooseTheme={theme.setPreference}
        billing={
          params.has('loading')
            ? null
            : {
                balanceAgorot: settled ? 0 : 32000,
                chargedAgorot: 128000,
                paidAgorot: settled ? 128000 : 96000,
                openChargeCount: settled ? 0 : 2,
                methodLabel: params.has('nomethod') ? null : 'כרטיס אשראי',
              }
        }
        onOpenContact={() => setContact(true)}
        money={formatAgorot}
      />
      <ProfileBody
        childList={CHILDREN}
        selectedChildId={selected}
        onSelectChild={setSelected}
        attendance={params.has('loading') ? null : ATTENDANCE}
        purchases={params.has('loading') ? null : params.has('nopurchases') ? [] : PURCHASES}
        club={CLUB}
        money={formatAgorot}
        dateLabel={(iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('he-IL')}
      />
      {contact ? <ContactSheet club={CLUB} onClose={() => setContact(false)} /> : null}
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
