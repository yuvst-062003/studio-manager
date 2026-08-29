// The unfinished-setup nudge (owner request, 2026-08-28).
//
// §5.1 lets every wizard step be skipped and lets the owner dismiss the whole thing — the
// right calls for a first run, and also how a club ends up half-configured with nothing
// anywhere saying so. This banner is that missing sentence: rendered in the manager-facing
// shells, it names how far setup got and jumps back into the wizard.
//
// **The caller gates who mounts it.** `GET /setup` is ManagerOrOwner, and S4 already
// taught this codebase what mounting a manager-only read in front of a coach costs: a 403
// on every screen, on every launch. The apps mount this for owners and managers only;
// a failed read here renders nothing rather than an error — a nudge is not worth an alarm.
import { useEffect, useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Alert } from '../primitives/Alert'
import { Button } from '../primitives/Button'
import type { SetupClient } from './SetupWizard'
import type { SetupProgress } from './types'

export function SetupIncompleteBanner({
  client,
  locale,
  onOpen,
}: {
  client: SetupClient
  locale: Locale
  /** Takes the manager into the wizard — each app knows its own route there. */
  onOpen: () => void
}) {
  const [progress, setProgress] = useState<SetupProgress | null>(null)

  useEffect(() => {
    let live = true
    client
      .read()
      .then((body) => live && setProgress(body))
      .catch(() => {
        // Offline, or a race on sign-out. The nudge simply does not appear; it will be
        // asked again on the next mount, and a setup banner is never worth an error state.
      })
    return () => {
      live = false
    }
  }, [client])

  // `complete`, not `dismissed_at`: dismissing the wizard is exactly the state this
  // banner exists for — the owner left early, and the way back should be one tap.
  // A payload without a steps array (a proxy error page, a stub) renders nothing for the
  // same reason a failed read does.
  if (!progress || progress.complete || !Array.isArray(progress.steps)) return null

  const done = progress.steps.filter((step) => step.status === 'done').length

  return (
    <div data-testid="setup-incomplete">
      <Alert iconLabel={t(locale, 'common.setup.incomplete.title')} tone="pending">
        {/* `Alert` renders its children inside a single <p>, so these three were inline
            siblings — and JSX strips the whitespace between elements on separate lines.
            On staging that printed `הקמת המועדוןעדיין לא הושלמההושלמו 1 מתוך 6 שלבים`:
            two sentences and a count run together, on the first screen a manager sees.
            Spans rather than divs because a <div> inside a <p> is invalid and the
            browser would close the paragraph early, which is a worse bug than the one
            being fixed. */}
        <span className="studio-setup-nudge">
          <span className="studio-setup-nudge__text">
            <strong>{t(locale, 'common.setup.incomplete.title')}</strong>
            <span data-testid="setup-incomplete-progress">
              {t(locale, 'common.setup.incomplete.progress')
                .replace('{{done}}', String(done))
                .replace('{{total}}', String(progress.steps.length))}
            </span>
          </span>
          <Button data-testid="setup-incomplete-resume" onClick={onOpen} variant="secondary">
            {t(locale, 'common.setup.incomplete.resume')}
          </Button>
        </span>
      </Alert>
    </div>
  )
}
