// The two links a club shares (feature pass 2026-08-27): §5.4b's onboarding link — the
// moving van, for families that already train — and §5.4a's landing page — the shop
// window, for new ones. One card each, side by side where the manager already manages
// people, because "which link do I send" is the question this pair answers.
//
// The onboarding link is PERMANENT and always re-copyable (owner decision, 2026-08-31).
// It used to appear once on regeneration and never again — only its hash was stored — so
// a manager who reloaded the page saw a live link with no way to reach it. The token is
// stored encrypted now and `GET` returns the URL, so העתקה works on every load.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { ActionBar, Button, Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import './people.css'

type LinkStatus = {
  active: boolean
  expires_at: string | null
  registered_count: number
  landing_url: string | null
  /** The live link. Null when there is none — and for a pre-2026-08-31 row whose token
   *  was only ever hashed, which is why the card falls back to "create a new one". */
  url: string | null
}

// B2.4 — one grid row, both cards stretched to it (`align-items: stretch`), so the join
// card's extra status line no longer leaves it a different height than the landing card
// for no reason a reader can see.
const cardsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
  alignItems: 'stretch',
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

  // The link the card can actually put on the clipboard: the one just created, or the
  // live one read back. Null for a pre-2026-08-31 row, whose token was only hashed.
  const canCopy = freshUrl ?? status.url

  return (
    <div style={cardsStyle} data-testid="sharing-cards">
      <Card>
        {/* B2.4 — one column per card, so `.people-sharing-card__actions`'s auto
            margin-block-start pushes the ActionBar to the same block-end edge in both
            cards regardless of how much status text sits above it. */}
        <div className="people-sharing-card">
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
          {/* The link itself, on every load. `freshUrl` still wins for the moment after
              a regenerate, when the status reload has not landed yet. */}
          {canCopy ? (
            <code
              style={{ overflowWrap: 'anywhere', fontSize: 'var(--text-caption)' }}
              data-testid="join-link-url"
            >
              {canCopy}
            </code>
          ) : status.active ? (
            // Live, but its token predates `token_encrypted` and is unrecoverable. Said
            // plainly rather than leaving the manager to wonder where the link went.
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 'var(--text-caption)' }}>
              {t(locale, 'people.join.card.legacyNote')}
            </p>
          ) : null}
          {/* B2.4 — העתקה and ביטול in one `ActionBar` row instead of two stacked rows.
              A live, copyable link offers no "new one" (2026-08-31): regenerating
              revokes the link already sitting in the club's WhatsApp groups, and once
              the link is permanent there is no reason to reach for that — so replacing
              one is a deliberate two steps, ביטול then create. `end` carries whichever
              of copy/new applies; `start` — the escape hatch — is ביטול, offered only
              while a link is actually active. */}
          <div className="people-sharing-card__actions">
            <ActionBar
              end={
                canCopy ? (
                  <CopyButton locale={locale} value={canCopy} />
                ) : (
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
                )
              }
              start={
                status.active ? (
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
                ) : undefined
              }
            />
          </div>
        </div>
      </Card>

      {status.landing_url ? (
        <Card>
          <div className="people-sharing-card">
            <h3 style={{ marginBlockStart: 0 }}>{t(locale, 'people.landing.card.title')}</h3>
            <p style={{ color: 'var(--text-muted)' }}>{t(locale, 'people.landing.card.hint')}</p>
            <code
              style={{ overflowWrap: 'anywhere', fontSize: 'var(--text-caption)' }}
              data-testid="landing-url"
            >
              {status.landing_url}
            </code>
            <div className="people-sharing-card__actions">
              <ActionBar
                end={
                  <>
                    <CopyButton locale={locale} value={status.landing_url} />
                    <a href={status.landing_url} target="_blank" rel="noreferrer">
                      {t(locale, 'people.landing.card.title')}
                    </a>
                  </>
                }
              />
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
