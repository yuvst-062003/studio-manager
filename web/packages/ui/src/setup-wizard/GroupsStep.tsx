// Step 3 · קבוצות ולו״ז.
//
// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED BY: W2's **SCHEDULE lane (M2)**, and by nobody else.
//
// What is here is M1's half — create a class, create a group, set a location, all through
// endpoints M1.4 already shipped. The weekly schedule is `group_schedule_rule`, a W2
// contract model, so the לו״ז half of this step lands when SCHEDULE does.
//
// It gets NO sub-slot. `SlotId` is a closed five-value union in a file the plan says is
// authored once, and this step has exactly one later owner — so a second seam would buy
// nothing that "one lane owns this file" does not already give.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import { Button } from '../primitives/Button'
import { TextField } from '../primitives/TextField'
import type { WizardStepProps } from './types'

export type NamedRow = { id: string; name: string }

export type StructureClient = {
  listClasses: () => Promise<NamedRow[]>
  listGroups: () => Promise<NamedRow[]>
  listLocations: () => Promise<NamedRow[]>
  createClass: (name: string) => Promise<NamedRow>
  createGroup: (classId: string, name: string) => Promise<NamedRow>
  createLocation: (name: string) => Promise<NamedRow>
}

const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'end',
  flexWrap: 'wrap',
}

export function makeGroupsStep(client: StructureClient) {
  return function GroupsStep({ locale, status, onDone, onSkip }: WizardStepProps) {
    const [classes, setClasses] = useState<NamedRow[]>([])
    const [groups, setGroups] = useState<NamedRow[]>([])
    const [locations, setLocations] = useState<NamedRow[]>([])
    const [className, setClassName] = useState('')
    const [groupName, setGroupName] = useState('')
    const [locationName, setLocationName] = useState('')
    const [busy, setBusy] = useState(false)

    useEffect(() => {
      let alive = true
      void Promise.all([client.listClasses(), client.listGroups(), client.listLocations()]).then(
        ([c, g, l]) => {
          if (!alive) return
          setClasses(c)
          setGroups(g)
          setLocations(l)
        },
      )
      return () => {
        alive = false
      }
    }, [])

    const run = (work: () => Promise<void>) => {
      setBusy(true)
      void work().finally(() => setBusy(false))
    }

    return (
      <section aria-labelledby="setup-groups-title" data-testid="setup-step-groups">
        <h3 id="setup-groups-title">{t(locale, 'common.setup.step.groups')}</h3>

        <div style={rowStyle}>
          <TextField
            label={t(locale, 'common.setup.groups.className')}
            value={className}
            onChange={(event) => setClassName(event.target.value)}
          />
          <Button
            disabled={busy || className.trim() === ''}
            onClick={() =>
              run(async () => {
                const row = await client.createClass(className.trim())
                setClasses((current) => [...current, row])
                setClassName('')
              })
            }
          >
            {t(locale, 'common.setup.groups.addClass')}
          </Button>
        </div>
        <ul data-testid="setup-classes" style={listStyle}>
          {classes.map((row) => (
            <li key={row.id}>{row.name}</li>
          ))}
        </ul>

        <div style={rowStyle}>
          <TextField
            label={t(locale, 'common.setup.groups.groupName')}
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            // A group belongs to a class, so there is nothing to name until one exists.
            // Disabled and explained beats a 422 from the server.
            disabled={classes.length === 0}
            hint={classes.length === 0 ? t(locale, 'common.setup.groups.needClass') : undefined}
          />
          <Button
            disabled={busy || classes.length === 0 || groupName.trim() === ''}
            onClick={() =>
              run(async () => {
                const parent = classes[0]
                if (!parent) return
                const row = await client.createGroup(parent.id, groupName.trim())
                setGroups((current) => [...current, row])
                setGroupName('')
              })
            }
          >
            {t(locale, 'common.setup.groups.addGroup')}
          </Button>
        </div>
        <ul data-testid="setup-groups" style={listStyle}>
          {groups.map((row) => (
            <li key={row.id}>{row.name}</li>
          ))}
        </ul>

        <div style={rowStyle}>
          <TextField
            label={t(locale, 'common.setup.groups.locationName')}
            value={locationName}
            onChange={(event) => setLocationName(event.target.value)}
          />
          <Button
            disabled={busy || locationName.trim() === ''}
            onClick={() =>
              run(async () => {
                const row = await client.createLocation(locationName.trim())
                setLocations((current) => [...current, row])
                setLocationName('')
              })
            }
          >
            {t(locale, 'common.setup.groups.addLocation')}
          </Button>
        </div>
        <ul data-testid="setup-locations" style={listStyle}>
          {locations.map((row) => (
            <li key={row.id}>{row.name}</li>
          ))}
        </ul>

        <Button disabled={busy || groups.length === 0} onClick={onDone}>
          {t(locale, 'common.setup.continue')}
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {t(locale, 'common.setup.skip')}
        </Button>
        <p data-testid="setup-groups-status">{t(locale, `common.setup.status.${status}`)}</p>
      </section>
    )
  }
}
