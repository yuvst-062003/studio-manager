// The missing first step of 5b (design pass 2026-08-27): `#/belts` only ever rendered
// WITH a classId, so the bare nav link landed on a blank page. §5.9 puts a ladder on a
// CLASS, so the index is the class list — one card each, straight into its ladder.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import { Card, EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type ClassRow = { id: string; name: string }

const listStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))',
  gap: 'var(--space-3)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

export function BeltsIndex({ locale }: { locale: Locale }) {
  const [classes, setClasses] = useState<ClassRow[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const response = await apiFetch('/api/v1/classes?limit=100')
        if (!response.ok) {
          if (alive) setClasses([])
          return
        }
        const body = (await response.json()) as { items: ClassRow[] }
        if (alive) setClasses(body.items)
      } catch {
        if (alive) setClasses([])
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (classes === null) return null
  if (classes.length === 0) return <EmptyState title={t(locale, 'events.belt.noClasses')} />
  return (
    <section aria-labelledby="belts-index-title" data-testid="belts-index">
      <div className="studio-page-header">
        <h2 id="belts-index-title">{t(locale, 'events.belt.title')}</h2>
      </div>
      <ul style={listStyle}>
        {classes.map((row) => (
          <li key={row.id}>
            <a href={`#/belts/${row.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card>
                <strong>{row.name}</strong>
                <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--text-muted)' }}>
                  {t(locale, 'events.belt.openLadder')}
                </p>
              </Card>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
