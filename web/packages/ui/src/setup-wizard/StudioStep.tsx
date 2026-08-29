// Step 1 · פרטי מועדון — artboard 5c. Fully M1; no later lane extends this file.
//
// Name, ענף, address, phone, which languages parents see, and the 512×512 logo drop-zone
// M1.8's object-storage seam made possible.
//
// The resize happens HERE, on a canvas, and never on the backend. §2.4 of the design doc:
// the alternative is Pillow and an image-decoding attack surface inside the API process,
// bought to fix a defect (a logo that is not exactly square) that is cosmetic.
import { useEffect, useRef, useState } from 'react'
import { t } from '@studio/i18n'
import { ActionBar } from '../primitives/ActionBar'
import { Button } from '../primitives/Button'
import { Checkbox } from '../primitives/Checkbox'
import { SectionHeader } from '../primitives/SectionHeader'
import { TextField } from '../primitives/TextField'
import type { WizardStepProps } from './types'

export type StudioDetails = {
  name: string
  sport: string | null
  address: string | null
  phone: string | null
  parent_locales: string[]
  logo_url: string | null
}

/** Injected, so this file has no opinion about how the app reaches the API. */
export type StudioClient = {
  read: () => Promise<StudioDetails>
  update: (fields: Partial<Omit<StudioDetails, 'logo_url'>>) => Promise<StudioDetails>
  uploadLogo: (file: Blob) => Promise<{ logo_url: string }>
}

//: §9 ships three. A fourth would render raw keys at a parent.
const PARENT_LOCALES = ['he', 'en', 'ru'] as const

//: The canvas draws the drop-zone at 512×512, and that is what gets uploaded.
export const LOGO_EDGE = 512

/**
 * Draw onto a square canvas and re-encode as PNG.
 *
 * Deliberately contain-and-letterbox rather than crop: a club logo cropped to a square
 * loses whichever edge the wordmark was on, and a manager cannot tell from the thumbnail
 * that it happened.
 */
export async function resizeToSquarePng(file: Blob, edge: number = LOGO_EDGE): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = edge
  canvas.height = edge
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('no 2d context')
  const scale = Math.min(edge / bitmap.width, edge / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  context.drawImage(bitmap, (edge - width) / 2, (edge - height) / 2, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob === null) throw new Error('canvas produced no blob')
  return blob
}

export function makeStudioStep(client: StudioClient) {
  return function StudioStep({ locale, status, onDone, onSkip }: WizardStepProps) {
    const [details, setDetails] = useState<StudioDetails | null>(null)
    const [saving, setSaving] = useState(false)
    const [logoError, setLogoError] = useState<string | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)

    useEffect(() => {
      let alive = true
      void client.read().then((next) => {
        if (alive) setDetails(next)
      })
      return () => {
        alive = false
      }
    }, [])

    if (details === null) return <p>{t(locale, 'common.setup.loading')}</p>

    const set = <K extends keyof StudioDetails>(key: K, value: StudioDetails[K]) =>
      setDetails({ ...details, [key]: value })

    const toggleLocale = (locale_: string, on: boolean) => {
      const next = on
        ? PARENT_LOCALES.filter((l) => l === locale_ || details.parent_locales.includes(l))
        : details.parent_locales.filter((l) => l !== locale_)
      // Never empty: the server refuses it, and refusing here means the owner is told
      // before they lose the checkbox they just cleared.
      set('parent_locales', next.length > 0 ? [...next] : details.parent_locales)
    }

    const pickLogo = async (file: File) => {
      setLogoError(null)
      try {
        const resized = await resizeToSquarePng(file)
        const { logo_url } = await client.uploadLogo(resized)
        set('logo_url', logo_url)
      } catch {
        // The server's own refusals (SVG, >2 MB, not an image) land here too. One message
        // that names the rule beats three that name none of them.
        setLogoError(t(locale, 'common.setup.studio.logoRejected'))
      }
    }

    return (
      <section
        aria-labelledby="setup-studio-title"
        className="setup-step"
        data-testid="setup-step-studio"
      >
        <SectionHeader level={3} title={t(locale, 'common.setup.step.studio')} />

        <div className="setup-fields">
          <TextField
            label={t(locale, 'common.setup.studio.name')}
            value={details.name}
            onChange={(event) => set('name', event.target.value)}
          />
          <TextField
            label={t(locale, 'common.setup.studio.sport')}
            value={details.sport ?? ''}
            onChange={(event) => set('sport', event.target.value)}
          />
          <TextField
            label={t(locale, 'common.setup.studio.address')}
            value={details.address ?? ''}
            onChange={(event) => set('address', event.target.value)}
          />
          <TextField
            label={t(locale, 'common.setup.studio.phone')}
            type="tel"
            value={details.phone ?? ''}
            onChange={(event) => set('phone', event.target.value)}
          />
        </div>

        {/* The three choices ran together — `.studio-choice` spaces a box from its own
            label, and nothing spaced one choice from the next. */}
        <fieldset className="setup-group">
          <legend className="setup-group__legend">
            {t(locale, 'common.setup.studio.parentLocales')}
          </legend>
          <div className="setup-choices">
            {PARENT_LOCALES.map((code) => (
              <Checkbox
                key={code}
                label={t(locale, `common.setup.studio.locale.${code}`)}
                checked={details.parent_locales.includes(code)}
                onChange={(event) => toggleLocale(code, event.target.checked)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="setup-group">
          <legend className="setup-group__legend">
            {t(locale, 'common.setup.studio.logoAlt')}
          </legend>
          <div className="setup-logo" data-testid="setup-logo-dropzone">
            {details.logo_url ? (
              <img
                src={details.logo_url}
                alt={t(locale, 'common.setup.studio.logoAlt')}
                width={LOGO_EDGE / 4}
                height={LOGO_EDGE / 4}
              />
            ) : (
              <p className="setup-logo__hint">{t(locale, 'common.setup.studio.logoDrop')}</p>
            )}
            {/* The native control is kept — it is the accessible name, the keyboard target
                and what a file drop lands on — but taken out of the visual flow, because
                the UA renders it as an English "Choose File / No file chosen" in the middle
                of an RTL Hebrew screen. `clip-path`, not `display: none`: hiding it that way
                would take it out of the accessibility tree along with the layout. */}
            <input
              ref={fileInput}
              className="studio-visually-hidden"
              type="file"
              accept="image/png, image/jpeg, image/webp"
              aria-label={t(locale, 'common.setup.studio.logoDrop')}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void pickLogo(file)
              }}
            />
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              {t(locale, 'common.setup.studio.logoChoose')}
            </Button>
            {logoError ? (
              <p className="setup-logo__error" role="alert">
                {logoError}
              </p>
            ) : null}
          </div>
        </fieldset>

        {/* Skip leaves the step, continue moves it forward — opposite edges, and the
            step's own state on its own line rather than among the controls. */}
        <ActionBar
          end={
            <Button
              disabled={saving || details.name.trim() === ''}
              onClick={() => {
                setSaving(true)
                void client
                  .update({
                    name: details.name.trim(),
                    sport: details.sport,
                    address: details.address,
                    phone: details.phone,
                    parent_locales: details.parent_locales,
                  })
                  .then(() => onDone())
                  .finally(() => setSaving(false))
              }}
            >
              {t(locale, 'common.setup.continue')}
            </Button>
          }
          start={
            <Button variant="ghost" onClick={onSkip}>
              {t(locale, 'common.setup.skip')}
            </Button>
          }
        />
        <p className="setup-step__meta" data-testid="setup-studio-status">
          {t(locale, `common.setup.status.${status}`)}
        </p>
      </section>
    )
  }
}
