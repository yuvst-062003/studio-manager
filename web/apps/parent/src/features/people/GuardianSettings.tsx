// Screen 8 of the parent redesign — the profile tab, rebuilt as the guardian's own screen.
//
// What shipped before this: a page titled `student.plural` ("חניכים") listing the children,
// where the ONLY control on each child's card was `leave.title` — so the most destructive
// act in the app was also the most prominent thing on the tab, and the only thing it
// offered. None of the parent's own material was on it: not their name, email or phone,
// not the language, not the theme, not the notification state, not how they pay, not the
// club's address. Two further defects were visible in the 2026-09-01 capture and are fixed
// here: the page title contradicted the tab that opens it (`common.home.tab.profile` reads
// "פרופיל"), and the guardian call link rendered UNDERNEATH the tab bar, unreachable.
//
// **The arrangement is the settings-list one** (option B of three, chosen 2026-09-01): each
// row states its current value and leads to where it is changed. That is what makes the
// destructive action hard to hit by accident — it is not on this screen at all. Leaving the
// club belongs to the child, and is reached by opening that child's card.
//
// Styles are inline `CSSProperties`, as everywhere else in this app's screens. The shared
// stylesheet is being rewritten by the student-card pass running alongside this one, and a
// second session editing the same file on the same day is how both passes lose work.
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Button, LanguagePicker, StatusChip, Switch, TextField, ThemeControl, useSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { chipToneFor } from './ProfileAndLeave'
import type { ProfileSectionProps } from './ProfileAndLeave'
import type { MyProfile, PeopleClient, StudentSummary } from './peopleClient'

/**
 * Each language named IN that language — someone who cannot read the current locale still
 * has to recognise their own.
 *
 * Duplicated from `LanguagePicker`'s own `ENDONYM` rather than imported: that constant is
 * not re-exported from `@studio/ui`'s index, and adding it there would mean editing a file
 * the parallel student-card pass is holding open.
 */
const ENDONYM: Record<Locale, string> = { he: 'עברית', en: 'English', ru: 'Русский' }

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
  inlineSize: '100%',
  marginInline: 'auto',
  maxInlineSize: '30rem',
}

const titleStyle: CSSProperties = { fontSize: 'var(--text-display)', margin: 0 }

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }

const groupHeadStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-bold)',
  letterSpacing: '0.02em',
  margin: 0,
  paddingInlineStart: 'var(--space-1)',
}

const groupCardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-xl)',
  overflow: 'hidden',
}

/**
 * The separators BETWEEN rows, and the reason this one rule is not an inline style.
 *
 * Inline styles cannot express "every child except the first", so a `borderBlockStart` on
 * the row itself drew a hairline directly beneath the card's own top border — a doubled
 * line at the top of all six cards. `> * + *` is the shape that says what is actually
 * meant: a separator belongs between two rows, never above the first one.
 *
 * Scoped to this screen and shipped with it, rather than added to `primitives.css`, which
 * the parallel student-card pass is holding open.
 */
const SEPARATOR_CSS = `
.pa-group__card > * + * {
  border-block-start: var(--border-width-hairline) solid var(--border);
}
`

const rowStyle: CSSProperties = {
  alignItems: 'center',
  background: 'none',
  border: 0,
  color: 'var(--fg)',
  display: 'flex',
  font: 'inherit',
  gap: 'var(--space-3)',
  justifyContent: 'space-between',
  // 44px is the floor the design system fixes; the row is the tap target, not the text.
  minBlockSize: '56px',
  paddingBlock: 'var(--space-3)',
  paddingInline: 'var(--space-5)',
  textAlign: 'start',
  textDecoration: 'none',
  inlineSize: '100%',
}

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: 'var(--text-body)',
  fontWeight: 'var(--weight-medium)',
  gap: '2px',
}

const hintStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  fontWeight: 'var(--weight-regular)',
}

const trailStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--text-secondary)',
  display: 'flex',
  flex: 'none',
  fontSize: 'var(--text-body)',
  gap: 'var(--space-2)',
}

const insetStyle: CSSProperties = {
  paddingBlock: 'var(--space-3)',
  paddingInline: 'var(--space-5)',
}

const noteStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  margin: 0,
  paddingInlineStart: 'var(--space-1)',
}

const editorStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-4)',
  paddingInline: 'var(--space-5)',
}

const actionsStyle: CSSProperties = { display: 'flex', gap: 'var(--space-2)' }

/** A chevron toward the inline start. One glyph: the row mirrors with `direction`. */
function Chevron() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      style={{ color: 'var(--text-muted)', flex: 'none' }}
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

/**
 * One labelled row: what it is on the reading edge, what it currently says on the other.
 *
 * Local rather than a shared primitive on purpose — `@studio/ui` is gaining a `DetailRow`
 * in the student-card pass running alongside this one, and this markup is the obvious
 * thing to delete once that lands.
 */
