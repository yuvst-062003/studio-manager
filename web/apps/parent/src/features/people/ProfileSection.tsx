// 12i, routed (ship-audit B4). `ProfileAndLeave` was built and tested in W2 and mounted
// by nothing — the profile tab it was drawn for stayed disabled through W6. This is the
// container that owns its two reads, so the screen itself stays the presentational
// component every existing test renders directly.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { ProfileAndLeave } from './ProfileAndLeave'
import { makePeopleClient, useMyStudents } from './peopleClient'
import type { GuardianOut } from './peopleClient'

export function ProfileSection({ locale }: { locale: Locale }) {
  const client = useMemo(() => makePeopleClient(apiFetch), [])
  const mine = useMyStudents(client)
  const [guardians, setGuardians] = useState<readonly GuardianOut[] | null>(null)

  useEffect(() => {
    let live = true
    client
      .myGuardians()
      .then((body) => live && setGuardians(body.items))
      .catch(() => live && setGuardians([]))
    return () => {
      live = false
    }
  }, [client])

  // Quiet while loading: 12i is one screen, and half of it flashing in first reads as a
  // family whose other parent vanished.
  if (mine.status === 'loading' || guardians === null) return null

  return (
    <ProfileAndLeave
      students={mine.status === 'ready' ? mine.students : []}
      guardians={[...guardians]}
      locale={locale}
      client={client}
    />
  )
}
