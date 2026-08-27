// What a group IS, for the purposes of a training plan — the manager's two switches and
// one checklist.
//
// **`kind` is set explicitly and is never derived.** §2: Sunday's Judo 8-12 is printed in
// the same blue as the base groups and is a judo class in every other sense, but
// functionally it is an extra. Nothing in the schema could tell them apart before this
// column, and every rule in the feature depends on the distinction.
//
// **The eligibility checklist is base → extra, and only for an extra group.** An
// invite-only group reads an enrollment instead (§4.1 — the Girls Team, and why `person`
// gains no gender column), so showing it a link table the rules never read for it would be
// a control that quietly does nothing. A base group has nothing to be eligible FOR.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, Checkbox, SegmentedControl, Switch } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeTrainingClient } from './trainingClient'
import type { GroupKind, TrainingClient, TrainingGroup } from './trainingClient'

const KINDS: readonly GroupKind[] = ['base', 'extra', 'private']

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

export function GroupTrainingPanel({
  locale,
  groupId,
  client: injected,
}: {
  locale: Locale
  groupId: string
  client?: TrainingClient
}) {
  const [client] = useState<TrainingClient>(() => injected ?? makeTrainingClient())
  const [groups, setGroups] = useState<TrainingGroup[] | null>(null)
  const [linked, setLinked] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const rows = await client.groups().catch(() => [] as TrainingGroup[])
      const links = await client.eligibility(groupId).catch(() => [] as string[])
      if (!alive) return
      setGroups(rows)
      setLinked(links)
    })()
    return () => {
      alive = false
    }
  }, [client, groupId])

  const group = groups?.find((row) => row.id === groupId) ?? null

  const toggle = useCallback(
    (baseGroupId: string) => {
      // Computed from the current list and sent whole — the server replaces, so a request
      // built from a stale half would silently drop the other half.
      const next = linked.includes(baseGroupId)
        ? linked.filter((id) => id !== baseGroupId)
        : [...linked, baseGroupId]
      setLinked(next)
      void client.setEligibility(groupId, next).catch(() => setLinked(linked))
    },
    [client, groupId, linked],
  )

  if (groups === null || group === null) return null

  const bases = groups.filter((row) => row.kind === 'base')

  return (
    <section aria-labelledby="group-training-title" data-testid="group-training">
      <h3 id="group-training-title">{t(locale, 'schedule.plan.group.kind')}</h3>
      <Card>
        <div style={columnStyle}>
          <SegmentedControl
            legend={t(locale, 'schedule.plan.group.kind')}
            value={group.kind}
            options={KINDS.map((kind) => ({
              value: kind,
              label: t(locale, `schedule.plan.group.kind.${kind}`),
            }))}
            onValueChange={(next) => {
              setGroups(
                groups.map((row) =>
                  row.id === groupId ? { ...row, kind: next as GroupKind } : row,
                ),
              )
              void client.setKind(groupId, { kind: next as GroupKind })
            }}
          />

          <span data-testid="group-invite-only">
            <Switch
              label={t(locale, 'schedule.plan.group.inviteOnly')}
              checked={group.is_invite_only}
              // Required by the primitive, and that is G10 rather than bookkeeping: a
              // switch whose state is carried by colour and position alone fails SC 1.4.1.
              stateLabels={{
                on: t(locale, 'common.settings.parentLocale.on'),
                off: t(locale, 'common.settings.parentLocale.off'),
              }}
              onCheckedChange={(next) => {
                setGroups(
                  groups.map((row) =>
                    row.id === groupId ? { ...row, is_invite_only: next } : row,
                  ),
                )
                void client.setKind(groupId, { is_invite_only: next })
              }}
            />
          </span>

          {group.kind === 'extra' && !group.is_invite_only ? (
            <div data-testid="group-eligibility" style={columnStyle}>
              <h4>{t(locale, 'schedule.plan.group.eligibility')}</h4>
              {bases.map((base) => (
                <Checkbox
                  key={base.id}
                  label={base.name}
                  checked={linked.includes(base.id)}
                  onChange={() => toggle(base.id)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </Card>
    </section>
  )
}
