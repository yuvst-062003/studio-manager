// §5.1's first link, given a screen: "Studios are provisioned by the platform operator,
// never self-created. There is no צור סטודיו button anywhere in the staff app."
//
// This is that button, in the one place §5.1 permits it to exist. The three endpoints
// behind it have been live and tested since M1 with no caller in `web/` at all — until
// now the only way to onboard a club was `scripts/bootstrap-owner.py` over
// `railway ssh --service api`.
//
// **The invitation token is shown once and never again.** Only its SHA-256 is stored, so
// a screen that did not put it in front of the operator immediately would lose it and the
// only recovery would be issuing a second one. `platform.invite.tokenOnce` says so on
// screen, in the same shape the staff invite already uses.
//
// **Suspension confirms first.** It removes a club from every studio switcher its members
// have, which is a large effect from a small button, and the confirm names that effect
// rather than asking "are you sure".
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  Card,
  LoadFailed,
  SelectField,
  StatusChip,
  Table,
  TextField,
  useModalDialog,
} from '@studio/ui'
import type { TableColumn } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { IssuedInvitation, PlatformClient, PlatformStudio } from './client'

function Ltr({ children }: { children: ReactNode }) {
  return <span dir="ltr">{children}</span>
}

const LOCALES = ['he', 'en', 'ru'] as const