function Row({
  label,
  hint,
  value,
  href,
  onActivate,
  trailing,
  testId,
}: {
  label: string
  hint?: string
  value?: string
  href?: string
  onActivate?: () => void
  trailing?: ReactNode
  testId?: string
}) {
  const body = (
    <>
      <span style={labelStyle}>
        {label}
        {hint ? <span style={hintStyle}>{hint}</span> : null}
      </span>
      <span style={trailStyle}>
        {value ? <bdi>{value}</bdi> : null}
        {trailing}
        {href || onActivate ? <Chevron /> : null}
      </span>
    </>
  )
  if (href) {
    return (
      <a data-testid={testId} href={href} style={rowStyle}>
        {body}
      </a>
    )
  }
  if (onActivate) {
    return (
      <button data-testid={testId} onClick={onActivate} style={rowStyle} type="button">
        {body}
      </button>
    )
  }
  return (
    <div data-testid={testId} style={rowStyle}>
      {body}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} style={groupStyle}>
      <h2 style={groupHeadStyle}>{title}</h2>
      <div className="pa-group__card" style={groupCardStyle}>
        {children}
      </div>
    </section>
  )
}

/**
 * The account group's edit state.
 *
 * Only the fields that actually changed are sent, and an emptied field is sent as an
 * explicit `null`. The server distinguishes an absent key from a null one, which is what
 * lets a parent CLEAR a phone number rather than only overwrite it.
 */
