// Step 4 — דרגות וחגורות. The class's belt ladder.
//
// A ladder hangs off a class (`belt_rank.class_id`), which is why this step exists per class
// at all and why the setup wizard orders `groups` before `belts`: belts met a fresh owner
// with an empty class picker when the canvas ordered them the other way.
//
// **Seeded once, or not at all.** `POST /belt-ranks/seed` answers 409 on a class that already
// has a ladder rather than merging, because a second seed renumbers ranks that `student_belt`
// rows point at — rewriting a child's history without touching their row. So this step offers
// the presets only while the ladder is empty, and shows the ladder itself once it is not.
//
// What the prototype puts on a rank and the schema does not have: `minMonths`, `minAttendances`,
// `fee`, a stripe COUNT, `examFee`, `passingScorePercentage`, `requiresCoachRecommendation`.
// A rung is `name` · `kyu` · `order_index` · `color_hex` · `secondary_color_hex`, and that is
// what this draws. `evaluationType: 'levels' | 'caps'` is §4 rule 5 — one ladder shape.
import { useEffect, useState } from 'react'
import { Button, EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { ClassStepProps } from '../ClassWizard'
import type { WizardPreset, WizardRank } from '../client'

export function BeltsStep({ locale, client, classId, onSaved }: ClassStepProps) {
  const [ranks, setRanks] = useState<WizardRank[] | null>(null)
  const [presets, setPresets] = useState<WizardPreset[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!classId) return
    let live = true
    void Promise.all([client.listRanks(classId), client.listPresets()])
      .then(([loadedRanks, loadedPresets]) => {
        if (!live) return
        setRanks(loadedRanks)
        setPresets(loadedPresets)
      })
      .catch(() => live && setError(t(locale, 'common.loadFailed.body')))
    return () => {
      live = false
    }
  }, [classId, client, locale])

  const seed = async (key: string) => {
    if (!classId) return
    setBusy(true)
    setError(null)
    try {
      setRanks(await client.seedRanks(classId, key))
    } catch {
      setError(t(locale, 'schedule.wizard.belts.seedFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (!classId) return <p>{t(locale, 'schedule.wizard.needsClass')}</p>

  const seeded = (ranks ?? []).length > 0

  return (
    <div className="wizard-step">
      <p className="wizard-step__lead">{t(locale, 'schedule.wizard.belts.lead')}</p>

      {ranks === null ? null : seeded ? (
        <ol className="wizard-ladder" data-testid="wizard-ladder">
          {[...ranks]
            .sort((left, right) => left.order_index - right.order_index)
            .map((rank) => (
              <li className="wizard-ladder__rung" data-testid={`wizard-rank-${rank.id}`} key={rank.id}>
                {/* The colour is a fact about the belt, not a status, so it sits BESIDE the
                    name rather than tinting it — and the name carries the meaning alone. */}
                <span
                  aria-hidden="true"
                  className="wizard-ladder__swatch"
                  style={{ background: rank.color_hex }}
                />
                <span>{rank.name}</span>
                {rank.kyu !== null ? (
                  <span className="wizard-ladder__kyu">{rank.kyu}</span>
                ) : null}
              </li>
            ))}
        </ol>
      ) : (
        <>
          <EmptyState title={t(locale, 'schedule.wizard.belts.empty')} />
          <div className="wizard-step__row" data-testid="wizard-belt-presets">
            {presets.map((preset) => (
              <Button
                data-testid={`wizard-preset-${preset.key}`}
                disabled={busy}
                key={preset.key}
                onClick={() => void seed(preset.key)}
                variant="secondary"
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </>
      )}

      {seeded ? (
        // Renaming and reordering is `#/belts`'s job, and it is a screen, not a step. Saying
        // where beats a half-built editor here.
        <p className="wizard-step__note">
          {t(locale, 'schedule.wizard.belts.editElsewhere')}{' '}
          <a href="#/belts">{t(locale, 'schedule.wizard.belts.openLadder')}</a>
        </p>
      ) : null}

      {error ? (
        <p className="wizard-step__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="wizard-step__actions">
        {/* A club that does not grade is a real club. Skipping is an answer. */}
        <Button data-testid="wizard-belts-next" onClick={() => onSaved()}>
          {seeded ? t(locale, 'schedule.wizard.next') : t(locale, 'schedule.wizard.skipAndNext')}
        </Button>
      </div>
    </div>
  )
}
