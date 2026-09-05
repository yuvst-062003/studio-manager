// A render harness for the profile menu, NOT a shipped entry. Deleted with the other
// previews once the redesign is accepted.
//
// `?open=personal|trainees|payments|club|settings` opens a sheet directly, which is how the
// checkpoint screenshots each one without a click path.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, useTheme } from '@studio/ui'
import { formatAgorot } from '@studio/core'
import { LOCALES } from '@studio/i18n'
import { ParentShell } from './features/shell/ParentShell'
import { ProfileHeader } from './features/people/redesign/ProfileTop'
import { ProfileMenu } from './features/people/redesign/ProfileMenu'
import type { MenuKey } from './features/people/redesign/ProfileMenu'
import {
  ClubSheet,
  MONTH_NAME,
  PaymentsSheet,
  SettingsSheet,
  TraineesSheet,
} from './features/people/redesign/sheets'
import { PersonalDetailsSheet } from './features/people/redesign/PersonalDetails'
import type { MyDetails } from './features/people/redesign/PersonalDetails'
import type { Coverage } from './features/people/redesign/derive'
import type { ProfileChild } from './features/people/redesign/types'
import './tailwind.css'

const ENDONYMS: Record<string, string> = { he: 'עברית', en: 'English', ru: 'Русский' }

const CHILDREN: ProfileChild[] = [
  { id: 'dana', firstName: 'דנה', lastName: 'כהן', displayName: 'דנה כהן', beltName: 'חגורה ירוקה', beltColorHex: '#10b981', groupNames: [], attendancePercent: 94, needsDeclaration: false },
  { id: 'yossi', firstName: 'יוסי', lastName: 'כהן', displayName: 'יוסי כהן', beltName: 'חגורה כחולה', beltColorHex: '#2563eb', groupNames: [], attendancePercent: 88, needsDeclaration: false },
  { id: 'noa', firstName: 'נועה', lastName: 'כהן', displayName: 'נועה כהן', beltName: null, beltColorHex: null, groupNames: [], attendancePercent: 82, needsDeclaration: true },
]

const CLUB = {
  name: 'מועדון ג׳ודו גלדיאטור',
  address: 'רחוב ויצמן 42, כפר סבא',
  phone: '050-8492019',
  email: 'office@gladiator.example',
}

function Preview() {
  const params = new URLSearchParams(window.location.search)
  const theme = useTheme()
  const [locale, setLocale] = useState('he')
  const [open, setOpen] = useState<MenuKey | 'settings' | null>(
    (params.get('open') as MenuKey | 'settings' | null) ?? null,
  )
  const [details, setDetails] = useState<MyDetails>({
    firstName: 'יוסף',
    lastName: 'כהן',
    email: 'yosef@example.com',
    phone: '052-1234567',
  })

  //: `?owed` is a family with a balance; the default is the cheque payer the owner
  //: described — settled for the season, with nothing to do.
  const coverage: Coverage = params.has('owed')
    ? { kind: 'owed', balanceAgorot: 32000, openChargeCount: 2 }
    : { kind: 'covered', year: 2027, month: 6 }

  const close = () => setOpen(null)

  return (
    <ParentShell activeTab="profile" updatesBadgeCount={2}>
      <ProfileHeader familyName="כהן" />
      <ProfileMenu
        onOpen={setOpen}
        onOpenSettings={() => setOpen('settings')}
        attention={{
          payments: coverage.kind === 'owed',
          trainees: CHILDREN.some((child) => child.needsDeclaration),
        }}
      />

      {open === 'personal' ? (
        <PersonalDetailsSheet
          details={details}
          busy={false}
          failed={false}
          onSave={(next) => {
            setDetails(next)
            close()
          }}
          onClose={close}
        />
      ) : null}
      {open === 'trainees' ? <TraineesSheet childList={CHILDREN} onClose={close} /> : null}
      {open === 'payments' ? (
        <PaymentsSheet
          coverage={coverage}
          methodLabel={params.has('owed') ? 'כרטיס אשראי' : 'צ׳קים'}
          methodIsCard={params.has('owed')}
          money={formatAgorot}
          monthName={(month) => MONTH_NAME[month - 1] ?? String(month)}
          onClose={close}
        />
      ) : null}
      {open === 'club' ? <ClubSheet club={CLUB} onClose={close} /> : null}
      {open === 'settings' ? (
        <SettingsSheet
          locale={locale}
          locales={LOCALES}
          localeLabel={(code) => ENDONYMS[code] ?? code}
          onChooseLocale={setLocale}
          theme={theme.preference}
          onChooseTheme={theme.setPreference}
          account={{
            locale: 'he',
            studios: [],
            activeStudioId: null,
            onSwitchStudio: () => {},
            onSignOut: () => {},
          }}
          onClose={close}
        />
      ) : null}
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