function AccountEditor({
  locale,
  profile,
  onCancel,
  onSaved,
  client,
}: {
  locale: Locale
  profile: MyProfile
  onCancel: () => void
  onSaved: (next: MyProfile) => void
  client: PeopleClient
}) {
  const [firstName, setFirstName] = useState(profile.first_name)
  const [lastName, setLastName] = useState(profile.last_name)
  const [email, setEmail] = useState(profile.email ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const save = () => {
    setSaving(true)
    setFailed(false)
    const patch: Record<string, string | null> = {}
    if (firstName !== profile.first_name) patch.first_name = firstName
    if (lastName !== profile.last_name) patch.last_name = lastName
    if (email !== (profile.email ?? '')) patch.email = email === '' ? null : email
    if (phone !== (profile.phone ?? '')) patch.phone = phone === '' ? null : phone
    client
      .updateMyProfile(patch)
      .then(onSaved)
      .catch(() => setFailed(true))
      .finally(() => setSaving(false))
  }

  return (
    <div data-testid="profile-account-editor" style={editorStyle}>
      <TextField
        label={t(locale, 'people.profile.name')}
        onChange={(event) => setFirstName(event.target.value)}
        value={firstName}
      />
      <TextField
        label={t(locale, 'people.student.lastName')}
        onChange={(event) => setLastName(event.target.value)}
        value={lastName}
      />
      <TextField
        inputMode="email"
        label={t(locale, 'people.profile.email')}
        onChange={(event) => setEmail(event.target.value)}
        type="email"
        value={email}
      />
      <TextField
        inputMode="tel"
        label={t(locale, 'people.profile.phone')}
        onChange={(event) => setPhone(event.target.value)}
        type="tel"
        value={phone}
      />
      {failed ? (
        <p data-testid="profile-save-failed" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
          {t(locale, 'people.profile.saveFailed')}
        </p>
      ) : null}
      <div style={actionsStyle}>
        <Button data-testid="profile-save" disabled={saving} onClick={save} variant="primary">
          {t(locale, 'people.profile.save')}
        </Button>
        <Button onClick={onCancel} variant="ghost">
          {t(locale, 'common.cancel')}
        </Button>
      </div>
    </div>
  )
}

export type GuardianSettingsProps = {
  locale: Locale
  onLocaleChange: (next: Locale) => void
  students: StudentSummary[]
  profile: MyProfile
  client: PeopleClient
  /** The club's own rows, from `/me/studio`. Absent until it loads, and absent is a state. */
  studio?: { name: string; address: string | null; phone: string | null } | null
  /** Whether this device receives the club's pushes, and how to change that. */
  notifications?: { enabled: boolean; busy?: boolean; onChange: (next: boolean) => void } | null
  /** How the family pays today, already resolved to a label by the caller. */
  paymentMethod?: string | null
}

export function GuardianSettings({
  locale,
  onLocaleChange,
  students,
  profile,
  client,
  studio,
  notifications,
  paymentMethod,
}: GuardianSettingsProps) {
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState(profile)
  const [pickingLanguage, setPickingLanguage] = useState(false)
  const profileSections = useSlot<ProfileSectionProps>('parent-profile')
  const notSet = t(locale, 'people.profile.notSet')

  useEffect(() => setCurrent(profile), [profile])

  return (
    <section aria-labelledby="profile-title" data-testid="guardian-settings" style={pageStyle}>
      <style>{SEPARATOR_CSS}</style>
      <h1 id="profile-title" style={titleStyle}>
        {t(locale, 'people.profile.title')}
      </h1>

      <Group title={t(locale, 'people.profile.account')}>
        {editing ? (
          <AccountEditor
            client={client}
            locale={locale}
            onCancel={() => setEditing(false)}
            onSaved={(next) => {
              setCurrent(next)
              setEditing(false)
            }}
            profile={current}
          />
        ) : (
          <>
            <Row
              label={t(locale, 'people.profile.name')}
              onActivate={() => setEditing(true)}
              testId="profile-row-name"
              value={current.display_name}
            />
            <Row
              label={t(locale, 'people.profile.email')}
              onActivate={() => setEditing(true)}
              value={current.email ?? notSet}
            />
            <Row
              label={t(locale, 'people.profile.phone')}
              onActivate={() => setEditing(true)}
              value={current.phone ?? notSet}
            />
          </>
        )}
      </Group>

      <Group title={t(locale, 'people.profile.app')}>
        {pickingLanguage ? (
          <div style={insetStyle}>
            <LanguagePicker
              locale={locale}
              onChoose={(next) => {
                onLocaleChange(next)
                setPickingLanguage(false)
              }}
            />
          </div>
        ) : (
          <Row
            label={t(locale, 'people.profile.language')}
            onActivate={() => setPickingLanguage(true)}
            testId="profile-row-language"
            value={ENDONYM[locale]}
          />
        )}
        <div style={insetStyle}>
          <ThemeControl
            labels={{
              light: t(locale, 'common.theme.light'),
              dark: t(locale, 'common.theme.dark'),
              system: t(locale, 'common.theme.system'),
            }}
            legend={t(locale, 'people.profile.theme')}
            stateLabels={{
              light: t(locale, 'common.theme.state.light'),
              dark: t(locale, 'common.theme.state.dark'),
            }}
          />
        </div>
        {/* §5.11's push, as a switch that travels BOTH ways. `DELETE /push-tokens` is what
            makes the off direction real; before it existed this control could only have
            been a one-way button that lied about its state the moment it was flipped. */}
        {notifications ? (
          <div style={rowStyle}>
            <span style={labelStyle}>
              {t(locale, 'people.profile.notifications')}
              <span style={hintStyle}>{t(locale, 'people.profile.notifications.hint')}</span>
            </span>
            <span style={trailStyle}>
              <Switch
                checked={notifications.enabled}
                disabled={notifications.busy}
                label={t(locale, 'people.profile.notifications')}
                onCheckedChange={notifications.onChange}
                stateLabels={{
                  on: t(locale, 'people.profile.notifications.on'),
                  off: t(locale, 'people.profile.notifications.off'),
                }}
              />
            </span>
          </div>
        ) : null}
      </Group>

      {paymentMethod ? (
        <Group title={t(locale, 'billing.title')}>
          <Row
            href="#/payments"
            label={t(locale, 'people.profile.paymentMethod')}
            testId="profile-row-payment"
            value={paymentMethod}
          />
        </Group>
      ) : null}

      {/* The children, each leading to their own card. Leaving the club lives THERE and
          deliberately not here: it is rare, permanent, and the month's charge survives it
          (§5.4), so it belongs beside the child it ends rather than on the tab a parent
          opens to correct their own phone number. */}
      <Group title={t(locale, 'people.profile.children')}>
        {students.map((student) => (
          <Row
            href={`#/student/${student.id}`}
            key={student.id}
            label={`${student.first_name} ${student.last_name}`}
            testId={`profile-child-${student.id}`}
            trailing={
              <StatusChip
                label={t(locale, `people.status.${student.status}`)}
                status={chipToneFor(student.status)}
              />
            }
          />
        ))}
      </Group>
      <p style={noteStyle}>{t(locale, 'people.profile.leaveHint')}</p>

      {studio ? (
        <Group title={t(locale, 'people.profile.club')}>
          {/* Real rows, inside the scroll region. The call link used to render BELOW the
              tab bar, where it was both unreachable and caption-sized. */}
          <Row
            label={t(locale, 'people.profile.address')}
            value={studio.address ?? notSet}
            {...(studio.address
              ? { href: `https://maps.google.com/?q=${encodeURIComponent(studio.address)}` }
              : {})}
          />
          <Row
            label={t(locale, 'people.profile.phone')}
            testId="profile-club-phone"
            value={studio.phone ?? notSet}
            {...(studio.phone ? { href: `tel:${studio.phone}` } : {})}
          />
        </Group>
      ) : null}

      <Group title={t(locale, 'people.profile.privacy')}>
        <Row href="#/privacy" label={t(locale, 'reports.privacy.export.title')} />
      </Group>

      {/* Sections other lanes register, unchanged from the screen this replaces. Empty
          renders nothing at all — never a heading promising a feature that has not shipped. */}
      {profileSections.map(({ key, render: Section }) => (
        <Section key={key} locale={locale} students={students} />
      ))}
    </section>
  )
}
