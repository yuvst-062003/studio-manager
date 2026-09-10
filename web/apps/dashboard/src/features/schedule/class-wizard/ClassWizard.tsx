// §3.21 — the seven-step class wizard, and the ONLY way a class is created or edited.
//
// The owner settled the shape in two corrections. First: classes come before groups, and a
// class is what you open to find them. Then, on seeing a small edit popup beside it —
// *"remove the popup, it's irrelevant. If want to edit, then the full wizard, but with the
// details already in it."* So there is one flow with two entrances, and editing is not a
// lesser version of creating: it is the same seven steps, each opening on what is already
// there.
//
// **That is why step 1 writes immediately.** Creating the class on step 1 and patching
// forward — rather than collecting seven steps of state and publishing at the end — is what
// makes the two entrances the same flow: after step 1 there is always a class id, and
// "create" and "edit" stop being different code. It is also what makes a half-finished
// class a draft a manager can come back to rather than a lost afternoon. The prototype's
// `handlePublishClass` batches all seven into one publish, which would need a transaction
// the API does not offer and would leave a failure on call five with a class, groups and
// plans behind and no wizard to return to.
//
// Steps 2–7 are unreachable until the class exists, and the rail says so rather than going
// dead: `SetupWizard`'s rail already learned that a disabled node reads as "this step
// doesn't work".
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Button, LoadFailed, Stepper } from '@studio/ui'
import type { StepperNode } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DetailsStep } from './steps/DetailsStep'
import { GroupsStep } from './steps/GroupsStep'
import { PricesStep } from './steps/PricesStep'
import { BeltsStep } from './steps/BeltsStep'
import { ItemsStep } from './steps/ItemsStep'
import { CoachesStep } from './steps/CoachesStep'
import { LaunchStep } from './steps/LaunchStep'
import type { ClassWizardClient, WizardClass } from './client'

export const STEP_IDS = [
  'details',
  'groups',
  'prices',
  'belts',
  'items',
  'coaches',
  'launch',
] as const

export type ClassStepId = (typeof STEP_IDS)[number]

/** What every step is handed. Deliberately small: a step reads and writes for itself. */
export interface ClassStepProps {
  locale: Locale
  client: ClassWizardClient
  /** Null on step 1 of a create — the class does not exist yet. Never null after that. */
  classId: string | null
  klass: WizardClass | null
  /** Called when the step has written. `next` moves the wizard on. */
  onSaved: (klass?: WizardClass) => void
}

const BODIES: Record<ClassStepId, (props: ClassStepProps) => ReactElement> = {
  details: DetailsStep,
  groups: GroupsStep,
  prices: PricesStep,
  belts: BeltsStep,
  items: ItemsStep,
  coaches: CoachesStep,
  launch: LaunchStep,
}

export function ClassWizard({
  locale,
  client,
  classId: initialClassId,
  onExit,
}: {
  locale: Locale
  client: ClassWizardClient
  /** An existing class to edit, or null to create one. */
  classId: string | null
  /** Where the manager goes when they leave — the class, or the index. */
  onExit: (classId: string | null) => void
}) {
  const editing = initialClassId !== null
  const [classId, setClassId] = useState<string | null>(initialClassId)
  const [klass, setKlass] = useState<WizardClass | null>(null)
  const [active, setActive] = useState<ClassStepId>('details')
  // Which steps the manager has finished in THIS sitting. Not persisted: unlike the setup
  // wizard there is no `/setup/steps` table for a class, and inventing one to remember
  // that somebody pressed Next would be a migration for a progress bar. What IS persisted
  // is the work itself — every step writes when it saves.
  const [visited, setVisited] = useState<Set<ClassStepId>>(new Set())
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!initialClassId) return
    let live = true
    void client
      .getClass(initialClassId)
      .then((row) => {
        if (live) setKlass(row)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [attempt, client, initialClassId])

  const index = STEP_IDS.indexOf(active)

  const nodes = useMemo<StepperNode[]>(
    () =>
      STEP_IDS.map((id, at) => ({
        id,
        title: t(locale, `schedule.wizard.step.${id}.title`),
        subtitle: t(locale, `schedule.wizard.step.${id}.subtitle`),
        state:
          id === active
            ? 'current'
            : visited.has(id)
              ? 'done'
              : 'upcoming',
        // Every step but the first needs a class to write against.
        reachable: at === 0 || classId !== null,
      })),
    [active, classId, locale, visited],
  )

  const onSaved = useCallback(
    (saved?: WizardClass) => {
      if (saved) {
        setKlass(saved)
        setClassId(saved.id)
      }
      setVisited((current) => new Set(current).add(active))
      const next = STEP_IDS[index + 1]
      if (next) setActive(next)
      // The last step's save IS the finish. Leaving from there lands on the class the
      // manager just built rather than on a wizard with nothing left to do in it.
      else onExit(saved?.id ?? classId)
    },
    [active, classId, index, onExit],
  )

  // An edit opens on a class that failed to load: there is nothing to pre-fill the steps
  // with, and a wizard that opened blank over an existing class would overwrite it with
  // whatever the manager typed.
  if (failed) {
    return (
      <section aria-labelledby="class-wizard-title" className="class-wizard">
        <h1 id="class-wizard-title">{t(locale, 'schedule.wizard.editTitle')}</h1>
        <LoadFailed
          locale={locale}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      </section>
    )
  }

  if (editing && klass === null) {
    return <p data-testid="class-wizard-loading">{t(locale, 'common.setup.loading')}</p>
  }

  const Body = BODIES[active]

  return (
    <section aria-labelledby="class-wizard-title" className="class-wizard">
      <header className="class-wizard__head">
        <div>
          <h1 className="class-wizard__title" id="class-wizard-title">
            {/* An edit is titled by the class, so a manager three steps in still knows
                which one they opened. */}
            {klass ? klass.name : t(locale, 'schedule.wizard.createTitle')}
          </h1>
          <p className="class-wizard__subtitle">
            {t(locale, editing ? 'schedule.wizard.editSubtitle' : 'schedule.wizard.createSubtitle')}
          </p>
        </div>
        {/* Leaving is never destructive — every step that has saved has already written. */}
        <Button
          data-testid="class-wizard-exit"
          onClick={() => onExit(classId)}
          variant="secondary"
        >
          {t(locale, 'schedule.wizard.exit')}
        </Button>
      </header>

      <Stepper
        label={t(locale, 'schedule.wizard.progress')}
        locale={locale}
        nodes={nodes}
        onPick={(id) => setActive(id as ClassStepId)}
      />

      <div className="class-wizard__body" data-testid={`class-wizard-step-${active}`}>
        <Body classId={classId} client={client} klass={klass} locale={locale} onSaved={onSaved} />
      </div>

      <footer className="class-wizard__foot">
        {index > 0 ? (
          <Button
            data-testid="class-wizard-back"
            onClick={() => {
              const previous = STEP_IDS[index - 1]
              if (previous) setActive(previous)
            }}
            variant="ghost"
          >
            {t(locale, 'common.setup.back')}
          </Button>
        ) : null}
        <span className="class-wizard__count" data-testid="class-wizard-position">
          {fill(t(locale, 'schedule.wizard.stepOf'), {
            n: index + 1,
            total: STEP_IDS.length,
          })}
        </span>
      </footer>
    </section>
  )
}
