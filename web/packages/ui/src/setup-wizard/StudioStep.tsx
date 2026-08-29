// Step 1 · פרטי מועדון — artboard 5c. Fully M1; no later lane extends this file.
//
// Name, ענף, address, phone, and the 512×512 logo drop-zone M1.8's object-storage seam
// made possible. It no longer asks which languages parents see: all three are offered.
//
// The resize happens HERE, on a canvas, and never on the backend. §2.4 of the design doc:
// the alternative is Pillow and an image-decoding attack surface inside the API process,
// bought to fix a defect (a logo that is not exactly square) that is cosmetic.
import { useEffect, useRef, useState } from 'react'
import { t } from '@studio/i18n'
import { ActionBar } from '../primitives/ActionBar'
import { Button } from '../primitives/Button'
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

//: §9 ships three, and a club offers all three. This step no longer asks which — owner
//: request, 2026-08-29: "this should not be a choice but a default." The server's default
//: is now all of them (`studio_public_fields`), and the הגדרות panel is where a club that
//: genuinely wants to narrow the set still can. Asking a first-run owner to pick was
//: asking them to guess which languages their future parents read.

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
          {/* Which field is required, and what a good answer looks like. Both from the
              Stitch pass on `5c`: the continue button disabling on an empty name told an
              owner *that* something was wrong but never *which* field, and a first-run
              form with no examples is one they hesitate over.

              `hint` rather than an asterisk in the label — TextField already wires it
              through `aria-describedby`, so it is announced rather than read out as
              "club name star". */}
          <TextField
            hint={t(locale, 'common.setup.studio.requiredHint')}
            label={t(locale, 'common.setup.studio.name')}
            placeholder={t(locale, 'common.setup.studio.namePlaceholder')}
            required
            value={details.name}
            onChange={(event) => set('name', event.target.value)}
          />
          <TextField
            label={t(locale, 'common.setup.studio.sport')}
            placeholder={t(locale, 'common.setup.studio.sportPlaceholder')}
            value={details.sport ?? ''}
            onChange={(event) => set('sport', event.target.value)}
          />
          <TextField
            hint={t(locale, 'common.setup.studio.optionalHint')}
            label={t(locale, 'common.setup.studio.address')}
            placeholder={t(locale, 'common.setup.studio.addressPlaceholder')}
            value={details.address ?? ''}
            onChange={(event) => set('address', event.target.value)}
          />
          <TextField
            hint={t(locale, 'common.setup.studio.optionalHint')}
            label={t(locale, 'common.setup.studio.phone')}
            placeholder={t(locale, 'common.setup.studio.phonePlaceholder')}
            type="tel"
            value={details.phone ?? ''}
            onChange={(event) => set('phone', event.target.value)}
          />
        </div>

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
