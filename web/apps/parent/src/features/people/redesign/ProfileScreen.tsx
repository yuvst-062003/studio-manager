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
import { apiFetch, formatAgorot, formatDateInStudioZone, studioDayKey } from '@studio/core'
import { useTheme } from '@studio/ui'
import { ENDONYM } from '@studio/ui'
import { LOCALES, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { needsFullDeclaration } from '../../health/HealthGate'
import { AccountControls } from '../../shell/AccountControls'
import type { AccountControlsProps } from '../../shell/AccountControls'
import {
  ProfileBillingBlock,
  ProfileContactCta,
  ProfileHeader,
  ProfilePreferences,
} from './ProfileTop'
import {
  ProfileAttendance,
  ProfileDojo,
  ProfileLinks,
  ProfilePurchases,
  ProfileTrainees,
} from './ProfileBody'
import { PersonalDetailsSheet, ProfilePersonalDetails } from './PersonalDetails'
import type { MyDetails } from './PersonalDetails'
import { ContactSheet } from './ContactSheet'
import { familyNameOf, purchasesFrom, summariseAttendance } from './derive'
import type { AttendanceRow } from './derive'
import type { ClubDetails, ProfileBilling, ProfileChild, PurchaseRow } from './types'

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

/** How far back the attendance card looks. 30 days, inside the route's own 62-day cap. */
const WINDOW_DAYS = 30

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
  const [billing, setBilling] = useState<ProfileBilling | null>(null)
  const [club, setClub] = useState<ClubDetails | null>(null)
  const [attendanceRows, setAttendanceRows] = useState<readonly AttendanceRow[] | null>(null)
  const [purchases, setPurchases] = useState<readonly PurchaseRow[] | null>(null)
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const [details, setDetails] = useState<MyDetails | null>(null)
  const [editingDetails, setEditingDetails] = useState(false)
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsFailed, setDetailsFailed] = useState(false)

  useEffect(() => {
    let live = true

    void apiFetch('/api/v1/me/students')
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as { items: StudentRow[] }
        if (!live) return
        const mapped = body.items.map((row) => ({
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
        }))
        setChildren(mapped)
        setSelectedChildId((current) => current ?? mapped[0]?.id ?? null)
      })
      .catch(() => live && setChildren([]))

    void apiFetch('/api/v1/me/balance')
      .then(async (response) => {
        if (!response.ok || !live) return
        const body = (await response.json()) as {
          balance_agorot: number
          charged_agorot: number
          paid_agorot: number
          open_charge_count: number
        }
        setBilling((current) => ({
          balanceAgorot: body.balance_agorot,
          chargedAgorot: body.charged_agorot,
          paidAgorot: body.paid_agorot,
          openChargeCount: body.open_charge_count,
          // Kept if the promises read landed first — the two fill different halves of one
          // object and neither should clear the other's work.
          methodLabel: current?.methodLabel ?? null,
        }))
      })
      .catch(() => undefined)

    void apiFetch('/api/v1/me/payment-promises')
      .then(async (response) => {
        if (!response.ok || !live) return
        const body = (await response.json()) as { items?: { method?: string | null }[] }
        const method = body.items?.[0]?.method ?? null
        setBilling((current) =>
          current
            ? { ...current, methodLabel: method }
            : {
                balanceAgorot: 0,
                chargedAgorot: 0,
                paidAgorot: 0,
                openChargeCount: 0,
                methodLabel: method,
              },
        )
      })
      .catch(() => undefined)

    void apiFetch('/api/v1/me/profile')
      .then(async (response) => {
        if (!response.ok || !live) return
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
      .catch(() => undefined)

    void apiFetch('/api/v1/me/studio')
      .then(async (response) => {
        if (!response.ok || !live) return
        const body = (await response.json()) as ClubDetails
        setClub({
          name: body.name,
          address: body.address ?? null,
          phone: body.phone ?? null,
          email: body.email ?? null,
        })
      })
      .catch(() => undefined)

    const today = new Date()
    const from = new Date(today.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
    void apiFetch(
      `/api/v1/me/attendance?from=${studioDayKey(from)}&to=${studioDayKey(today)}`,
    )
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setAttendanceRows([])
        const body = (await response.json()) as { items: AttendanceRow[] }
        setAttendanceRows(body.items)
      })
      .catch(() => live && setAttendanceRows([]))

    void apiFetch('/api/v1/me/charges')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setPurchases([])
        const body = (await response.json()) as {
          items: {
            id: string
            label?: string | null
            amount_agorot: number
            due_date: string
            status: string
            created_by: string
          }[]
        }
        setPurchases(purchasesFrom(body.items))
      })
      .catch(() => live && setPurchases([]))

    return () => {
      live = false
    }
  }, [])

  const attendance = useMemo(
    () =>
      attendanceRows === null || children === null
        ? null
        : summariseAttendance(attendanceRows, children),
    [attendanceRows, children],
  )

  const familyName = useMemo(
    () => (children === null ? null : familyNameOf(children.map((child) => child.lastName))),
    [children],
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
        // The screen shows what the server ACCEPTED, and the sheet closes only then. A
        // sheet that closed on the tap would leave a parent believing a correction landed
        // that the server refused.
        setDetails(next)
        setEditingDetails(false)
      })
      .catch(() => {
        setSavingDetails(false)
        setDetailsFailed(true)
      })
  }, [])

  return (
    <section aria-label={t(locale, 'people.profile.title')} data-testid="parent-profile">
      {/* THE ORDER IS THE OWNER'S, 2026-09-06, and it is not the prototype's.
       *
       *   פרטים אישיים · נוכחות · תשלומים · מתאמנים · רכישות · דוג׳ו · שפה ובהירות · קשר
       *
       * Attendance came from the middle of the page to the top ("הסיכום נוכחות צריך להיות
       * בתחילת העמוד"); language and brightness went the other way, from the top to the
       * bottom ("את השפה או הבהירות תוריד לסוף העמוד"); and contact is last of all. The
       * sections are separate components precisely so this list is the only thing that has
       * to change when the order does. */}
      <ProfileHeader familyName={familyName} />

      <ProfilePersonalDetails details={details} onEdit={() => setEditingDetails(true)} />

      <ProfileAttendance
        childList={children ?? []}
        selectedChildId={selectedChildId}
        onSelectChild={setSelectedChildId}
        attendance={attendance}
      />

      <ProfileBillingBlock billing={billing} money={money} />

      <ProfileTrainees childList={children ?? []} />

      <ProfilePurchases
        purchases={purchases}
        money={money}
        // A `YYYY-MM-DD` due date, read at MIDDAY so no zone can move it to the day
        // before — the same trap `derive.ts` documents for the week strip.
        dateLabel={(isoDate) => formatDateInStudioZone(`${isoDate}T12:00:00Z`, locale)}
      />

      <ProfileDojo club={club} />

      <ProfilePreferences
        locale={locale}
        locales={LOCALES}
        localeLabel={(code) => ENDONYM[code as Locale]}
        onChooseLocale={(code) => onLocaleChange(code as Locale)}
        theme={theme.preference}
        onChooseTheme={theme.setPreference}
      />

      <ProfileLinks />

      <ProfileContactCta onOpenContact={() => setContactOpen(true)} />

      {/* The drawer's two orphans, unchanged since checkpoint 1 — sign-out and the studio
          switcher. They stay a separate component because they are the SHELL's, handed down
          rather than read again here. */}
      <div className="tw-scope px-4 pb-4">
        <AccountControls locale={locale} {...account} />
      </div>

      {contactOpen ? <ContactSheet club={club} onClose={() => setContactOpen(false)} /> : null}

      {editingDetails && details ? (
        <PersonalDetailsSheet
          details={details}
          busy={savingDetails}
          failed={detailsFailed}
          onSave={saveDetails}
          onClose={() => {
            setEditingDetails(false)
            setDetailsFailed(false)
          }}
        />
      ) : null}
    </section>
  )
}
