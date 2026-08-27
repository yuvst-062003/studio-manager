// §5.11's eight switches, for the `9e` drawer.
//
// > "Every notification type is individually mutable per user, except health-declaration and
// > payment-failure notices, which are transactional."
//
// **The exception is rendered, not hidden.** A group the server marks `always_on` shows
// `preferences.alwaysOn` — התראה זו נשלחת תמיד — instead of a switch. Two alternatives were
// available and both are worse: omitting the row leaves a parent looking at six switches
// wondering which notifications the missing two are, and rendering a switch that silently
// refuses to move teaches them the screen is broken.
//
// **`always_on` arrives from the server as data.** A component carrying its own copy of the
// rule would be a second place to change when §5.11 changes, and the likelier of the two to be
// missed.
//
// **Optimistic, then reconciled.** A switch that waits for a round trip feels broken on a
// phone; one that never reconciles drifts from the server. So it flips immediately and then
// takes the server's full answer — which is also why PATCH returns all eight rather than the
// one that changed.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Switch } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { NotificationPreferencesOut, StaffCommsClient } from './staffCommsClient'

type Row = NotificationPreferencesOut['groups'][number]

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-2)',
  justifyContent: 'space-between',
  minBlockSize: '44px',
}

const labelStyle: CSSProperties = { color: 'var(--fg)' }

export function NotificationPreferences({
  client,
  locale,
}: {
  client: StaffCommsClient
  locale: Locale
}) {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    let live = true
    client
      .preferences()
      // `?? []` — the drawer must survive a malformed answer; a crash here takes the
      // whole shell down with it, not just this section.
      .then((page) => live && setRows(page.groups ?? []))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client])

  const toggle = useCallback(
    async (row: Row, next: boolean) => {
      setRows((current) =>
        current.map((item) =>
          item.kind_group === row.kind_group ? { ...item, enabled: next } : item,
        ),
      )
      const page = await client.setPreference(row.kind_group, next).catch(() => null)
      // The server's answer wins, including when it refused — a transactional group patched
      // by a stale client comes back unchanged and the switch snaps back rather than lying.
      if (page) setRows(page.groups)
    },
    [client],
  )

  if (rows.length === 0) return null

  return (
    <section
      style={sectionStyle}
      aria-labelledby="preferences-title"
      data-testid="notification-preferences"
    >
      <h2 id="preferences-title" style={titleStyle}>
        {t(locale, 'comms.preferences.title')}
      </h2>
      <p style={hintStyle}>{t(locale, 'comms.preferences.subtitle')}</p>

      {rows.map((row) => (
        <div key={row.kind_group} style={rowStyle} data-testid={`preference-${row.kind_group}`}>
          <span style={labelStyle}>{t(locale, `comms.preferences.kind.${row.kind_group}`)}</span>
          {row.always_on ? (
            // §5.11's exemption, as a sentence rather than a dead control.
            <span style={hintStyle}>{t(locale, 'comms.preferences.alwaysOn')}</span>
          ) : (
            <Switch
              checked={row.enabled}
              label={t(locale, `comms.preferences.kind.${row.kind_group}`)}
              // `preferences.on` / `preferences.off` exist for exactly this: the switch's
              // state has to be readable as words, not only as a position, or a screen
              // reader announces a control with no value.
              stateLabels={{
                on: t(locale, 'comms.preferences.on'),
                off: t(locale, 'comms.preferences.off'),
              }}
              onCheckedChange={(next) => void toggle(row, next)}
            />
          )}
        </div>
      ))}
    </section>
  )
}
