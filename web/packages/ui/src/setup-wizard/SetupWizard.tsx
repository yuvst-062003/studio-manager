// SPEC §5.1's resumable setup wizard — the container, and nothing that belongs to a step.
//
// Six steps, four of them M1's. M7 registers `belts` at order 2 and M6 registers `prices`
// at order 4, each as one file plus one barrel line. **This file is never reopened for
// them**, which is the whole reason the steps are slot entries and not a switch statement.
//
// There is no new `SlotId`: 'setup-wizard' is one of the five M0 declared, and
// `web/apps/parent/src/features/identity/Resolve.tsx` already refused to invent a sixth
// for a comparable case. The M2/M3 gaps inside steps 3 and 6 do not get sub-slots either —
// each of those two step files has exactly one later owner, named in its own header.
//
// Layout: the flow is drawn at 1440×900, and it must also work at 390. Both the dashboard
// and the staff app mount this in place, per §5.1's "the staff app and dashboard" — a
// redirect from staff to the dashboard was considered and rejected, because an owner doing
// setup on a phone is a normal case rather than an error.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '@studio/i18n'
import { LoadFailed } from '../primitives/LoadFailed'
import type { Locale } from '@studio/i18n'
import { useSlot } from '../slots'
import { Button } from '../primitives/Button'
import { WIZARD_STEP_ORDER } from './types'
import type { SetupProgress, WizardStep, WizardStepId, WizardStepProps } from './types'

/** Injected so the container has no opinion about how the app talks to the API. */
export type SetupClient = {
  read: () => Promise<SetupProgress>
  // `pending` reopens a step ticked by mistake — F6 reversed the server's refusal.
  setStep: (stepId: WizardStepId, status: 'done' | 'skipped' | 'pending') => Promise<SetupProgress>
  dismiss: () => Promise<SetupProgress>
}

function statusLabel(locale: Locale, status: WizardStep['status']): string {
  return t(locale, `common.setup.status.${status}`)
}

