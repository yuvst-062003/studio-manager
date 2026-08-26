// §6.5's install list, and it sits beside the delivery report on purpose.
//
// > "The dashboard lists guardians who have not installed, alongside the push-delivery report
// > (§5.11), so the office can see exactly who it needs to call."
//
// **The two screens answer two halves of one question, and this is the fixable half.** §5.11's
// report says whether THIS message landed; this says whether a family can be reached by any
// message, ever. A family here will be on every delivery report from now until somebody phones
// them.
//
// **iOS and Android are counted apart because they are different facts.** On iOS a
// registration existing at all means the app is on the home screen — a Safari tab has no Push
// API to register from (§12: "absent, not denied"). On Android it means only that somebody
// granted a permission in an ordinary tab. Summing them would hide the number §6.5's install
// walkthrough is actually judged on.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardCommsClient, InstallStateOut } from './dashboardCommsClient'

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const lineStyle: CSSProperties = { color: 'var(--fg)', margin: 0 }

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'space-between',
  paddingBlock: 'var(--space-1)',
}

const PLATFORMS = ['ios', 'android', 'web'] as const

export function InstallState({ client, locale }: { client: DashboardCommsClient; locale: Locale }) {
  const [state, setState] = useState<InstallStateOut | null>(null)

  useEffect(() => {
    let live = true
    client
      .installState()
      .then((next) => live && setState(next))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client])

  if (!state) return null

  return (
    <section style={sectionStyle} aria-labelledby="install-title" data-testid="install-state">
      <h2 id="install-title" style={titleStyle}>
        {t(locale, 'comms.install.title')}
      </h2>

      <p style={lineStyle}>
        {t(locale, 'comms.install.installed').replace('{{count}}', String(state.installed_count))}
      </p>
      <p style={hintStyle}>
        {PLATFORMS.map(
          (platform) =>
            `${t(locale, `comms.install.platform.${platform}`)} ${state.by_platform[platform] ?? 0}`,
        ).join(' · ')}
      </p>

      {state.not_installed_count === 0 ? (
        // Zero is a real and good answer, not an empty state to apologise for.
        <p style={lineStyle} data-testid="install-all-good">
          {t(locale, 'comms.install.emptyGood')}
        </p>
      ) : (
        <>
          <p style={lineStyle}>
            {t(locale, 'comms.install.notInstalled').replace(
              '{{count}}',
              String(state.not_installed_count),
            )}
          </p>
          {/* §5.11 permits no email and no SMS fallback. Said out loud, because a list of
              names with no explanation reads as a nice-to-have rather than as the only
              remaining route to these families. */}
          <p style={hintStyle}>{t(locale, 'comms.install.callThem')}</p>

          {state.not_installed.map((row) => (
            <Card key={row.person_id}>
              <div style={rowStyle} data-testid={`not-installed-${row.person_id}`}>
                <span style={lineStyle}>{row.name}</span>
                <span style={lineStyle}>{row.phone ?? ''}</span>
              </div>
            </Card>
          ))}
        </>
      )}
    </section>
  )
}
