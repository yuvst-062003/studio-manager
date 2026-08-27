// SPEC §5.15's training-year rollover — the container, and nothing that belongs to a step.
//
// §5.15 calls this "the single highest-leverage screen in the product": one flow that can
// rename every group, move every student and reprice every plan a studio has. It is run once
// a year, which is exactly why every affordance has to be legible to someone who last saw it
// twelve months ago.
//
// ── What this file does NOT do ─────────────────────────────────────────────────────
// **It never computes completeness.** Each step reports its own outcome through `onDone` /
// `onSkip`, the same seam `packages/ui/src/setup-wizard/SetupWizard.tsx` holds. The reason is
// on the server and it is not a style preference: a studio whose groups all carry forward
// unchanged edits no group, and a year with no price rise closes no plan, so "zero rows
// written" and "not started" are indistinguishable from the data. A container that guessed
// would either loop the manager back to step 3 for ever or tick it before they had looked.
//
// **It never marks a derived step.** `year` and `generate` answer 409 to
// `PATCH .../steps/{id}` — `isDerivedStep` gates the call, and `StepActions` renders
// "continue" rather than "done" so the screen never offers a press that fails.
//
// ── Resuming ───────────────────────────────────────────────────────────────────────
// The server sends `resume_at`, and it is authoritative. §5.15 makes the wizard resumable and
// the schema's own comment says why it is never step 1: "a manager who closed the tab after
// pricing comes back to pricing, not to retyping the year's name." Landing on step 1 anyway
// is how a manager concludes nothing was saved — so the container opens `resume_at` and a
// test asserts it.
//
// ── The rail ───────────────────────────────────────────────────────────────────────
// An `<ol>`, so a screen reader announces position without the visual rail spelling it out;
// `aria-current="step"` names the one being worked on; every status is a WORD beside the
// name, never a colour alone (SC 1.4.1); and a step that cannot be reached yet is `disabled`
// rather than hidden, so the shape of the flow is stable between visits.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { fill } from './client'
import type { RolloverClient, RolloverState, TrainingYear } from './client'
import { ROLLOVER_STEP_ORDER, isDerivedStep } from './types'
import type { RolloverStepId, RolloverStepStatus } from './types'
import { AnnounceStep } from './AnnounceStep'
import { ClosuresStep } from './ClosuresStep'
import { GenerateStep } from './GenerateStep'
import { GroupsStep } from './GroupsStep'
import { PricesStep } from './PricesStep'
import { StudentsStep } from './StudentsStep'
import { YearStep } from './YearStep'

const shellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
  maxWidth: '72rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const railStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  // Logical properties throughout (D10): the rail runs right-to-left in `he` and
  // left-to-right in `en`, and `padding-left` would be wrong in one of them.
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--surface)',
}

const introStyle: CSSProperties = { color: 'var(--text-secondary)' }

const noteStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
}

const summaryStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-4)',
  margin: 0,
}

const summaryPairStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
}

const summaryValueStyle: CSSProperties = { margin: 0, fontWeight: 'var(--weight-semibold)' }

function statusWord(locale: Locale, status: RolloverStepStatus): string {
  return t(locale, `schedule.rollover.status.${status}`)
}

/** One `<dt>`/`<dd>` of the counts the server sends beside the rail. */
function SummaryPair({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div style={summaryPairStyle}>
      <dt style={noteStyle}>{label}</dt>
      <dd style={summaryValueStyle} data-testid={testId}>
        {value}
      </dd>
    </div>
  )
}

