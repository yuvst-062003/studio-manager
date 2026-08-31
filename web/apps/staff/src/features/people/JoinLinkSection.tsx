// §5.4b's onboarding-link card, in the STAFF app — the spec puts it in both surfaces:
// the blast goes out from whatever device the manager is holding, and at the dojo that
// is a phone. The landing-page card stays on the dashboard; this screen is exactly the
// one card. Manager-only by shell and by route (the endpoints are ManagerOrOwner).
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { Button, Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type LinkStatus = {
  active: boolean
  expires_at: string | null
  registered_count: number
  landing_url: string | null
  /** The live link, readable on every load since 2026-08-31 — see SharingCards' header. */
  url: string | null
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
}

const cardsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
  gap: 'var(--space-3)',
  marginBlockEnd: 'var(--space-4)',
}

function CopyButton({ locale, value }: { locale: Locale; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="secondary"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true))
      }}
    >
      {copied ? t(locale, 'people.join.card.copied') : t(locale, 'people.join.card.copy')}
    </Button>
  )
}

export function JoinLinkSection({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState<LinkStatus | null>(null)
  const [freshUrl, setFreshUrl] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const client = useMemo(
    () => ({
      async status(): Promise<LinkStatus | null> {
        const response = await apiFetch('/api/v1/onboarding-link')
        return response.ok ? ((await response.json()) as LinkStatus) : null
      },
      async regenerate(): Promise<{ url: string } | null> {
        const response = await apiFetch('/api/v1/onboarding-link', { method: 'POST' })
        return response.ok ? ((await response.json()) as { url: string }) : null
      },
      async revoke(): Promise<void> {
        await apiFetch('/api/v1/onboarding-link', { method: 'DELETE' })
      },
    }),
    [],
  )

  useEffect(() => {
    let alive = true
    void client.status().then((body) => alive && setStatus(body))
    return () => {
      alive = false
    }
  }, [client, reloads])

  if (status === null) return null

  return (
    <div style={cardsStyle} data-testid="sharing-cards">
      <Card>
        <h3 style={{ marginBlockStart: 0 }}>{t(locale, 'people.join.card.title')}</h3>
        <p style={{ color: 'var(--text-muted)' }} data-testid="join-link-status">
          {!status.active
            ? t(locale, 'people.join.card.inactive')
            : status.expires_at
              ? // A dated link from before the permanent decision — it still ages out.
                t(locale, 'people.join.card.active').replace(
                  '{{date}}',
                  formatDateInStudioZone(status.expires_at, locale),
                )
              : t(locale, 'people.join.card.permanent')}
          {' · '}
          {status.registered_count} {t(locale, 'people.join.card.registered')}
        </p>
        {/* The link itself, on every load. `freshUrl` still wins for the moment after a
            regenerate, when the status reload has not landed yet. */}
        {freshUrl ?? status.url ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <code
              style={{ overflowWrap: 'anywhere', fontSize: 'var(--text-caption)' }}
              data-testid="join-link-url"
            >
              {freshUrl ?? status.url}
            </code>
            <div style={rowStyle}>
              <CopyButton locale={locale} value={(freshUrl ?? status.url) as string} />
            </div>
          </div>
        ) : status.active ? (
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 'var(--text-caption)' }}>
            {t(locale, 'people.join.card.legacyNote')}
          </p>
        ) : null}
        <div style={rowStyle}>
          <Button
            variant="primary"
            data-testid="join-link-new"
            onClick={() => {
              void client.regenerate().then((created) => {
                setFreshUrl(created?.url ?? null)
                setReloads((n) => n + 1)
              })
            }}
          >
            {t(locale, 'people.join.card.new')}
          </Button>
          {status.active ? (
            <Button
              variant="secondary"
              data-testid="join-link-revoke"
              onClick={() => {
                setFreshUrl(null)
                void client.revoke().then(() => setReloads((n) => n + 1))
              }}
            >
              {t(locale, 'people.join.card.revoke')}
            </Button>
          ) : null}
        </div>
      </Card>

    </div>
  )
}
