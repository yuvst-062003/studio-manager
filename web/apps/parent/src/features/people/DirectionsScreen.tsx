// הוראות הגעה (feature pass 2026-08-27). TrialHome has linked `#/directions` since W3
// and the hash routed nowhere — a drawn affordance that silently returned a family
// booked for their first lesson back to home. The screen is the club's address and
// phone from `/me/studio`, a tap-to-call, and a maps handoff; when the studio has not
// set an address, it says so instead of pointing at nothing.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import { Card, Icon, LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type StudioInfo = { name: string; address: string | null; phone: string | null }

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

export function DirectionsScreen({ locale }: { locale: Locale }) {
  const [studio, setStudio] = useState<StudioInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/me/studio')
      .then(async (response) => {
        if (!alive) return
        if (!response.ok) {
          setFailed(true)
          return
        }
        setStudio((await response.json()) as StudioInfo)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [attempt])

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (studio === null) return null

  return (
    <section aria-labelledby="directions-title" style={pageStyle} data-testid="directions">
      <div className="studio-page-header">
        <h1 id="directions-title">{t(locale, 'people.directions.title')}</h1>
      </div>
      <Card>
        <strong>
          <bdi>{studio.name}</bdi>
        </strong>
        {studio.address ? (
          <>
            <p data-testid="directions-address">
              <bdi>{studio.address}</bdi>
            </p>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(studio.address)}`}
              target="_blank"
              rel="noreferrer"
              data-testid="directions-maps"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}
            >
              <Icon name="globe" size={16} />
              {t(locale, 'people.directions.openMaps')}
            </a>
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)' }} data-testid="directions-no-address">
            {t(locale, 'people.directions.noAddress')}
          </p>
        )}
        {studio.phone ? (
          <p>
            <a href={`tel:${studio.phone}`} data-testid="directions-phone">
              {t(locale, 'people.directions.call')} · <bdi>{studio.phone}</bdi>
            </a>
          </p>
        ) : null}
      </Card>
    </section>
  )
}