export function RolloverWizard({ locale, client }: { locale: Locale; client: RolloverClient }) {
  const [year, setYear] = useState<TrainingYear | null>(null)
  const [yearLoaded, setYearLoaded] = useState(false)
  const [state, setState] = useState<RolloverState | null>(null)
  const [activeId, setActiveId] = useState<RolloverStepId | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // The draft year is the resume token — §5.15 puts partial progress on it rather than in a
  // table, so finding it is how the wizard finds itself.
  useEffect(() => {
    let live = true
    void client
      .listTrainingYears()
      .then((years) => {
        if (!live) return
        const draft = [...years].reverse().find((candidate) => candidate.status === 'draft')
        setYear(draft ?? null)
        setYearLoaded(true)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [client, attempt])

  const yearId = year?.id ?? null

  const reload = useCallback(async () => {
    if (!yearId) return
    setState(await client.readState(yearId))
  }, [client, yearId])

  useEffect(() => {
    if (!yearId) return
    let live = true
    void client
      .readState(yearId)
      .then((next) => {
        if (live) setState(next)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [client, yearId])

  const steps = useMemo(() => state?.steps ?? [], [state])
  // `resume_at` is the server's answer and the container does not second-guess it.
  const current = activeId ?? state?.resume_at ?? 'year'

  const advance = useCallback((from: RolloverStepId) => {
    const after = ROLLOVER_STEP_ORDER.slice(ROLLOVER_STEP_ORDER.indexOf(from) + 1)
    setActiveId(after[0] ?? from)
  }, [])

  const report = useCallback(
    async (stepId: RolloverStepId, status: 'done' | 'skipped') => {
      // A derived step is answered by the data. Sending a PATCH for one is a guaranteed 409,
      // so `onDone` there means only "move me along" — the status still comes from the read.
      if (isDerivedStep(stepId)) {
        await reload()
        advance(stepId)
        return
      }
      if (!yearId) return
      const next = await client.setStep(yearId, stepId, status)
      setState(next)
      advance(stepId)
    },
    [advance, client, reload, yearId],
  )

  if (failed) {
    return (
      <section aria-labelledby="rollover-title" data-testid="rollover-wizard">
        <h1 id="rollover-title">{t(locale, 'schedule.rollover.title')}</h1>
        <LoadFailed
          detail={t(locale, 'schedule.rollover.loadFailed')}
          locale={locale}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      </section>
    )
  }

  if (!yearLoaded) {
    return <p data-testid="rollover-loading">{t(locale, 'schedule.rollover.loading')}</p>
  }

  // No draft year yet: step 1 is the whole screen, because there is nothing to roll over
  // until one exists. The rail would be seven disabled chips and no information.
  if (!year) {
    return (
      <section aria-labelledby="rollover-title" style={shellStyle} data-testid="rollover-wizard">
        <header>
          <h1 id="rollover-title">{t(locale, 'schedule.rollover.title')}</h1>
          <p style={introStyle}>{t(locale, 'schedule.rollover.subtitle')}</p>
          <p data-testid="rollover-no-year">{t(locale, 'schedule.rollover.year.missing')}</p>
          <p style={noteStyle}>{t(locale, 'schedule.rollover.year.missingHint')}</p>
        </header>
        <YearStep
          locale={locale}
          status="pending"
          onDone={() => advance('year')}
          onSkip={() => advance('year')}
          client={client}
          year={null}
          onYearCreated={(created) => {
            setYear(created)
            setActiveId('closures')
          }}
        />
      </section>
    )
  }

  if (state === null) {
    return <p data-testid="rollover-loading">{t(locale, 'schedule.rollover.loading')}</p>
  }

  const activeStep = steps.find((step) => step.id === current)
  const activeStatus: RolloverStepStatus = activeStep?.status ?? 'pending'
  const position = ROLLOVER_STEP_ORDER.indexOf(current) + 1
  const shared = {
    locale,
    status: activeStatus,
    onDone: () => void report(current, 'done'),
    onSkip: () => void report(current, 'skipped'),
  }

  return (
    <section aria-labelledby="rollover-title" style={shellStyle} data-testid="rollover-wizard">
      <header>
        <h1 id="rollover-title">{t(locale, 'schedule.rollover.title')}</h1>
        <p style={introStyle}>{t(locale, 'schedule.rollover.subtitle')}</p>
        <p data-testid="rollover-position">
          {fill(t(locale, 'schedule.rollover.stepOf'), {
            n: position,
            total: ROLLOVER_STEP_ORDER.length,
          })}
        </p>
        {state.training_year.status === 'draft' ? (
          <p style={noteStyle} data-testid="rollover-draft-hint">
            {t(locale, 'schedule.rollover.draftOnlyHint')}
          </p>
        ) : null}
      </header>

      {/* An ordered list, so a screen reader announces "3 of 7" without the visual rail
          having to say it. `aria-current` names the one being worked on. */}
      <ol aria-label={t(locale, 'schedule.rollover.progressLabel')} style={railStyle}>
        {ROLLOVER_STEP_ORDER.map((stepId) => {
          const step = steps.find((candidate) => candidate.id === stepId)
          return (
            <li key={stepId}>
              <button
                type="button"
                aria-current={stepId === current ? 'step' : undefined}
                data-testid={`rollover-rail-${stepId}`}
                data-status={step?.status ?? 'pending'}
                // Unreachable rather than hidden: the flow has seven steps whether or not
                // the server sent them all, and a rail that changes length between visits is
                // a rail nobody can navigate from memory.
                disabled={step === undefined}
                onClick={() => setActiveId(stepId)}
                style={chipStyle}
              >
                <span>{t(locale, `schedule.rollover.step.${stepId}`)}</span>
                {/* Never colour alone (SC 1.4.1) — the state is written out. */}
                <span data-testid={`rollover-rail-${stepId}-status`}>
                  {statusWord(locale, step?.status ?? 'pending')}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <Card caption={t(locale, 'schedule.rollover.summaryLabel')}>
        <dl style={summaryStyle}>
          <SummaryPair
            label={t(locale, 'schedule.rollover.count.closures')}
            value={state.closures}
            testId="rollover-count-closures"
          />
          <SummaryPair
            label={t(locale, 'schedule.rollover.count.groups')}
            value={state.groups_active}
            testId="rollover-count-groups"
          />
          <SummaryPair
            label={t(locale, 'schedule.rollover.count.students')}
            value={state.students_enrolled}
            testId="rollover-count-students"
          />
          <SummaryPair
            label={t(locale, 'schedule.rollover.count.plans')}
            value={state.price_plans_open}
            testId="rollover-count-plans"
          />
          <SummaryPair
            label={t(locale, 'schedule.rollover.count.sessions')}
            value={state.sessions_generated}
            testId="rollover-count-sessions"
          />
        </dl>
      </Card>

      <div data-testid="rollover-step-body">
        {current === 'year' ? (
          <YearStep
            {...shared}
            client={client}
            year={state.training_year}
            onYearCreated={(created) => setYear(created)}
          />
        ) : null}
        {current === 'closures' ? (
          <ClosuresStep
            {...shared}
            client={client}
            trainingYearId={state.training_year.id}
            presetYear={Number(state.training_year.starts_on.slice(0, 4))}
            closures={state.closures}
            onChanged={() => void reload()}
          />
        ) : null}
        {current === 'groups' ? (
          <GroupsStep
            {...shared}
            client={client}
            trainingYearId={state.training_year.id}
            onChanged={() => void reload()}
          />
        ) : null}
        {current === 'students' ? (
          <StudentsStep
            {...shared}
            client={client}
            trainingYearId={state.training_year.id}
            onChanged={() => void reload()}
          />
        ) : null}
        {current === 'prices' ? (
          <PricesStep
            {...shared}
            client={client}
            trainingYearId={state.training_year.id}
            onChanged={() => void reload()}
          />
        ) : null}
        {current === 'generate' ? (
          <GenerateStep
            {...shared}
            client={client}
            trainingYearId={state.training_year.id}
            sessionsGenerated={state.sessions_generated}
            onChanged={() => void reload()}
          />
        ) : null}
        {current === 'announce' ? (
          <AnnounceStep
            {...shared}
            client={client}
            year={state.training_year}
            onChanged={() => void reload()}
          />
        ) : null}
      </div>

      <footer>
        {/* `complete` is the server's, computed from the seven statuses. `skipped` counts —
            §5.15 makes step 7 optional in as many words. */}
        <p data-testid="rollover-complete">
          {state.complete
            ? t(locale, 'schedule.rollover.complete')
            : t(locale, 'schedule.rollover.incomplete')}
        </p>
      </footer>
    </section>
  )
}
