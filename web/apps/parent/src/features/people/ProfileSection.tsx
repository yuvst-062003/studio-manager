// 12i, routed (ship-audit B4). `ProfileAndLeave` was built and tested in W2 and mounted
// by nothing — the profile tab it was drawn for stayed disabled through W6. This is the
// container that owns the screen's reads, so the screen itself stays the presentational
// component every existing test renders directly.
//
// Screen 8 of the 2026-09-01 redesign replaced what it renders: `GuardianSettings`, the
// settings-list arrangement, instead of `ProfileAndLeave`'s list of children whose only
// control was the destructive one. Five reads now, because the tab finally shows the
// material the design names — the parent's own record, how they pay, and the club's
// address — and every one of them is best-effort except the first two: a studio read that
// 403s must not blank a screen whose subject is the parent.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { GuardianSettings } from './GuardianSettings'
import { makePeopleClient, useMyStudents } from './peopleClient'
import type { MyProfile } from './peopleClient'
import { makeParentCommsClient } from '../comms/commsClient'
import { usePushRegistration } from '../comms/usePushRegistration'

type StudioInfo = { name: string; address: string | null; phone: string | null }

type PromiseRow = { method?: string | null }

export function ProfileSection({
  locale,
  onLocaleChange,
}: {
  locale: Locale
  onLocaleChange: (next: Locale) => void
}) {
  const client = useMemo(() => makePeopleClient(apiFetch), [])
  const commsClient = useMemo(() => makeParentCommsClient(apiFetch), [])
  const mine = useMyStudents(client)
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [studio, setStudio] = useState<StudioInfo | null>(null)
  const [method, setMethod] = useState<string | null>(null)
  const push = usePushRegistration(commsClient)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    let live = true
    client
      .myProfile()
      .then((body) => live && setProfile(body))
      .catch(() => live && setProfile(null))
    return () => {
      live = false
    }
  }, [client])

  useEffect(() => {
    let live = true
    // Best-effort, both of them. The club's address and the family's payment method are
    // enrichment; neither is worth turning the parent's own screen into an error page.
    void apiFetch('/api/v1/me/studio')
      .then(async (response) => {
        if (!live || !response.ok) return
        setStudio((await response.json()) as StudioInfo)
      })
      .catch(() => undefined)
    void apiFetch('/api/v1/me/payment-promises')
      .then(async (response) => {
        if (!live || !response.ok) return
        const body = (await response.json()) as { items?: PromiseRow[] }
        const latest = body.items?.[0]?.method ?? null
        setMethod(latest)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  // Quiet while loading: this is one screen, and half of it flashing in reads as a family
  // whose other parent vanished.
  if (mine.status === 'loading' || profile === null) return null

  const enabled = push.state === 'registered'
  // A switch is offered only where the answer can actually change. On an iOS browser tab
  // §6.5 says push does not exist at all — "absent, not denied" — and a control that
  // cannot move is worse than no control.
  const canSwitch = push.state !== 'unsupported' && push.state !== 'unsupported-ios-tab'

  return (
    <GuardianSettings
      client={client}
      locale={locale}
      notifications={
        canSwitch
          ? {
              enabled,
              busy: switching,
              onChange: (next) => {
                setSwitching(true)
                const done = () => setSwitching(false)
                if (next) void Promise.resolve(push.ask()).finally(done)
                else void Promise.resolve(push.turnOff()).finally(done)
              },
            }
          : null
      }
      onLocaleChange={onLocaleChange}
      paymentMethod={method ? t(locale, `billing.method.${method}`) : null}
      profile={profile}
      studio={studio}
      students={mine.status === 'ready' ? mine.students : []}
    />
  )
}
