// The staff app's account TAB — artboard 9e's replacement. Every destination the old
// drawer carried (§3 of docs/superpowers/specs/2026-09-06-staff-app-redesign.md, "where
// every current destination goes") lives here now: the drawer itself is gone, five tabs,
// no side menu, the same move the parent app's ProfileScreen already made for `2e`.
//
// **2026-09-06, second pass: the prototype's design.** Ported from
// `~/Downloads/staff-app/src/components/AccountView.tsx` — class vocabulary matched, not
// approximated — inside the `.tw-scope` wrapper `StaffShell` already provides. This pass
// changes how the screen LOOKS; every destination and every gate below is unchanged from
// the structural build.
//
// **A manager-only row is not rendered at all for a non-manager — not rendered-then-
// refused.** Same reasoning `App.tsx` already carried beside the old drawer's privacy
// link: a link a coach follows to a refusal teaches them the app is broken, not that the
// feature is reserved. So the whole "club management" group — cash, the join link, the
// privacy queue, the setup wizard — disappears as a unit for anyone who is not a manager,
// heading included, rather than showing an empty-looking section.
//
// Almost every row's label reuses a key that already exists elsewhere in the product —
// see the `account.*` keys' own header comment in `he/common.ts` for the list — so this
// file does not duplicate copy the screen it links to already owns.
//
// **Three pieces of the prototype's own profile card are deliberately NOT built:**
//   1. The amber rank badge (`חגורה שחורה דאן 2`). A coach's belt grade is not stored
//      anywhere in this app, and the owner decided against adding a field for it — so
//      nothing here invents one.
//   2. Three of the prototype's four stat tiles. Average attendance is a report nothing
//      computes; mats are not a concept this app has; active-students is a club-wide count
//      a coach is not scoped to. Only the groups count is real — `peopleClient.myGroups()`
//      already backed the old drawer's identity block — so the stat row below is ONE
//      honest tile, not a four-up grid of numbers three of which would be fabricated.
//   3. Everything else in that file with no data behind it: the toast notification (this
//      screen's writes fail visibly instead, via `account-edit-error`), the cloud-sync and
//      Google Calendar rows (`CoachCalendarFeed` below is the real subscription M8 built),
//      the insurance/medical-certificate rows, and the app-version footer.
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Accessibility,
  Edit3,
  ChevronLeft,
  FileText,
  Link2,
  Settings,
  Shield,
  ShieldAlert,
  Smartphone,
  Trophy,
  Wallet,
} from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import {
  AccessibilityMenu,
  AccountDrawerFooter,
  PRIVACY_HASH,
  StudioSwitcher,
  TERMS_HASH,
} from '@studio/ui'
import type { SwitchableStudio } from '@studio/ui'
import { PermissionBoundaries, roleLabelsOf } from '../identity/DrawerIdentity'
import { CoachCalendarFeed, NotificationPreferences } from '../comms'
import type { StaffCommsClient } from '../comms'
import type { MyProfileUpdate, StaffPeopleClient } from '../people'
import { EditProfileSheet } from './EditProfileSheet'
import type { EditableProfile } from './EditProfileSheet'

type AccountProfile = {
  firstName: string
  lastName: string
  displayName: string
  email: string | null
  phone: string | null
}

/** Icon-tile background/ink pairs — the prototype's own hue-per-row choice, class for
 *  class (`bg-<hue>-50 text-<hue>-600`). */
const TILE_HUE = {
  blue: 'bg-blue-50 text-blue-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  emerald: 'bg-emerald-50 text-emerald-600',
} as const

function GroupHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-xs font-black text-slate-900 tracking-wider px-1">
      {children}
    </h2>
  )
}

function RowCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden text-xs">
      {children}
    </div>
  )
}

/** A navigation row — a real `<a href>`, not a `<div onClick>`: it is what makes the back
 *  button, open-in-new-tab and `routes.reachable.test.ts`'s source scan all work. */
