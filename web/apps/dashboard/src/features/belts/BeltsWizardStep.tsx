// Artboard 5d — אשף · שלב 2, "איזו מערכת חגורות נהוגה אצלכם?"
//
// **Seam 4, from this lane's side.** M1 owns the wizard container; this file registers one
// entry into its `setup-wizard` slot and the container is never reopened — not
// `SetupWizard.tsx`, and not `packages/ui/src/setup-wizard/register.ts`, which registers
// M1's OWN four steps and would be an M7 line inside M1's file. `slots.ts` describes
// exactly this: one file calling `registerSlot()`, plus one line in the lane's own barrel.
//
// **The container never computes completeness.** `types.ts` says so, and it is what makes
// the seam hold: the container cannot know when *belts* is finished without M7 reopening
// it. The step reports its own outcome through `onDone`.
//
// **A ladder needs a class, and at step 2 there may not be one.** `WIZARD_STEP_ORDER` is
// studio · belts · groups · prices · staff · students, `groups` is where classes are
// created, and `belt_rank.class_id` is `NOT NULL`. Nothing in step 1 creates a class. So
// this step reads M1's `/classes`, seeds into the one the manager picks, and — when the
// studio has none yet — says so and offers `onSkip`, which is the outcome the container
// already understands.
//
// That contradicts `5d`, which draws no defer link, and the audit justified the absence:
// "belt setup is required and pricing is not". The requirement stands; it is the ORDERING
// that makes it unmeetable at step 2. Reported rather than resolved by inventing storage
// for a choice made before the thing it applies to exists.
//
// **No promotion condition is claimed.** The canvas's preview footer states a default of
// "80% נוכחות · 4 חודשי ותק" and its caption promises a promotion every three to four
// months. `belt_rank` has no threshold column, `events.exam.eligibleHint` names the current
// rank and time held, and §5.9 has no cadence at all — so the preview shows the ranks and
// says nothing about when a child moves between them.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ActionBar, BeltBar, Button, Radio, SectionHeader, registerSlot } from '@studio/ui'
import type { WizardStepProps } from '@studio/ui'
import { t } from '@studio/i18n'
import type { BeltPresetOut, ClassOut, DashboardBeltsClient } from './client'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const cardsStyle: CSSProperties = {
  border: 0,
  display: 'grid',
  gap: 'var(--space-3)',
  gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
  margin: 0,
  padding: 0,
}

const legendStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  fontWeight: 'var(--weight-medium)',
  padding: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

/** `5d` lists the first few ranks and says how many follow. */
const PREVIEW_ROWS = 7

/** The fourth card. It creates nothing — the absence of a preset, not a preset. */
export const SCRATCH = 'scratch'