export function SetupWizard({
  client,
  locale,
  onExit,
}: {
  client: SetupClient
  locale: Locale
  /** Both of §5.1's exits land here — the container does not know which screen follows. */
  onExit?: (reason: 'dashboard' | 'later') => void
}) {
  const entries = useSlot<WizardStepProps>('setup-wizard')
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [activeId, setActiveId] = useState<WizardStepId | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    void client
      .read()
      .then((next) => {
        if (alive) setProgress(next)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [client, attempt])

  // Same studio, two apps: a step reported done on the dashboard must show done on the
  // phone without a full reload (owner report, 2026-08-30). Focus re-asks the server;
  // the manager's own place in the wizard (`activeId`) is untouched by the refresh.
  useEffect(() => {
    const onFocus = () => setAttempt((n) => n + 1)
    globalThis.addEventListener('focus', onFocus)
    return () => globalThis.removeEventListener('focus', onFocus)
  }, [])

  const steps = useMemo(() => progress?.steps ?? [], [progress])

  // §5.1 — 'progress is persisted so the wizard survives a closed app'. Resuming means
  // landing on the first step that has not been reported yet, not on step 1: an owner who
  // finished three steps last night and is sent back to the first of them will conclude
  // nothing was saved.
  const resumeId = useMemo<WizardStepId | null>(() => {
    const registered = new Set(entries.map((entry) => entry.key as WizardStepId))
    const pending = steps.find(
      (step) => step.status === 'pending' && registered.has(step.id as WizardStepId),
    )
    if (pending) return pending.id as WizardStepId
    const first = steps.find((step) => registered.has(step.id as WizardStepId))
    return (first?.id as WizardStepId | undefined) ?? null
  }, [entries, steps])

  const current = activeId ?? resumeId

  const reopen = useCallback(
    async (stepId: WizardStepId) => {
      // Reopening STAYS on the step — the whole point is editing what was answered.
      const next = await client.setStep(stepId, 'pending')
      setProgress(next)
    },
    [client],
  )

  const report = useCallback(
    async (stepId: WizardStepId, status: 'done' | 'skipped') => {
      const next = await client.setStep(stepId, status)
      setProgress(next)
      // Advance to the next step that still needs an answer, staying inside what is
      // actually registered — otherwise skipping `groups` in M1 lands on `prices`, which
      // M6 has not built yet, and the owner sees an empty panel.
      const registered = entries.map((entry) => entry.key as WizardStepId)
      const order = WIZARD_STEP_ORDER.filter((id) => registered.includes(id))
      const after = order.slice(order.indexOf(stepId) + 1)
      const following = next.steps.find(
        (step) => after.includes(step.id as WizardStepId) && step.status === 'pending',
      )
      setActiveId((following?.id as WizardStepId | undefined) ?? stepId)
    },
    [client, entries],
  )

  if (failed) {
    return (
      <section aria-labelledby="setup-title" data-testid="setup-wizard">
        <h2 id="setup-title">{t(locale, 'common.setup.title')}</h2>
        <LoadFailed
          detail={t(locale, 'common.setup.loadFailed')}
          locale={locale}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      </section>
    )
  }

  if (progress === null) {
    return <p data-testid="setup-loading">{t(locale, 'common.setup.loading')}</p>
  }

  const active = entries.find((entry) => entry.key === current)
  const activeStep = steps.find((step) => step.id === current)
  const StepBody = active?.render
  const position = current ? WIZARD_STEP_ORDER.indexOf(current) + 1 : 0

  const done = steps.filter((step) => step.status !== 'pending').length
  const last = position === WIZARD_STEP_ORDER.length

  return (
    <section
      aria-labelledby="setup-title"
      className="setup-shell"
      data-testid="setup-wizard"
    >
      {/* `5c`–`5e`'s header. `5f` drops save-and-exit, because on the last step there is
          nothing left to save for later — the exit there IS the primary action. */}
      <header className="setup-header">
        <span className="setup-header__brand">
          <span aria-hidden="true" className="setup-header__mark" />
          <span id="setup-title">{t(locale, 'common.setup.title')}</span>
        </span>
        {position > 0 ? (
          <span className="setup-header__count" data-testid="setup-position">
            {t(locale, 'common.setup.stepOfSix')
              .replace('{n}', String(position))
              .replace('{total}', String(WIZARD_STEP_ORDER.length))}
          </span>
        ) : null}
        {/* `5c`–`5e` draw save-and-exit; `5f` drops it and offers the dashboard instead,
            because on the last step there is nothing left to save FOR later — finishing
            IS the exit. Both of §5.1's exits stay reachable, one per phase. */}
        <Button
          variant="ghost"
          data-testid="setup-save-exit"
          onClick={() => {
            void client.dismiss().then((next) => {
              setProgress(next)
              // NEITHER app passes `onExit` (found 2026-08-30): both exits dismissed and
              // then went NOWHERE, which read as "there is no finish button". The hash is
              // home in both apps that mount this, so the default exit actually exits.
              if (onExit) onExit('later')
              else globalThis.location.hash = '#/'
            })
          }}
        >
          {t(locale, 'common.setup.continueLater')}
        </Button>
        <Button
          data-testid="setup-open-dashboard"
          onClick={() => {
            void client.dismiss().then((next) => {
              setProgress(next)
              if (onExit) onExit('dashboard')
              else globalThis.location.hash = '#/'
            })
          }}
          variant={last || progress.complete ? 'primary' : 'secondary'}
        >
          {t(locale, 'common.setup.openDashboard')}
        </Button>
      </header>

      <div
        aria-hidden="true"
        className="setup-progress"
        data-testid="setup-progress"
        data-done={done}
      >
        <div
          className="setup-progress__fill"
          style={{ inlineSize: `${(done / WIZARD_STEP_ORDER.length) * 100}%` }}
        />
      </div>

      <div className="setup-body">
        <main data-testid="setup-step-body">
          {/* F6 — going back, both halves: navigate (Back) and un-answer (reopen). The rail
              could always navigate; what did not exist was a way to change an answer. */}
          {current && position > 1 ? (
            <Button
              data-testid="setup-back"
              onClick={() => {
                const order = WIZARD_STEP_ORDER.filter((id) =>
                  entries.some((entry) => entry.key === id),
                )
                const index = order.indexOf(current)
                const previous = order[index - 1]
                if (previous) setActiveId(previous)
              }}
              variant="ghost"
            >
              {t(locale, 'common.setup.back')}
            </Button>
          ) : null}
          {current && activeStep && activeStep.status !== 'pending' ? (
            <Button
              data-testid="setup-reopen"
              onClick={() => void reopen(current)}
              variant="secondary"
            >
              {t(locale, 'common.setup.reopen')}
            </Button>
          ) : null}
          {StepBody && activeStep && current ? (
            <StepBody
              locale={locale}
              status={activeStep.status}
              onDone={() => void report(current, 'done')}
              onSkip={() => void report(current, 'skipped')}
            />
          ) : (
            // A step this SURFACE has not built (2026-08-30): the staff app registers
            // four of seven. Not a dead end any more — the body says where the step is
            // edited, links there, and still lets the owner skip from here.
            <div
              data-testid="setup-step-unbuilt"
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'start' }}
            >
              <p style={{ margin: 0 }}>
                {t(
                  locale,
                  progress.dashboard_url
                    ? 'common.setup.stepInDashboard'
                    : 'common.setup.stepNotBuilt',
                )}
              </p>
              {progress.dashboard_url ? (
                <a
                  className="studio-btn"
                  data-variant="secondary"
                  data-testid="setup-unbuilt-dashboard"
                  href={`${progress.dashboard_url}/#/setup`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t(locale, 'common.setup.openDashboard')}
                </a>
              ) : null}
              {current && activeStep?.status === 'pending' ? (
                <Button
                  data-testid="setup-skip-unbuilt"
                  onClick={() => void report(current, 'skipped')}
                  variant="ghost"
                >
                  {t(locale, 'common.setup.skipForNow')}
                </Button>
              ) : null}
            </div>
          )}
        </main>

        {/* An ordered list, so a screen reader announces "3 of 6" without the rail having
            to say it. `aria-current` names the one being worked on. */}
        <aside className="setup-rail">
          <p className="setup-rail__title">{t(locale, 'common.setup.railTitle')}</p>
          {/* §5.1's reassurance, verbatim from `5c`. It lives HERE and not under the
              welcome heading: 5c shows it once and 5d–5f never show it again, but an owner
              abandons a wizard on step 3, not step 1. */}
          <p className="setup-rail__reassure">{t(locale, 'common.setup.nothingSentYet')}</p>
          <ol
            aria-label={t(locale, 'common.setup.progressLabel')}
            className="setup-rail__list"
          >
            {steps.map((step, index) => {
              const registered = entries.some((entry) => entry.key === step.id)
              const state =
                step.id === current ? 'current' : step.status !== 'pending' ? 'done' : 'upcoming'
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    aria-current={step.id === current ? 'step' : undefined}
                    className="setup-rail__node"
                    data-testid={`setup-rail-${step.id}`}
                    data-status={step.status}
                    data-state={state}
                    data-registered={registered ? undefined : 'false'}
                    // NOT disabled when unregistered (2026-08-30): a dead rail button
                    // read as "payments and belts don't work". The body now explains
                    // where the step is edited and links there.
                    onClick={() => setActiveId(step.id as WizardStepId)}
                  >
                    <span aria-hidden="true" className="setup-rail__dot">
                      {/* A skip is an ANSWER but not a finish — drawn as its own mark
                          (owner report 2026-08-30: "finished them all, still says 6/7,
                          and it doesn't show what's missing"). The ✓ it used to share
                          with done made the two states indistinguishable by eye. */}
                      {state === 'done' ? (step.status === 'skipped' ? '—' : '✓') : index + 1}
                    </span>
                    <span>{t(locale, `common.setup.step.${step.id}`)}</span>
                    {/* Never a circle alone (SC 1.4.1) — the state is written out, and
                        off-screen because the circle already says it to a sighted reader. */}
                    <span
                      className="studio-visually-hidden"
                      data-testid={`setup-rail-${step.id}-status`}
                    >
                      {statusLabel(locale, step.status)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          {/* The way OUT (2026-08-30) — a wizard whose last step ends with nowhere to go
              strands the owner on its own panel. Answered means done OR skipped: a club
              that sells nothing skipped items and is still finished. `#/` is home in both
              apps that mount this. */}
          {steps.length > 0 && steps.every((step) => step.status !== 'pending') ? (
            <a
              className="studio-btn"
              data-variant="primary"
              data-testid="setup-finish"
              href="#/"
              style={{ textAlign: 'center' }}
            >
              {t(locale, 'common.setup.finishCta')}
            </a>
          ) : null}
          <span className="studio-visually-hidden" data-testid="setup-complete">
            {progress.complete
              ? t(locale, 'common.setup.complete')
              : t(locale, 'common.setup.incomplete')}
          </span>
        </aside>
      </div>
    </section>
  )
}