function Row({
  href,
  icon: Icon,
  hue,
  title,
  subtitle,
}: {
  href: string
  icon: LucideIcon
  hue: keyof typeof TILE_HUE
  title: string
  subtitle?: string
}) {
  return (
    <a
      href={href}
      className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
    >
      <span className="flex items-center gap-3 min-w-0">
        <span
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold ${TILE_HUE[hue]}`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="flex flex-col items-start text-start min-w-0">
          <span className="font-bold text-slate-800 truncate">{title}</span>
          {subtitle ? <span className="text-[11px] text-slate-500 truncate">{subtitle}</span> : null}
        </span>
      </span>
      {/* ChevronLeft, not Right: in a right-to-left document "onward" points left — the
          parent app's `ProfileMenu` made the same call for the same reason. */}
      <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
    </a>
  )
}

export function AccountScreen({
  locale,
  displayName,
  roles,
  viewerIsManager,
  peopleClient,
  commsClient,
  studios,
  activeStudioId,
  onSwitchStudio,
  onChooseLocale,
  onSignOut,
}: {
  locale: Locale
  displayName: string | null
  roles: string[]
  viewerIsManager: boolean
  peopleClient: StaffPeopleClient
  commsClient: StaffCommsClient
  studios: SwitchableStudio[]
  activeStudioId: string | null
  onSwitchStudio: (studioId: string) => void
  onChooseLocale: (next: Locale) => void
  onSignOut: () => void
}) {
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [groupNames, setGroupNames] = useState<string[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    let live = true
    peopleClient
      .myProfile()
      .then(
        (body) =>
          live &&
          setProfile({
            firstName: body.first_name,
            lastName: body.last_name,
            displayName: body.display_name,
            email: body.email,
            phone: body.phone,
          }),
      )
      // A read failure leaves the card showing the session's own `displayName` and hides
      // the phone/email line and the edit button — never a placeholder pretending to be
      // real contact details.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [peopleClient])

  useEffect(() => {
    let live = true
    peopleClient
      .myGroups()
      .then((body) => live && setGroupNames(body.items.map((group) => group.name)))
      .catch(() => live && setGroupNames([]))
    return () => {
      live = false
    }
  }, [peopleClient])

  const saveProfile = useCallback(
    (next: EditableProfile) => {
      setSaving(true)
      setSaveFailed(false)
      const patch: MyProfileUpdate = {
        first_name: next.firstName,
        last_name: next.lastName,
        email: next.email,
        phone: next.phone,
      }
      peopleClient
        .updateMyProfile(patch)
        .then((body) => {
          setSaving(false)
          setProfile({
            firstName: body.first_name,
            lastName: body.last_name,
            displayName: body.display_name,
            email: body.email,
            phone: body.phone,
          })
          setEditOpen(false)
        })
        .catch(() => {
          setSaving(false)
          setSaveFailed(true)
        })
    },
    [peopleClient],
  )

  const name = profile?.displayName ?? displayName ?? ''
  const initial = name.charAt(0)
  const roleLabels = roleLabelsOf(roles, locale)
  const studioName = studios.find((studio) => studio.studioId === activeStudioId)?.studioName ?? null

  return (
    <div data-testid="account-screen" className="flex flex-col gap-4 px-4 pt-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {t(locale, 'common.account.title')}
          </h1>
          {studioName ? <p className="text-[11px] text-slate-500 mt-0.5">{studioName}</p> : null}
        </div>
        <div
          aria-hidden="true"
          className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-base flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0"
        >
          {initial}
        </div>
      </header>

      {/* The coach profile card — 9e's identity block, redrawn. See this file's own
          header for the three prototype pieces deliberately left out of it. */}
      <section className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-5 shadow-xl relative overflow-hidden border border-slate-800">
        <div
          aria-hidden="true"
          className="absolute -top-10 -start-10 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl pointer-events-none"
        />

        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              aria-hidden="true"
              className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center font-black text-2xl text-white shadow-inner shrink-0"
            >
              {initial}
            </div>
            <div className="min-w-0" data-testid="drawer-identity">
              <h2 className="text-lg font-black text-white leading-tight truncate">
                <bdi>{name}</bdi>
              </h2>
              {/* Read-only: role is a manager-controlled assignment, not something a coach
                  edits about themself — `EditProfileSheet` never carries this field. */}
              {roleLabels.length > 0 ? (
                <p className="text-xs text-slate-300 font-medium mt-0.5">{roleLabels.join(' · ')}</p>
              ) : null}
              {profile?.phone || profile?.email ? (
                <p className="text-[11px] text-blue-300 font-mono mt-0.5">
                  {profile.phone ? <bdi dir="ltr">{profile.phone}</bdi> : null}
                  {profile.phone && profile.email ? ' • ' : null}
                  {profile.email ? <bdi dir="ltr">{profile.email}</bdi> : null}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEditOpen(true)}
            disabled={profile === null}
            aria-label={t(locale, 'people.profile.personalEdit')}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 active:scale-95 transition-all shrink-0 disabled:opacity-40"
          >
            <Edit3 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* The single honest tile — see this file's own header for the three fabricated
            ones from the prototype's four-up grid that are not here. */}
        {groupNames.length > 0 ? (
          <div className="pt-3 mt-3 border-t border-white/10 relative z-10">
            <div className="bg-white/5 rounded-xl p-2">
              <p data-testid="drawer-my-classes" className="text-[11px] text-slate-300 m-0">
                {t(locale, 'common.identity.myClasses')}{' '}
                <span className="font-black font-mono text-amber-300">{groupNames.length}</span> ·{' '}
                <bdi>{groupNames.join(' · ')}</bdi>
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {editOpen && profile ? (
        <EditProfileSheet
          locale={locale}
          details={{
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            phone: profile.phone,
          }}
          busy={saving}
          failed={saveFailed}
          onSave={saveProfile}
          onClose={() => {
            setEditOpen(false)
            setSaveFailed(false)
          }}
        />
      ) : null}

      {/* 9e's boundary teaching, unchanged — see PermissionBoundaries' own header. A
          manager sees none: nothing on this list is locked for them. */}
      {!viewerIsManager ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 text-xs">
          <PermissionBoundaries locale={locale} canMoveStudents={roles.includes('lead_coach')} />
        </div>
      ) : null}

      {/* The club-management group. Manager-only as a UNIT — see this file's own header:
          a coach must never see a heading with nothing reachable under it. */}
      {viewerIsManager ? (
        <section aria-labelledby="account-group-club" className="flex flex-col gap-2">
          <GroupHeading id="account-group-club">{t(locale, 'common.account.group.club')}</GroupHeading>
          <RowCard>
            <Row
              href="#/cash"
              icon={Wallet}
              hue="emerald"
              title={t(locale, 'billing.cash.manager.title')}
            />
            <Row
              href="#/join-link"
              icon={Link2}
              hue="indigo"
              title={t(locale, 'people.join.card.title')}
            />
            <Row
              href="#/privacy"
              icon={ShieldAlert}
              hue="rose"
              title={t(locale, 'reports.privacy.requests.operatorTitle')}
              subtitle={t(locale, 'reports.privacy.requests.operatorSubtitle')}
            />
            <Row href="#/setup" icon={Settings} hue="blue" title={t(locale, 'common.setup.title')} />
          </RowCard>
        </section>
      ) : null}

      <section aria-labelledby="account-group-notifications" className="flex flex-col gap-2">
        <GroupHeading id="account-group-notifications">
          {t(locale, 'common.account.group.notifications')}
        </GroupHeading>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 text-xs">
          <NotificationPreferences client={commsClient} locale={locale} />
        </div>
      </section>

      <section aria-labelledby="account-group-system" className="flex flex-col gap-2">
        <GroupHeading id="account-group-system">{t(locale, 'common.account.group.system')}</GroupHeading>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 text-xs">
          <CoachCalendarFeed client={commsClient} locale={locale} />
        </div>
        <RowCard>
          {/* Decision #4 of the redesign spec folds events into the schedule's own
              session list, later. Until that lands this is the one reachable door to
              the events screen and its exam-results/roster sub-routes — visible to
              every coach, the same as the old NAV entry it replaces, not manager-gated. */}
          <Row
            href="#/events"
            icon={Trophy}
            hue="amber"
            title={t(locale, 'events.title')}
            subtitle={t(locale, 'events.list.subtitle')}
          />
          <Row
            href="#/install"
            icon={Smartphone}
            hue="blue"
            title={t(locale, 'common.install.title')}
            subtitle={t(locale, 'common.install.why')}
          />
        </RowCard>
      </section>

      <section aria-labelledby="account-group-legal" className="flex flex-col gap-2">
        <GroupHeading id="account-group-legal">{t(locale, 'common.account.group.legal')}</GroupHeading>
        <RowCard>
          <Row href={TERMS_HASH} icon={FileText} hue="blue" title={t(locale, 'reports.privacy.terms.title')} />
          <Row href={PRIVACY_HASH} icon={Shield} hue="indigo" title={t(locale, 'reports.privacy.policy.title')} />
          {/* נגישות. The SAME control the sign-in screen floats in the corner — see
              `App.tsx`'s header for why it moves here once signed in. Only the opener is
              drawn: the panel, the adjustments and the legally required statement all
              belong to `AccessibilityMenu` itself, so this row cannot drift from the
              floating one. It sits beside privacy on purpose, carrying over the parent
              app's reasoning unchanged: both are rights rather than preferences. */}
          <AccessibilityMenu
            locale={locale}
            renderTrigger={({ open, toggle }) => (
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                data-testid="a11y-open"
                onClick={toggle}
                className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors text-start"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold">
                    <Accessibility className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="font-bold text-slate-800">{t(locale, 'common.a11y.title')}</span>
                </span>
                <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              </button>
            )}
          />
        </RowCard>
      </section>

      {/* `AppShell` used to render this in its header, above the drawer footer's
          language/theme controls. It moves down here rather than vanishing: §3 keeps it
          in the footer group, beside the controls it has always stood next to. */}
      <StudioSwitcher
        activeStudioId={activeStudioId}
        locale={locale}
        onSwitch={onSwitchStudio}
        studios={studios}
      />

      {/* Language, theme, sign out — carried whole, never split up. */}
      <AccountDrawerFooter
        accountName={displayName}
        locale={locale}
        onChooseLocale={onChooseLocale}
        onSignOut={onSignOut}
      />
    </div>
  )
}