export function BeltsWizardStep({
  client,
  locale,
  onDone,
  onSkip,
}: WizardStepProps & { client: DashboardBeltsClient }) {
  const [presets, setPresets] = useState<BeltPresetOut[]>([])
  const [classes, setClasses] = useState<ClassOut[] | null>(null)
  const [classId, setClassId] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  // 2026-08-28 — the two dead ends the owner hit. A class that ALREADY has a ladder made
  // `seed` answer 409, the await threw, and the button silently did nothing: no error, no
  // continue, a wizard with no way forward. The step now reads the existing ladder first
  // and offers plain continuation; a seed failure gets words and a retry.
  const [existingLadder, setExistingLadder] = useState<{ classId: string; count: number } | null>(null)
  const [seedError, setSeedError] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([client.presets(), client.classes()])
      .then(([presetPage, classPage]) => {
        if (!live) return
        setPresets(presetPage.items)
        setClasses(classPage.items)
        setClassId(classPage.items[0]?.id ?? null)
      })
      .catch(() => live && setClasses([]))
    return () => {
      live = false
    }
  }, [client])

  useEffect(() => {
    if (classId === null) return
    let live = true
    client
      .ladder(classId)
      .then((page) => live && setExistingLadder({ classId, count: page.items.length }))
      // An unanswerable read behaves like "no ladder": the picker renders and the server
      // stays the authority — a 409 on commit still lands in the handled branch below.
      .catch(() => live && setExistingLadder({ classId, count: 0 }))
    return () => {
      live = false
    }
  }, [client, classId])

  // Tagging the answer with its classId makes "count for another class" read as null
  // without resetting state inside the effect — a stale answer can never leak across a
  // class switch.
  const existingCount = existingLadder !== null && existingLadder.classId === classId ? existingLadder.count : null

  const preview = presets.find((preset) => preset.key === chosen)

  const commit = async () => {
    if (chosen === null || classId === null) return
    setSeedError(false)
    setBusy(true)
    try {
      if (chosen !== SCRATCH) {
        await client.seed(classId, chosen)
      }
      // Reported either way: the manager has answered the question this step asks, and
      // "I will define it by hand" is an answer.
      onDone()
    } catch (error) {
      // 409 — the ladder exists. That IS the goal state of this step; refusing to
      // continue over it is how the owner got stuck.
      if (error instanceof Error && error.message.startsWith('409')) {
        onDone()
        return
      }
      setSeedError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={columnStyle}>
      <h3 style={{ margin: 0 }}>{t(locale, 'events.belt.presetTitle')}</h3>
      <p style={hintStyle}>{t(locale, 'events.belt.biColor')}</p>

      {/* No class yet. See the module docstring: this step runs before the one that
          creates classes, and a ladder cannot exist without one. */}
      {classes !== null && classes.length === 0 ? (
        <>
          <p style={hintStyle}>{t(locale, 'events.belt.perClassHint')}</p>
          <p style={{ margin: 0 }}>
            <Button onClick={onSkip} variant="secondary">
              {t(locale, 'events.belt.noClassYet')}
            </Button>
          </p>
        </>
      ) : null}

      {classes !== null && classes.length > 1 ? (
        <fieldset role="radiogroup" style={cardsStyle}>
          <legend style={legendStyle}>{t(locale, 'events.target.class')}</legend>
          {classes.map((row) => (
            <Radio
              checked={classId === row.id}
              key={row.id}
              label={row.name}
              name="belt-class"
              onChange={() => setClassId(row.id)}
              value={row.id}
            />
          ))}
        </fieldset>
      ) : null}

      {/* The class already answered this question. Say so and open the way forward —
          a wizard step whose goal state blocks the wizard is a trap, not a step. */}
      {classId !== null && existingCount !== null && existingCount > 0 ? (
        <>
          <p style={hintStyle} data-testid="belts-already-seeded">
            {t(locale, 'events.belt.alreadySeeded').replace('{{count}}', String(existingCount))}
          </p>
          <p style={hintStyle}>{t(locale, 'events.belt.alreadySeededHint')}</p>
          <p style={{ margin: 0 }}>
            <Button data-testid="belts-continue" onClick={onDone} variant="primary">
              {t(locale, 'events.belt.continue')}
            </Button>
          </p>
        </>
      ) : null}

      {classId === null || existingCount === null || existingCount > 0 ? null : (
        <div className="belts-step">
          {/* `5d` draws the choices beside a live preview. The shipped step drew bare radio
              labels and put the preview in a card underneath, so a manager chose between
              "7 ranks" and "12 ranks" without seeing a single belt — and the colours ARE
              the decision. */}
          <fieldset className="belts-step__choices" role="radiogroup">
            <legend className="studio-visually-hidden">{t(locale, 'events.belt.title')}</legend>
            {presets.map((preset) => (
              <label
                className="belts-card"
                data-selected={chosen === preset.key}
                data-testid={`belts-preset-${preset.key}`}
                key={preset.key}
              >
                <span className="belts-card__head">
                  <Radio
                    checked={chosen === preset.key}
                    label={preset.name}
                    name="belt-preset"
                    onChange={() => setChosen(preset.key)}
                    value={preset.key}
                  />
                  <span className="belts-card__count">
                    {`${preset.ranks.length} ${t(locale, 'events.belt.presetRankCount')}`}
                  </span>
                </span>
                {/* What this preset would actually create. Ringed like every belt in the
                    product — D7 makes the ring unconditional, so a white belt on a white
                    card is still a belt and not a gap. */}
                <span aria-hidden="true" className="belts-card__strip">
                  {preset.ranks.map((rank) => (
                    <BeltBar
                      colorHex={rank.color_hex}
                      key={rank.name}
                      label={rank.name}
                      secondaryColorHex={rank.secondary_color_hex ?? undefined}
                    />
                  ))}
                </span>
              </label>
            ))}
            <label
              className="belts-card"
              data-selected={chosen === SCRATCH}
              data-testid="belts-preset-scratch"
            >
              <span className="belts-card__head">
                <Radio
                  checked={chosen === SCRATCH}
                  label={t(locale, 'events.belt.presetScratch')}
                  name="belt-preset"
                  onChange={() => setChosen(SCRATCH)}
                  value={SCRATCH}
                />
                <span className="belts-card__count">
                  {t(locale, 'events.belt.presetManual')}
                </span>
              </span>
            </label>
          </fieldset>

          <aside className="belts-preview" data-testid="belts-preview">
            <SectionHeader level={3} title={t(locale, 'events.belt.presetPreview')} />
            {preview ? (
              <>
                <ul className="belts-preview__list">
                  {/* Truncated at seven. `5d` shows the first few and says how many follow;
                      a twelve-row list turns the preview into the tallest thing on screen. */}
                  {preview.ranks.slice(0, PREVIEW_ROWS).map((rank) => (
                    <li key={rank.name}>
                      <BeltBar
                        colorHex={rank.color_hex}
                        label={rank.name}
                        secondaryColorHex={rank.secondary_color_hex ?? undefined}
                      />
                      <span>{rank.name}</span>
                    </li>
                  ))}
                </ul>
                {preview.ranks.length > PREVIEW_ROWS ? (
                  <p className="belts-preview__more" data-testid="belts-preview-more">
                    {t(locale, 'events.belt.presetAndMore').replace(
                      '{{count}}',
                      String(preview.ranks.length - PREVIEW_ROWS),
                    )}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="belts-preview__empty">
                {t(locale, 'events.belt.presetPreviewEmpty')}
              </p>
            )}
          </aside>

          <div style={{ gridColumn: '1 / -1' }}>
            {seedError ? (
              <p role="alert" style={hintStyle} data-testid="belts-seed-failed">
                {t(locale, 'events.belt.seedFailed')}
              </p>
            ) : null}
            {/* `5d` names what the button will make, not the verb: "create 12 ranks". A
                manager pressing it is committing to a ladder, and the count is the commitment. */}
            <ActionBar
              end={
                <Button
                  disabled={chosen === null || busy}
                  onClick={() => void commit()}
                  variant="primary"
                >
                  {preview
                    ? t(locale, 'events.belt.presetCreate').replace(
                        '{{count}}',
                        String(preview.ranks.length),
                      )
                    : t(locale, 'events.belt.add')}
                </Button>
              }
              start={
                <Button onClick={onSkip} variant="ghost">
                  {t(locale, 'events.belt.presetManual')}
                </Button>
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * One `registerSlot` call, at the order `WIZARD_STEP_ORDER` gives `belts`.
 *
 * Called by the app rather than at module load, for the same reason `registerM1WizardSteps`
 * is: the step needs a client, and a module that registered itself on import would have to
 * reach for a global one.
 */
export function registerBeltsWizardStep(client: DashboardBeltsClient): void {
  registerSlot<WizardStepProps>('setup-wizard', {
    key: 'belts',
    order: 2,
    render: (props: WizardStepProps) => <BeltsWizardStep {...props} client={client} />,
  })
}
