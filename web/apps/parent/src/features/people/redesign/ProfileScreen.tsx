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
import { apiFetch, formatAgorot, formatMonthLabel, useRefreshSignal } from '@studio/core'
import { useTheme } from '@studio/ui'
import { ENDONYM } from '@studio/ui'
import { LOCALES, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { needsFullDeclaration } from '../../health/HealthGate'
import type { AccountControlsProps } from '../../shell/AccountControls'
import { ProfileHeader } from './ProfileTop'
import { ProfileMenu } from './ProfileMenu'
import type { MenuKey } from './ProfileMenu'
import { PaymentMethodSheet } from './PaymentMethodSheet'
import type { MethodKey, MethodRow } from './PaymentMethodSheet'
import { methodKey } from '../../billing/PaymentHistoryScreen'
import { ClubSheet, PaymentsSheet, SettingsSheet, TraineesSheet } from './sheets'
import type { ChequeRoute, MandateLinkRow } from './sheets'
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

/** `/me/payment-promises` on the wire, narrowed to what this screen reads: which method a
 *  family pays by, and whether a cheque promise is already with the manager. */
type PromiseRow = {
  id: string
  status: 'pending' | 'received' | 'declined'
  method: string
  total_agorot: number
  claimed_plan_id: string | null
  decided_at: string | null
}

/** `/me/charges?status=open`, narrowed to what a cheque promise needs: which charges it
 *  settles, and what they come to. */
type OpenCharge = { id: string; amount_agorot: number }

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
  /**
   * How the family pays, per child — `GET /me/payment-methods`.
   *
   * This USED to be derived from `/me/payment-promises` row zero, and that could never
   * work: `payment_promise.method` is `IN ('cash','cheque','standing_order')`, so a card
   * family has no promise and read `לא הוגדר` however many times they answered the
   * wizard. The fact now has a column of its own.
   */
  const [methodRows, setMethodRows] = useState<readonly MethodRow[]>([])
  const [savingMethods, setSavingMethods] = useState(false)
  const [methodError, setMethodError] = useState<string | null>(null)
  const [charges, setCharges] = useState<readonly CoverageCharge[] | null>(null)
  // ── אמצעי תשלום, moved here from the payments screen on 2026-09-07 ──────────────────
  // הוראת קבע and צ׳קים are both set up ONCE — a mandate moves the money by itself and a
  // season of cheques is handed over in one go — so neither is a monthly decision and
  // neither belongs on the screen that asks "what do I owe right now".
  const [mandateLinks, setMandateLinks] = useState<readonly MandateLinkRow[]>([])
  const [chequeTerms, setChequeTerms] = useState<{ months: number; monthlyAgorot: number } | null>(
    null,
  )
  const [openCharges, setOpenCharges] = useState<readonly OpenCharge[] | null>(null)
  const [promises, setPromises] = useState<readonly PromiseRow[] | null>(null)
  const [chequeBusy, setChequeBusy] = useState(false)

  // `'method'` is not a menu row — it is only ever reached from inside the payments
  // sheet, so it is a sheet key without a button of its own.
  const [open, setOpen] = useState<MenuKey | 'settings' | 'method' | null>(null)
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

  // Pull-to-refresh re-reads in place rather than reloading the document
  // (2026-09-08). It joins the dependency array this loader already has, so the
  // subscription cannot end up half-wired -- see tools/__tests__/refresh-coverage.
  const refreshSignal = useRefreshSignal()

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
            status: row.status,
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
        const body = (await response.json()) as { items?: PromiseRow[] }
        const rows = body.items ?? []
        setPromises(rows)
      })
      .catch(() => live && setFailed((current) => ({ ...current, money: true })))

    void apiFetch('/api/v1/me/payment-methods')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setFailed((current) => ({ ...current, money: true }))
        const body = (await response.json()) as {
          items: { student_id: string; student_name: string; method: MethodKey | null }[]
        }
        setMethodRows(
          body.items.map((row) => ({
            studentId: row.student_id,
            studentName: row.student_name,
            method: row.method,
          })),
        )
      })
      .catch(() => live && setFailed((current) => ({ ...current, money: true })))

    // Read LIVE on every visit, and deliberately outside any precache: a stale roster is
    // an inconvenience, a stale mandate link sends a family to sign at the wrong amount and
    // nobody finds out until the reconciliation queue disagrees months later.
    void apiFetch('/api/v1/me/standing-order-links')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setFailed((current) => ({ ...current, money: true }))
        const body = (await response.json()) as {
          items: {
            student_id: string
            student_name: string
            plan_name: string
            amount_agorot: number
            url: string
          }[]
        }
        setMandateLinks(
          body.items.map((row) => ({
            studentId: row.student_id,
            studentName: row.student_name,
            planName: row.plan_name,
            amountAgorot: row.amount_agorot,
            url: row.url,
          })),
        )
      })
      .catch(() => live && setFailed((current) => ({ ...current, money: true })))

    // The club's cheque term and this payer's monthly price. Read rather than computed:
    // `months × monthly` is integer arithmetic on money (G2) and the server is the one
    // place that holds both numbers.
    void apiFetch('/api/v1/me/prepay-terms')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setFailed((current) => ({ ...current, money: true }))
        const body = (await response.json()) as {
          cheque_prepay_months: number
          monthly_total_agorot: number
        }
        setChequeTerms({
          months: body.cheque_prepay_months,
          monthlyAgorot: body.monthly_total_agorot,
        })
      })
      .catch(() => live && setFailed((current) => ({ ...current, money: true })))

    // The charges a cheque promise would settle. `?status=open` and not the unfiltered read
    // below: a promise raised over a settled charge is one a manager has to decline.
    void apiFetch('/api/v1/me/charges?status=open')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setFailed((current) => ({ ...current, money: true }))
        const body = (await response.json()) as { items: OpenCharge[] }
        setOpenCharges(body.items)
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
  }, [locale, epoch, refreshSignal])

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

  /**
   * One word for the row, across every child.
   *
   * `מעורב` is a real answer and not a failure: a family may put one child on a mandate
   * and pay another by card, which is exactly why the method is stored per child. The row
   * says so rather than picking one child's answer and presenting it as the family's.
   */
  const methodLabel = useMemo(() => {
    const answered = methodRows.map((row) => row.method).filter((m): m is MethodKey => m !== null)
    if (answered.length === 0) return null
    const distinct = new Set(answered)
    if (distinct.size > 1) return t(locale, 'people.profile.paymentMethodMixed')
    // `methodKey`'s own spelling — `upay_card` is `billing.method.card` — rather than a
    // second mapping that would drift from the history screen's.
    return t(locale, `billing.method.${methodKey([...distinct][0]!)}`)
  }, [methodRows, locale])

  /** Saves the picker. A refresh follows, so the row and the sheet cannot disagree about
   *  what landed — and a failed write says so instead of closing as though it worked. */
  const saveMethods = useCallback(
    async (items: readonly { studentId: string; method: MethodKey }[]) => {
      setSavingMethods(true)
      setMethodError(null)
      try {
        const response = await apiFetch('/api/v1/me/payment-methods', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map((row) => ({ student_id: row.studentId, method: row.method })),
          }),
        })
        if (!response.ok) throw new Error(String(response.status))
        setMethodRows((current) =>
          current.map((row) => {
            const picked = items.find((item) => item.studentId === row.studentId)
            return picked ? { ...row, method: picked.method } : row
          }),
        )
        setOpen('payments')
      } catch {
        setMethodError(t(locale, 'people.profile.paymentMethodFailed'))
      } finally {
        setSavingMethods(false)
      }
    },
    [locale],
  )

  /**
   * The cheque route's whole state, or `null` while its own reads are in flight.
   *
   * `null` rather than zeroes: a button priced at nothing raises a promise for nothing,
   * which a manager then has to decline — and the family has no idea why.
   */
  const cheque: ChequeRoute | null = useMemo(() => {
    if (chequeTerms === null || openCharges === null || promises === null) return null
    // One live promise at a time across BOTH routes — the service refuses a second over
    // the same charges, so a button that still offered itself would be offering a 409. A
    // plan CLAIM names no charge and must not lock this: a family whose claim waits with
    // the manager can still hand over cheques.
    const pending =
      promises.find((row) => row.status === 'pending' && row.claimed_plan_id === null) ?? null
    const latestDecided =
      promises.find((row) => row.method === 'cheque' && row.decided_at !== null) ?? null
    return {
      months: chequeTerms.months,
      monthlyTotalAgorot: chequeTerms.monthlyAgorot,
      openAgorot: openCharges.reduce((sum, charge) => sum + charge.amount_agorot, 0),
      chargeIds: openCharges.map((charge) => charge.id),
      pendingAgorot: pending?.method === 'cheque' ? pending.total_agorot : null,
      blocked: pending !== null && pending.method !== 'cheque',
      declined: pending === null && latestDecided?.status === 'declined',
      busy: chequeBusy,
      onRequest: () => {
        if (chequeBusy) return
        setChequeBusy(true)
        void apiFetch('/api/v1/me/payment-promises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            charge_ids: openCharges.map((charge) => charge.id),
            method: 'cheque',
            // A COUNT, never an amount: the server prices the months from the payer's own
            // monthly total, the same way the card and cash routes do.
            prepay_months: chequeTerms.monthlyAgorot > 0 ? chequeTerms.months : 0,
            // "I will bring them", not "I already did". Different claims to a manager.
            already_paid: false,
            claimed_plan_id: null,
          }),
        })
          .then((response) => {
            setChequeBusy(false)
            if (!response.ok) return setFailed((current) => ({ ...current, money: true }))
            // Re-read rather than patch the row in: the promise's own total is priced by
            // the server, and a locally-invented one is a second place money is computed.
            retry()
          })
          .catch(() => {
            setChequeBusy(false)
            setFailed((current) => ({ ...current, money: true }))
          })
      },
    }
  }, [chequeTerms, openCharges, promises, chequeBusy, retry])

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
          onEditMethod={() => setOpen('method')}
          money={money}
          monthLabel={(year, month) => formatMonthLabel(year, month, locale)}
          onClose={close}
        />
      ) : null}

      {open === 'method' ? (
        <PaymentMethodSheet
          rows={methodRows}
          locale={locale}
          mandateLinks={mandateLinks}
          cheque={cheque}
          money={money}
          busy={savingMethods}
          error={methodError}
          onSave={saveMethods}
          // Back to the payments sheet, not to the bare screen: the picker was opened
          // from inside it, and closing to nothing loses the family their place.
          onClose={() => setOpen('payments')}
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
