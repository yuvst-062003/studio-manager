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
import { Button, Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Modal } from '../../shared/Modal'
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
  const [listOpen, setListOpen] = useState(false)

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
          {/* §5.11's reason — no email, no SMS fallback — moved INTO the dialog, beside
              the list of names it explains. It is said exactly once: kept here as well it
              appeared twice on the same screen once the dialog opened, which the tests
              caught. The button below carries enough on its own. */}

          {/* The list is BEHIND a button, not stacked into the page. It used to render every
              family inline, one card each with a phone number — so a club with thirty
              un-installed families turned the bottom of the announcements screen into thirty
              rows of contact details that nobody was reading at that moment, under a screen
              whose job is composing a message. The owner asked for a popup on 2026-09-10.

              The two NUMBERS stay on the page: "how many families will not receive this" is
              exactly the fact worth seeing before pressing send, and §6.5 put this beside
              the delivery report for that reason. It is the roll-call that is on demand. */}
          <Button
            data-testid="install-list-open"
            onClick={() => setListOpen(true)}
            variant="secondary"
          >
            {t(locale, 'comms.install.openList')}
          </Button>

          {listOpen ? (
            <Modal
              locale={locale}
              onClose={() => setListOpen(false)}
              testId="install-list"
              title={t(locale, 'comms.install.title')}
              width="30rem"
            >
              <p style={hintStyle}>{t(locale, 'comms.install.callThem')}</p>
              {state.not_installed.map((row) => (
                <Card key={row.person_id}>
                  <div style={rowStyle} data-testid={`not-installed-${row.person_id}`}>
                    <span style={lineStyle}>{row.name}</span>
                    {/* `tel:` and not plain text: §5.11 permits no email and no SMS
                        fallback, so calling IS the remaining channel — and a manager on a
                        laptop with a phone paired should not retype a number to use it. */}
                    {row.phone ? (
                      <a href={`tel:${row.phone}`} style={lineStyle}>
                        {row.phone}
                      </a>
                    ) : (
                      <span style={lineStyle} />
                    )}
                  </div>
                </Card>
              ))}
            </Modal>
          ) : null}
        </>
      )}
    </section>
  )
}
