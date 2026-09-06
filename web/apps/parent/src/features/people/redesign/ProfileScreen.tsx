// פרופיל — the redesigned profile tab, composed. Checkpoint 5 of the parent-app redesign,
// and the last of the four.
//
// §4 moved the MONEY here — "balance, payment method, history" — on top of what this tab
// already held, so it is now the app's widest read: six endpoints for one screen. That is
// not accidental sprawl. Each one answers a section the design draws, and the alternative
// (one aggregate endpoint) would be a route whose shape is dictated by one client's layout.
//
// **Every read is independent and none of them can blank the screen.** A club that has not
// filled in its address, a balance endpoint having a bad minute, a family with no marked
// attendance yet — each shows as that section's own absence and leaves the rest alone.
// `ProfileSection`'s own header records why: "a studio read that 403s must not blank a
// screen whose subject is the parent."
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, formatAgorot, formatMonthLabel } from '@studio/core'
import { useTheme } from '@studio/ui'
import { ENDONYM } from '@studio/ui'
import { LOCALES, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { needsFullDeclaration } from '../../health/HealthGate'
import type { AccountControlsProps } from '../../shell/AccountControls'
import { ProfileHeader } from './ProfileTop'
import { ProfileMenu } from './ProfileMenu'
import type { MenuKey } from './ProfileMenu'
import { ClubSheet, PaymentsSheet, SettingsSheet, TraineesSheet } from './sheets'
import { PersonalDetailsSheet } from './PersonalDetails'
import { Sheet } from './Sheet'
import { SheetFailed } from './SheetFailed'
import type { MyDetails } from './PersonalDetails'
import { coverageFrom, familyNameOf } from './derive'
import type { Coverage, CoverageCharge } from './derive'
import type { ClubDetails, ProfileChild } from './types'

type StudentRow = {
  id: string
  first_name: string
  last_name: string
  status: string
  health_status: string
  agreement_complete?: boolean | null
  current_belt_name?: string | null
  current_belt_color_hex?: string | null
  attendance_percent?: number | null
  group_names?: string[]
}

export function ProfileScreen({
  locale,
  onLocaleChange,
  account,
}: {
  locale: Locale
  onLocaleChange: (next: Locale) => void
  account: AccountControlsProps
}) {
  const theme = useTheme()
  const [children, setChildren] = useState<readonly ProfileChild[] | null>(null)
  const [club, setClub] = useState<ClubDetails | null>(null)
  const [details, setDetails] = useState<MyDetails | null>(null)
  const [balance, setBalance] = useState<{ balanceAgorot: number; openChargeCount: number } | null>(
    null,
  )
  const [methodLabel, setMethodLabel] = useState<string | null>(null)
  const [methodIsCard, setMethodIsCard] = useState(false)
  const [charges, setCharges] = useState<readonly CoverageCharge[] | null>(null)

  const [open, setOpen] = useState<MenuKey | 'settings' | null>(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsFailed, setDetailsFailed] = useState(false)
  // WHICH READ FAILED, not "did anything". The sheets open one at a time and each one
  // should answer for its own data — a families sheet greyed out because the CLUB's
  // address could not be read would be its own small lie.
  const [failed, setFailed] = useState<
    Readonly<Record<'children' | 'details' | 'money' | 'club', boolean>>
  >({ children: false, details: false, money: false, club: false })
  // Bumped by the retry button. `useEffect` re-runs the whole block, which is what a retry
  // should do: the reads are independent and re-reading one that succeeded costs nothing
  // next to a screen that stays half wrong.
  const [epoch, setEpoch] = useState(0)
  const retry = useCallback(() => {
    setFailed({ children: false, details: false, money: false, club: false })
    setEpoch((n) => n + 1)
  }, [])

  useEffect(() => {
    let live = true

    void apiFetch('/api/v1/me/students')
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as { items: StudentRow[] }
        if (!live) return
        setChildren(
          body.items.map((row) => ({
            id: row.id,
            firstName: row.first_name,
            lastName: row.last_name,
            displayName: `${row.first_name} ${row.last_name}`,
            beltName: row.current_belt_name ?? null,
            beltColorHex: row.current_belt_color_hex ?? null,
            groupNames: row.group_names ?? [],
            attendancePercent: row.attendance_percent ?? null,
            // The SAME predicate §6.1's gate uses. Two spellings of "does this child still
            // owe something" is how a card comes to disagree with the gate that blocks the
            // app — which `App.tsx` records having already happened once.
            needsDeclaration: needsFullDeclaration({
              ...row,
              display_name: `${row.first_name} ${row.last_name}`,
            } as Parameters<typeof needsFullDeclaration>[0]),
          })),
        )
      })
      // NOT `setChildren([])`. An empty roster is a family with no children in the club,
      // and telling that to a family that has three is the failure this whole flag exists
      // for.
      .catch(() => live && setFailed((current) => ({ ...current, children: true })))

    void apiFetch('/api/v1/me/profile')
      .then(async (response) => {
        if (!live) return
        // `fetch` RESOLVES on a 4xx/5xx, so the flag has to be set here and not only in
        // the `catch` — which is how the first version of this shipped still silent.
        if (!response.ok) return setFailed((current) => ({ ...current, details: true }))
        const body = (await response.json()) as {
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
        }
        setDetails({
          firstName: body.first_name,
          lastName: body.last_name,
          email: body.email,
          phone: body.phone,
        })
      })
      .catch(() => live && setFailed((current) => ({ ...current, details: true })))

    void apiFetch('/api/v1/me/studio')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setFailed((current) => ({ ...current, club: true }))
        const body = (await response.json()) as ClubDetails
        setClub({
          name: body.name,
          address: body.address ?? null,
          phone: body.phone ?? null,
          email: body.email ?? null,
        })
      })
      .catch(() => live && setFailed((current) => ({ ...current, club: true })))

    void apiFetch('/api/v1/me/balance')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setFailed((current) => ({ ...current, money: true }))
        const body = (await response.json()) as {
          balance_agorot: number
          open_charge_count: number
        }
        setBalance({
          balanceAgorot: body.balance_agorot,
          openChargeCount: body.open_charge_count,
        })
      })
      .catch(() => live && setFailed((current) => ({ ...current, money: true })))

    void apiFetch('/api/v1/me/payment-promises')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setFailed((current) => ({ ...current, money: true }))
        const body = (await response.json()) as { items?: { method?: string | null }[] }
        const method = body.items?.[0]?.method ?? null
        setMethodLabel(method ? t(locale, `billing.method.${method}`) : null)
        // The PCI note is only true for a card payer; see `PaymentsSheet`.
        setMethodIsCard(method === 'upay_card' || method === 'card')
      })
      .catch(() => live && setFailed((current) => ({ ...current, money: true })))

    // The charges are read for ONE question: which month is already paid for. `coverageFrom`
    // takes the furthest settled tuition period, which is how a family that wrote cheques
    // for the season learns they are covered until June rather than reading twelve rows.
    void apiFetch('/api/v1/me/charges')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setFailed((current) => ({ ...current, money: true }))
        const body = (await response.json()) as { items: CoverageCharge[] }
        setCharges(body.items)
      })
      .catch(() => live && setFailed((current) => ({ ...current, money: true })))

    return () => {
      live = false
    }
  }, [locale, epoch])

  const familyName = useMemo(
    () => (children === null ? null : familyNameOf(children.map((child) => child.lastName))),
    [children],
  )

  const coverage: Coverage | null = useMemo(
    () =>
      balance === null || charges === null
        ? null
        : coverageFrom(balance.balanceAgorot, balance.openChargeCount, charges),
    [balance, charges],
  )

  const money = useCallback((agorot: number) => formatAgorot(agorot), [])

  const saveDetails = useCallback((next: MyDetails) => {
    setSavingDetails(true)
    setDetailsFailed(false)
    void apiFetch('/api/v1/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: next.firstName.trim(),
        last_name: next.lastName.trim(),
        email: next.email,
        phone: next.phone,
      }),
    })
      .then((response) => {
        setSavingDetails(false)
        if (!response.ok) return setDetailsFailed(true)
        // The screen shows what the server ACCEPTED, and the sheet closes only then.
        setDetails(next)
        setOpen(null)
      })
      .catch(() => {
        setSavingDetails(false)
        setDetailsFailed(true)
      })
  }, [])

  const close = useCallback(() => {
    setOpen(null)
    setDetailsFailed(false)
  }, [])

  return (
    <section aria-label={t(locale, 'people.profile.title')} data-testid="parent-profile">
      <ProfileHeader familyName={familyName} locale={locale} />

      <ProfileMenu
        locale={locale}
        onOpen={setOpen}
        onOpenSettings={() => setOpen('settings')}
        // A dot, never a number: "בלי המידע עצמו" was the instruction, and a silent row
        // would hide an unpaid balance behind a popup.
        attention={{
          payments: coverage?.kind === 'owed',
          trainees: (children ?? []).some((child) => child.needsDeclaration),
        }}
      />

      {open === 'personal' && details === null ? (
        <Sheet
          title={t(locale, 'people.profile.personalSheetTitle')}
          locale={locale}
          testId="sheet-personal-failed"
          onClose={close}
        >
          <SheetFailed locale={locale} onRetry={retry} />
        </Sheet>
      ) : null}

      {open === 'personal' && details ? (
        <PersonalDetailsSheet
          locale={locale}
          details={details}
          busy={savingDetails}
          failed={detailsFailed}
          onSave={saveDetails}
          onClose={close}
        />
      ) : null}

      {open === 'trainees' ? (
        <TraineesSheet
          childList={children ?? []}
          locale={locale}
          failed={failed.children}
          onRetry={retry}
          onClose={close}
        />
      ) : null}

      {open === 'payments' ? (
        <PaymentsSheet
          coverage={coverage}
          locale={locale}
          failed={failed.money}
          onRetry={retry}
          methodLabel={methodLabel}
          methodIsCard={methodIsCard}
          money={money}
          monthLabel={(year, month) => formatMonthLabel(year, month, locale)}
          onClose={close}
        />
      ) : null}

      {open === 'club' ? (
        <ClubSheet
          club={club}
          locale={locale}
          failed={failed.club}
          onRetry={retry}
          onClose={close}
        />
      ) : null}

      {open === 'settings' ? (
        <SettingsSheet
          locale={locale}
          locales={LOCALES}
          localeLabel={(code) => ENDONYM[code as Locale]}
          onChooseLocale={(code) => onLocaleChange(code as Locale)}
          theme={theme.preference}
          onChooseTheme={theme.setPreference}
          account={{ ...account, locale }}
          onClose={close}
        />
      ) : null}
    </section>
  )
}
