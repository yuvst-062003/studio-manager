// F4.3 — class and location management. Decided into #/settings (recorded in the
// dashboard log): a class or a hall changes a few times in a club's life, which is
// settings-cadence, while `#/groups` is the screen a manager works weekly — parking
// rare structure edits there would clutter the working screen to save a click a year.
//
// `POST /classes` and `POST /locations` shipped in M1 and had no screen: a studio that
// opened a second hall could not record it.
import { useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'
import { Button, Card, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type ClassRow = { id: string; name: string; discipline: string | null; is_active: boolean }
type LocationRow = { id: string; name: string; address: string | null }

export function StructurePanel({ locale }: { locale: Locale }) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [className, setClassName] = useState('')
  const [locationName, setLocationName] = useState('')
  const [locationAddress, setLocationAddress] = useState('')
  const [failed, setFailed] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/classes')
      .then(async (r) => (r.ok ? ((await r.json()) as { items: ClassRow[] }).items : []))
      .then((rows) => alive && setClasses(rows))
      .catch(() => undefined)
    void apiFetch('/api/v1/locations')
      .then(async (r) => (r.ok ? ((await r.json()) as { items: LocationRow[] }).items : []))
      .then((rows) => alive && setLocations(rows))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [version])

  const create = (path: string, body: Record<string, unknown>, reset: () => void) => {
    setFailed(false)
    void apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((response) => {
      if (!response.ok) {
        setFailed(true)
        return
      }
      reset()
      setVersion((n) => n + 1)
    })
  }

  return (
    <div data-testid="settings-panel-structure">
      <Card>
        <h3>{t(locale, 'common.settings.structure.classes')}</h3>
        <ul>
          {classes.map((row) => (
            <li data-testid={`class-${row.id}`} key={row.id}>
              <bdi>{row.name}</bdi>
              {row.discipline ? ` · ${row.discipline}` : ''}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'end', flexWrap: 'wrap' }}>
          <TextField
            label={t(locale, 'common.settings.structure.className')}
            onChange={(event) => setClassName(event.target.value)}
            value={className}
          />
          <Button
            data-testid="add-class"
            disabled={!className.trim()}
            onClick={() =>
              create('/api/v1/classes', { name: className.trim() }, () => setClassName(''))
            }
          >
            {t(locale, 'common.settings.structure.addClass')}
          </Button>
        </div>
      </Card>

      <Card>
        <h3>{t(locale, 'common.settings.structure.locations')}</h3>
        <ul>
          {locations.map((row) => (
            <li data-testid={`location-${row.id}`} key={row.id}>
              <bdi>{row.name}</bdi>
              {row.address ? ` · ${row.address}` : ''}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'end', flexWrap: 'wrap' }}>
          <TextField
            label={t(locale, 'common.settings.structure.locationName')}
            onChange={(event) => setLocationName(event.target.value)}
            value={locationName}
          />
          <TextField
            label={t(locale, 'common.settings.structure.locationAddress')}
            onChange={(event) => setLocationAddress(event.target.value)}
            value={locationAddress}
          />
          <Button
            data-testid="add-location"
            disabled={!locationName.trim()}
            onClick={() =>
              create(
                '/api/v1/locations',
                { name: locationName.trim(), address: locationAddress.trim() || null },
                () => {
                  setLocationName('')
                  setLocationAddress('')
                },
              )
            }
          >
            {t(locale, 'common.settings.structure.addLocation')}
          </Button>
        </div>
      </Card>
      {failed ? (
        <p data-testid="structure-failed">{t(locale, 'common.loadFailed.body')}</p>
      ) : null}
    </div>
  )
}
