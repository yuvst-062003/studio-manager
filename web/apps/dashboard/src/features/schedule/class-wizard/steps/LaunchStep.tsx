// Step 7 — הרשמה והשקה. The link families register through, and what the class is ready for.
//
// The prototype's step 7 draws four switches: require a health declaration, require the club
// terms, require photo consent, allow a free trial. **The first is not a switch and must not
// be drawn as one.** §5.5 makes the health declaration a hard gate — a guardian with an
// unsigned declaration reaches no other screen — and §3.19 already records that a contract
// test fails if such a setting reappears in settings. A toggle here would be a control that
// either does nothing or contradicts the spec. It is stated as a fact instead.
//
// The link is the studio's real onboarding link, which is per STUDIO and not per class: one
// link, one join flow, and which class a child joins is chosen inside it. Saying that plainly
// beats drawing a per-class link that does not exist.
//
// `selectedMembersToImport` — the prototype's "pick existing members to move into this class"
// — is not here. Moving a student between classes is an enrolment change with a date and a
// price consequence, which is `#/students` and the rollover wizard's work, not a checkbox at
// the end of a create flow.
import { useEffect, useState } from 'react'
import { Button, StatusChip } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { ClassStepProps } from '../ClassWizard'
import type { WizardGroup, WizardLink } from '../client'

export function LaunchStep({ locale, client, classId, klass, onSaved }: ClassStepProps) {
  const [link, setLink] = useState<WizardLink | null>(null)
  const [groups, setGroups] = useState<WizardGroup[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!classId) return
    let live = true
    void Promise.all([client.getLink(), client.listGroups(classId)])
      .then(([loadedLink, loadedGroups]) => {
        if (!live) return
        setLink(loadedLink)
        setGroups(loadedGroups)
      })
      .catch(() => live && setError(t(locale, 'common.loadFailed.body')))
    return () => {
      live = false
    }
  }, [classId, client, locale])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      setLink(await client.createLink())
    } catch {
      setError(t(locale, 'schedule.wizard.launch.linkFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (!classId) return <p>{t(locale, 'schedule.wizard.needsClass')}</p>

  const ready = groups.length > 0

  return (
    <div className="wizard-step">
      <p className="wizard-step__lead">{t(locale, 'schedule.wizard.launch.lead')}</p>

      <dl className="wizard-summary" data-testid="wizard-summary">
        <div className="wizard-summary__row">
          <dt>{t(locale, 'schedule.classes.name')}</dt>
          <dd>{klass?.name ?? '—'}</dd>
        </div>
        <div className="wizard-summary__row">
          <dt>{t(locale, 'schedule.wizard.step.groups.title')}</dt>
          <dd data-testid="wizard-summary-groups">
            {groups.length === 1
              ? t(locale, 'schedule.classes.groupCountOne')
              : fill(t(locale, 'schedule.classes.groupCount'), { count: groups.length })}
          </dd>
        </div>
        <div className="wizard-summary__row">
          <dt>{t(locale, 'schedule.wizard.launch.readiness')}</dt>
          <dd>
            <StatusChip
              label={t(
                locale,
                ready ? 'schedule.wizard.launch.ready' : 'schedule.wizard.launch.notReady',
              )}
              status={ready ? 'paid' : 'pending'}
            />
          </dd>
        </div>
      </dl>

      {/* §5.5, as a statement. Not a switch — see the file header. */}
      <p className="wizard-step__note" data-testid="wizard-health-gate">
        {t(locale, 'schedule.wizard.launch.healthGate')}
      </p>

      <section aria-labelledby="wizard-link-title" className="wizard-step__box">
        <h3 id="wizard-link-title">{t(locale, 'schedule.wizard.launch.linkTitle')}</h3>
        <p className="wizard-step__note">{t(locale, 'schedule.wizard.launch.linkScope')}</p>
        {link?.url ? (
          <p data-testid="wizard-link-url">
            <a dir="ltr" href={link.url} rel="noreferrer" target="_blank">
              {link.url}
            </a>
          </p>
        ) : (
          <Button
            data-testid="wizard-link-create"
            disabled={busy}
            onClick={() => void create()}
            variant="secondary"
          >
            {t(locale, 'schedule.wizard.launch.createLink')}
          </Button>
        )}
      </section>

      {error ? (
        <p className="wizard-step__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="wizard-step__actions">
        {/* The last step's action is the exit. `onSaved` with no next step leaves the
            wizard where it is; the container's own exit button is what leaves. */}
        <Button data-testid="wizard-finish" onClick={() => onSaved()}>
          {t(locale, 'schedule.wizard.finish')}
        </Button>
      </div>
    </div>
  )
}
