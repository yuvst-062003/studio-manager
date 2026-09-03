// נגישות — the adjustments IS 5568 asks for beyond WCAG AA itself (owner request
// 2026-08-30, researched the same day): user-resizable text, a high-contrast mode, less
// motion, underlined links, and the legally required accessibility STATEMENT with a way
// to report a problem. The standard is WCAG 2.1 AA under Israeli law; the statement's
// absence alone is actionable, which is why it lives here and not in a backlog.
//
// Mounted by ThemeProvider, so every surface — the public landing included, where a
// stranger with low vision meets the product first — carries the same button with no
// per-app wiring. State persists per browser in localStorage and is applied as data
// attributes + a root font-size, which the token layer (rem-based throughout) scales by.
import { useEffect, useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { useModalDialog } from '../useModalDialog'

export type A11ySettings = {
  textScale: 100 | 112 | 125
  contrast: boolean
  reduceMotion: boolean
  underlineLinks: boolean
}

const DEFAULTS: A11ySettings = {
  textScale: 100,
  contrast: false,
  reduceMotion: false,
  underlineLinks: false,
}

const STORAGE_KEY = 'studio.a11y.v1'

function read(): A11ySettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<A11ySettings>
    return {
      textScale: parsed.textScale === 112 || parsed.textScale === 125 ? parsed.textScale : 100,
      contrast: Boolean(parsed.contrast),
      reduceMotion: Boolean(parsed.reduceMotion),
      underlineLinks: Boolean(parsed.underlineLinks),
    }
  } catch {
    return DEFAULTS
  }
}

/** Exported for the boot path: applied before React renders anything, so a stored
 *  adjustment never flashes the un-adjusted page first. */
export function applyA11ySettings(settings: A11ySettings): void {
  const root = globalThis.document?.documentElement
  if (!root) return
  root.style.fontSize = settings.textScale === 100 ? '' : `${settings.textScale}%`
  if (settings.contrast) root.setAttribute('data-a11y-contrast', 'high')
  else root.removeAttribute('data-a11y-contrast')
  if (settings.reduceMotion) root.setAttribute('data-a11y-motion', 'reduced')
  else root.removeAttribute('data-a11y-motion')
  if (settings.underlineLinks) root.setAttribute('data-a11y-links', 'underline')
  else root.removeAttribute('data-a11y-links')
}

const SCALES: readonly A11ySettings['textScale'][] = [100, 112, 125]

export function AccessibilityMenu({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<A11ySettings>(read)
  const dialogRef = useModalDialog(open, () => setOpen(false))

  useEffect(() => {
    applyA11ySettings(settings)
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Private browsing. The adjustments still apply for this visit.
    }
  }, [settings])

  return (
    <>
      <button
        type="button"
        className="studio-a11y__fab"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="a11y-open"
        onClick={() => setOpen((current) => !current)}
      >
        {/* The international accessibility symbol, drawn — never an emoji (repo rule). */}
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="4.5" r="2" />
          <path d="M4.5 8.5c5 1.5 10 1.5 15 0" />
          <path d="M12 9.5v4.5l-3.5 6" />
          <path d="M12 14l3.5 6" />
        </svg>
        <span className="studio-visually-hidden">{t(locale, 'common.a11y.button')}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="a11y-title"
          className="studio-a11y__panel"
          data-testid="a11y-panel"
          ref={dialogRef}
          tabIndex={-1}
        >
          <h2 id="a11y-title" className="studio-a11y__title">
            {t(locale, 'common.a11y.title')}
          </h2>

          <fieldset className="studio-a11y__group" role="radiogroup">
            <legend>{t(locale, 'common.a11y.textSize')}</legend>
            <div className="studio-a11y__scales">
              {SCALES.map((scale) => (
                <label key={scale} className="studio-a11y__scale" data-selected={settings.textScale === scale || undefined}>
                  <input
                    type="radio"
                    className="studio-visually-hidden"
                    name="a11y-scale"
                    checked={settings.textScale === scale}
                    data-testid={`a11y-scale-${scale}`}
                    onChange={() => setSettings((current) => ({ ...current, textScale: scale }))}
                  />
                  <span aria-hidden="true" style={{ fontSize: `${scale}%` }}>
                    א
                  </span>
                  <span className="studio-visually-hidden">
                    {t(locale, `common.a11y.scale.${scale}`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Checkbox
            checked={settings.contrast}
            data-testid="a11y-contrast"
            label={t(locale, 'common.a11y.contrast')}
            onChange={(event) =>
              setSettings((current) => ({ ...current, contrast: event.target.checked }))
            }
          />
          <Checkbox
            checked={settings.reduceMotion}
            data-testid="a11y-motion"
            label={t(locale, 'common.a11y.motion')}
            onChange={(event) =>
              setSettings((current) => ({ ...current, reduceMotion: event.target.checked }))
            }
          />
          <Checkbox
            checked={settings.underlineLinks}
            data-testid="a11y-links"
            label={t(locale, 'common.a11y.links')}
            onChange={(event) =>
              setSettings((current) => ({ ...current, underlineLinks: event.target.checked }))
            }
          />

          <details className="studio-a11y__statement">
            <summary>{t(locale, 'common.a11y.statement.title')}</summary>
            <p>{t(locale, 'common.a11y.statement.body')}</p>
            {/* Decision 13 (2026-09-03 onboarding spec): the signature pad's typed-name
                fallback is deleted -- drawing only. A keyboard-only parent cannot sign, and
                the health declaration is a hard gate that blocks the whole app for them, so
                this line -- call the club, they complete it by phone -- is the mitigation the
                decision names, not optional copy. */}
            <p>{t(locale, 'common.a11y.statement.signature')}</p>
            <p>{t(locale, 'common.a11y.statement.contact')}</p>
          </details>

          <div className="studio-a11y__actions">
            <Button
              variant="ghost"
              data-testid="a11y-reset"
              onClick={() => setSettings(DEFAULTS)}
            >
              {t(locale, 'common.a11y.reset')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t(locale, 'common.a11y.close')}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
