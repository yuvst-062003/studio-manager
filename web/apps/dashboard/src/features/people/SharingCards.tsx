// The two links a club shares (feature pass 2026-08-27): §5.4b's onboarding link — the
// moving van, for families that already train — and §5.4a's landing page — the shop
// window, for new ones. One card each, side by side where the manager already manages
// people, because "which link do I send" is the question this pair answers.
//
// The onboarding URL appears ONCE, on regeneration, and is never readable again (only
// its hash is stored). The card says so instead of letting a manager assume they can
// come back for it.
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

/** Exported (2026-08-30) for AddStudentScreen's invitation link — one copy affordance,
 *  not two spellings of one. */
export function CopyButton({ locale, value }: { locale: Locale; value: string }) {
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

export function SharingCards({ locale }: { locale: Locale }) {
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
          {status.active && status.expires_at
            ? t(locale, 'people.join.card.active').replace(
                '{{date}}',
                formatDateInStudioZone(status.expires_at, locale),
              )
            : t(locale, 'people.join.card.inactive')}
          {' · '}
          {status.registered_count} {t(locale, 'people.join.card.registered')}
        </p>
        {freshUrl ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <code
              style={{ overflowWrap: 'anywhere', fontSize: 'var(--text-caption)' }}
              data-testid="join-link-url"
            >
              {freshUrl}
            </code>
            <div style={rowStyle}>
              <CopyButton locale={locale} value={freshUrl} />
            </div>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 'var(--text-caption)' }}>
              {t(locale, 'people.join.card.onceNote')}
            </p>
          </div>
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

      {status.landing_url ? (
        <Card>
          <h3 style={{ marginBlockStart: 0 }}>{t(locale, 'people.landing.card.title')}</h3>
          <p style={{ color: 'var(--text-muted)' }}>{t(locale, 'people.landing.card.hint')}</p>
          <code
            style={{ overflowWrap: 'anywhere', fontSize: 'var(--text-caption)' }}
            data-testid="landing-url"
          >
            {status.landing_url}
          </code>
          <div style={{ ...rowStyle, marginBlockStart: 'var(--space-2)' }}>
            <CopyButton locale={locale} value={status.landing_url} />
            <a href={status.landing_url} target="_blank" rel="noreferrer">
              {t(locale, 'people.landing.card.title')}
            </a>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