export function StudiosPanel({
  client,
  locale,
  onChanged,
  studios,
}: {
  client: PlatformClient
  locale: Locale
  onChanged: () => void
  studios: PlatformStudio[]
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [defaultLocale, setDefaultLocale] = useState<string>('he')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const [suspending, setSuspending] = useState<PlatformStudio | null>(null)
  const [invitingStudioId, setInvitingStudioId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [issued, setIssued] = useState<IssuedInvitation | null>(null)

  async function submitStudio(): Promise<void> {
    setBusy(true)
    setFailed(false)
    try {
      await client.createStudio({
        name: name.trim(),
        slug: slug.trim(),
        // G3 — a RENDERING timezone, never a storage one. Every instant in this product
        // is stored UTC; this is what a club's screens render in.
        timezone: 'Asia/Jerusalem',
        default_locale: defaultLocale,
      })
      setCreating(false)
      setName('')
      setSlug('')
      onChanged()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function submitInvite(studioId: string): Promise<void> {
    setBusy(true)
    setFailed(false)
    try {
      const invitation = await client.inviteOwner(studioId, {
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
      setIssued(invitation)
      setInvitingStudioId(null)
      setEmail('')
      setFirstName('')
      setLastName('')
      onChanged()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function suspend(studio: PlatformStudio): Promise<void> {
    setSuspending(null)
    setBusy(true)
    setFailed(false)
    try {
      await client.suspend(studio.id)
      onChanged()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const columns: TableColumn<PlatformStudio>[] = [
    {
      id: 'name',
      header: t(locale, 'common.platform.studios.name'),
      width: '30%',
      cell: (studio) => (
        <>
          <bdi>{studio.name}</bdi>
          {studio.is_demo ? (
            <>
              {' '}
              <StatusChip label={t(locale, 'common.platform.demo')} status="planned" />
            </>
          ) : null}
        </>
      ),
    },
    {
      id: 'slug',
      header: t(locale, 'common.platform.studios.slug'),
      width: '20%',
      cell: (studio) => <Ltr>{studio.slug}</Ltr>,
    },
    {
      id: 'status',
      header: t(locale, 'common.platform.studios.status'),
      width: '18%',
      cell: (studio) => (
        <StatusChip
          label={t(
            locale,
            studio.status === 'active'
              ? 'common.platform.status.active'
              : 'common.platform.status.suspended',
          )}
          status={studio.status === 'active' ? 'paid' : 'cancelled'}
        />
      ),
    },
    {
      id: 'actions',
      header: t(locale, 'common.platform.studios.actions'),
      width: '32%',
      cell: (studio) => (
        <>
          <Button
            data-testid={`invite-owner-${studio.slug}`}
            disabled={busy}
            onClick={() => setInvitingStudioId(studio.id)}
            variant="secondary"
          >
            {t(locale, 'common.platform.invite.title')}
          </Button>{' '}
          {studio.status === 'active' ? (
            <Button
              data-testid={`suspend-${studio.slug}`}
              disabled={busy}
              onClick={() => setSuspending(studio)}
              variant="secondary"
            >
              {t(locale, 'common.platform.suspend.action')}
            </Button>
          ) : null}
        </>
      ),
    },
  ]

  return (
    <section aria-labelledby="platform-studios-title" data-testid="platform-studios">
      <h3 id="platform-studios-title">{t(locale, 'common.platform.studios.title')}</h3>

      {failed ? (
        <LoadFailed
          detail={t(locale, 'common.platform.error.failed')}
          locale={locale}
          onRetry={onChanged}
        />
      ) : null}

      {/* The confirm, as a real focus-trapped dialog rather than `globalThis.confirm`.
          A native confirm is unstyleable, untranslatable beyond its message, and blocks
          the whole thread — and `useModalDialog` is what every other irreversible action
          in this app already uses (W6 wrote it for exactly this: a group belt promotion
          and an exam-result save, both of which had `aria-modal` and none of the
          behaviour it promises).

          The copy names the CONSEQUENCE — the club disappears from every studio switcher
          — rather than asking "are you sure", which is the only form of this prompt that
          carries information a person can decide on. */}
      {suspending ? (
        <SuspendDialog
          busy={busy}
          locale={locale}
          onCancel={() => setSuspending(null)}
          onConfirm={() => void suspend(suspending)}
          studio={suspending}
        />
      ) : null}

      {/* Shown once. See this file's header — only the hash is stored. */}
      {issued ? (
        <Card caption={t(locale, 'common.platform.invite.title')}>
          <p data-testid="platform-invite-token">
            <bdi>{issued.email}</bdi> · <code dir="ltr">{issued.token}</code>
          </p>
          <p>{t(locale, 'common.platform.invite.tokenOnce')}</p>
          <Button onClick={() => setIssued(null)} variant="secondary">
            {t(locale, 'common.install.back')}
          </Button>
        </Card>
      ) : null}

      {invitingStudioId ? (
        <Card caption={t(locale, 'common.platform.invite.title')}>
          <TextField
            label={t(locale, 'common.platform.invite.email')}
            onChange={(event) => setEmail(event.target.value)}
            value={email}
          />
          <TextField
            label={t(locale, 'common.platform.invite.firstName')}
            onChange={(event) => setFirstName(event.target.value)}
            value={firstName}
          />
          <TextField
            label={t(locale, 'common.platform.invite.lastName')}
            onChange={(event) => setLastName(event.target.value)}
            value={lastName}
          />
          <Button
            data-testid="platform-invite-submit"
            disabled={busy || !email.trim() || !firstName.trim() || !lastName.trim()}
            onClick={() => void submitInvite(invitingStudioId)}
          >
            {t(locale, 'common.platform.invite.submit')}
          </Button>
        </Card>
      ) : null}

      {creating ? (
        <Card caption={t(locale, 'common.platform.new.title')}>
          <TextField
            label={t(locale, 'common.platform.new.name')}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <TextField
            hint={t(locale, 'common.platform.new.slugHint')}
            label={t(locale, 'common.platform.new.slug')}
            onChange={(event) => setSlug(event.target.value)}
            value={slug}
          />
          {/* The club's OWN default language, not the operator's. `setup.studio.locale.*`
              already carries these three endonyms -- §5.1's wizard asks the same question
              of an owner, and two copies of 'עברית' would be two things to keep in step. */}
          <SelectField
            label={t(locale, 'common.platform.new.locale')}
            onChange={(event) => setDefaultLocale(event.target.value)}
            value={defaultLocale}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {t(locale, `common.setup.studio.locale.${code}`)}
              </option>
            ))}
          </SelectField>
          <Button
            data-testid="platform-create-submit"
            disabled={busy || !name.trim() || !slug.trim()}
            onClick={() => void submitStudio()}
          >
            {busy
              ? t(locale, 'common.platform.new.working')
              : t(locale, 'common.platform.new.submit')}
          </Button>
        </Card>
      ) : (
        <Button data-testid="platform-create-open" onClick={() => setCreating(true)}>
          {t(locale, 'common.platform.new.title')}
        </Button>
      )}

      <Table
        caption={t(locale, 'common.platform.studios.title')}
        columns={columns}
        empty={<p data-testid="platform-studios-empty">{t(locale, 'common.platform.studios.empty')}</p>}
        rowKey={(studio) => studio.id}
        rows={studios}
      />
    </section>
  )
}

function SuspendDialog({
  busy,
  locale,
  onCancel,
  onConfirm,
  studio,
}: {
  busy: boolean
  locale: Locale
  onCancel: () => void
  onConfirm: () => void
  studio: PlatformStudio
}) {
  // Rendered only while open, so the caller's conditional IS the open state -- the same
  // contract ImpactDialog uses.
  const dialogRef = useModalDialog(true, onCancel)
  return (
    <div
      aria-labelledby="platform-suspend-title"
      aria-modal="true"
      data-testid="platform-suspend-confirm"
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <h3 id="platform-suspend-title">{t(locale, 'common.platform.suspend.action')}</h3>
      <p>
        <bdi>{studio.name}</bdi>
      </p>
      <p>{t(locale, 'common.platform.suspend.confirm')}</p>
      <Button data-testid="platform-suspend-yes" disabled={busy} onClick={onConfirm}>
        {t(locale, 'common.platform.suspend.action')}
      </Button>{' '}
      <Button data-testid="platform-suspend-no" onClick={onCancel} variant="secondary">
        {t(locale, 'common.install.back')}
      </Button>
    </div>
  )
}
