// Step 1 — פרטי החוג. The only step that can run before the class exists, and the step
// that brings it into being.
//
// The prototype's step 1 also offers a brand colour and a banner image. **Neither is here.**
// The owner cut the colour outright ("and no need class color"), and `bannerUrl` has no
// column and no upload endpoint — inventing one for a field nobody asked for is exactly the
// kind of speculative build §4 rule 12 is about. `class.color` stays in the schema; nothing
// writes it, which is what "not built" means here.
//
// The prototype's `minAge`/`maxAge` live on the GROUP in this product, not on the class, and
// step 2 collects them there — a class covering 6-16 whose beginners group is 6-8 is the
// normal case, and one range on the class would be a number that contradicts its own groups.
import { useState } from 'react'
import { Button, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { ClassStepProps } from '../ClassWizard'

export function DetailsStep({ locale, client, classId, klass, onSaved }: ClassStepProps) {
  // "With the details already in it" — the owner's words, and the whole point of the edit
  // entrance. No effect syncs these: the container renders no step until `klass` has
  // loaded, so on an edit the initial state IS the class, and on a create there is nothing
  // to pre-fill from.
  const [name, setName] = useState(klass?.name ?? '')
  const [description, setDescription] = useState(klass?.description ?? '')
  const [discipline, setDiscipline] = useState(klass?.discipline ?? '')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const save = async () => {
    setBusy(true)
    setFailed(false)
    const body = {
      name: name.trim(),
      // An empty box means "no description", which is a real answer — omitting the field
      // would leave the old text in place and the manager would watch a deletion undo
      // itself on the next load.
      description: description.trim() === '' ? null : description.trim(),
      discipline: discipline.trim() === '' ? null : discipline.trim(),
    }
    try {
      const saved = classId
        ? await client.updateClass(classId, body)
        : await client.createClass(body)
      onSaved(saved)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wizard-step">
      <p className="wizard-step__lead">{t(locale, 'schedule.wizard.details.lead')}</p>

      <TextField
        data-testid="wizard-class-name"
        label={t(locale, 'schedule.classes.name')}
        onChange={(event) => setName(event.target.value)}
        value={name}
      />

      <TextField
        data-testid="wizard-class-discipline"
        hint={t(locale, 'schedule.wizard.details.disciplineHint')}
        label={t(locale, 'schedule.wizard.details.discipline')}
        onChange={(event) => setDiscipline(event.target.value)}
        value={discipline}
      />

      <label className="wizard-step__field">
        {t(locale, 'schedule.classes.description')}
        <textarea
          data-testid="wizard-class-description"
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          value={description}
        />
      </label>

      {failed ? (
        <p className="wizard-step__error" role="alert">
          {t(locale, 'schedule.classes.saveFailed')}
        </p>
      ) : null}

      <div className="wizard-step__actions">
        <Button
          data-testid="wizard-details-save"
          disabled={busy || name.trim() === ''}
          onClick={() => void save()}
        >
          {t(locale, classId ? 'schedule.wizard.saveAndNext' : 'schedule.wizard.createAndNext')}
        </Button>
      </div>
    </div>
  )
}
