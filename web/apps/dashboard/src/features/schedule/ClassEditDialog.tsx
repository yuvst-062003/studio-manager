// The small popup that edits one class — the owner's correction to checkpoint 6, in their
// own words: "when looking at a created class press opens a small popup to just update /
// but when creating a new class the full steps wizard".
//
// So this is deliberately SMALL. It edits the four columns `class` actually has and does
// not try to be the wizard: no groups, no schedule, no prices, no belts, no coaches. Those
// belong to the seven-step flow (§3.21) and to the group page, and a popup that offered a
// tenth of each would be a worse version of both.
//
// `PATCH /api/v1/classes/{id}` did not exist until this checkpoint. `ClassUpdate` had been
// sitting in the schemas since the model landed with no route using it, which is why a club
// that mistyped a class name at setup could not fix it.
import { useState } from 'react'
import { Button, TextField, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { ClassDraft, ClassSummary } from './client'

/**
 * G13 — what is stored is which token was chosen, never a hex literal, so a theme change
 * does not have to rewrite rows. The prototype offers a free colour picker; this offers the
 * palette, which is the same affordance against a schema that will still make sense after
 * the next palette.
 */
// `accent` is deliberately NOT here. `[data-surface="studio-os"]` gives `--accent` and
// `--emphasis` the same mint in both themes, so offering both would be two swatches a
// manager cannot tell apart that produce the same badge. Five choices that differ.
const COLOURS = ['emphasis', 'paid', 'debt', 'pending', 'cancelled'] as const

export function ClassEditDialog({
  locale,
  klass,
  onCancel,
  onSave,
}: {
  locale: Locale
  /** The class being edited, or `null` to create one. */
  klass: ClassSummary | null
  onCancel: () => void
  onSave: (draft: ClassDraft) => Promise<void>
}) {
  const [name, setName] = useState(klass?.name ?? '')
  const [description, setDescription] = useState(klass?.description ?? '')
  const [colour, setColour] = useState(klass?.color ?? '')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Rendered only while open, so the caller's conditional IS the open state.
  const dialogRef = useModalDialog(true, onCancel)

  const submit = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await onSave({
        name: name.trim(),
        // An empty box means "no description", which is a real answer and is why this is
        // `null` rather than omitted — omitting it would leave the old text in place and
        // the manager would watch their deletion undo itself.
        description: description.trim() === '' ? null : description.trim(),
        color: colour === '' ? null : colour,
      })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="class-dialog__scrim" data-testid="class-dialog-scrim" onClick={onCancel}>
      <div
        aria-labelledby="class-dialog-title"
        aria-modal="true"
        className="class-dialog"
        data-testid="class-dialog"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className="class-dialog__title" id="class-dialog-title">
          {t(locale, klass ? 'schedule.classes.editTitle' : 'schedule.classes.createTitle')}
        </h2>

        <TextField
          data-testid="class-name"
          label={t(locale, 'schedule.classes.name')}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />

        <label className="class-dialog__field">
          {t(locale, 'schedule.classes.description')}
          <textarea
            data-testid="class-description"
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            value={description}
          />
        </label>

        <fieldset className="class-dialog__colours">
          <legend>{t(locale, 'schedule.classes.colour')}</legend>
          <div className="class-dialog__swatches">
            {/* "No colour" is one of the choices, not the absence of one — a class created
                before the palette existed has `null` and must be able to keep it. */}
            <button
              aria-pressed={colour === ''}
              className="class-dialog__swatch"
              data-swatch="none"
              data-testid="class-colour-none"
              onClick={() => setColour('')}
              type="button"
            >
              {t(locale, 'schedule.classes.colourNone')}
            </button>
            {COLOURS.map((token) => (
              <button
                aria-label={t(locale, `schedule.classes.colour.${token}`)}
                aria-pressed={colour === token}
                className="class-dialog__swatch"
                data-swatch={token}
                data-testid={`class-colour-${token}`}
                key={token}
                onClick={() => setColour(token)}
                type="button"
              />
            ))}
          </div>
        </fieldset>

        {failed ? (
          <p className="class-dialog__error" role="alert">
            {t(locale, 'schedule.classes.saveFailed')}
          </p>
        ) : null}

        <div className="class-dialog__actions">
          <Button data-testid="class-cancel" onClick={onCancel} variant="secondary">
            {t(locale, 'common.cancel')}
          </Button>
          <Button
            data-testid="class-save"
            disabled={busy || name.trim() === ''}
            onClick={() => void submit()}
          >
            {t(locale, 'schedule.classes.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
