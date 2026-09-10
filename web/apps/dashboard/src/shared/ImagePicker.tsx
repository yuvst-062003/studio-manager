// The picture control, in place of the browser's own `Choose File`.
//
// Every image upload on the dashboard was a bare `<input type="file">` inside a `<label>`,
// which the browser renders as a grey "Choose File" button and the words "no file selected"
// — in English, on a Hebrew RTL screen, in a font nothing else on the page uses, at a size
// nothing else on the page uses. The owner asked for the obvious thing on 2026-09-10: an
// empty square you can press, with a picture icon in it.
//
// Three call sites share this: the club logo and the landing-photo strip in settings, and
// the per-item photo in the sale catalogue.
//
// WHY THE INPUT IS STILL THERE. It is visually hidden, never `display: none` and never
// removed — a hidden-but-focusable file input is what keeps this reachable by keyboard and
// announced as a file control by a screen reader. The `<label>` wrapping it is what makes
// the whole square a hit target, so no `onClick` handler is needed to forward the press,
// and there is no `<button>` that would have to re-implement the file dialog.
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** The formats every image endpoint on this app accepts. Kept in one place so a call site
 *  cannot quietly widen it past what the server will take and turn a 415 into the user's
 *  problem. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'

const frameStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  gap: 'var(--space-2)',
  inlineSize: '100%',
  aspectRatio: '1 / 1',
  // Dashed, because the square is a drop-shaped invitation rather than a filled control.
  border: 'var(--border-width-hairline) dashed var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  textAlign: 'center',
  padding: 'var(--space-3)',
  // Logical, not `min-width`: the app is RTL — .claude/rules/ui-rtl-a11y.md.
  minInlineSize: '0',
}

const filledStyle: CSSProperties = {
  ...frameStyle,
  borderStyle: 'solid',
  borderColor: 'var(--border)',
  padding: 0,
  overflow: 'hidden',
}

const imageStyle: CSSProperties = {
  inlineSize: '100%',
  blockSize: '100%',
  objectFit: 'cover',
  display: 'block',
}

/** Visually hidden, still focusable and still announced. `display: none` would take it out
 *  of the tab order and out of the accessibility tree, which is the whole reason a custom
 *  file control usually stops working for keyboard users. */
const inputStyle: CSSProperties = {
  position: 'absolute',
  inlineSize: '1px',
  blockSize: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

const wrapStyle: CSSProperties = { position: 'relative', display: 'grid', gap: 'var(--space-2)' }

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'center',
  justifyContent: 'space-between',
}

export function ImagePicker({
  locale,
  onChoose,
  onRemove,
  previewUrl = null,
  label,
  hint,
  size = '10rem',
  error = null,
  testId,
}: {
  locale: Locale
  onChoose: (file: File) => void
  /** Omitted where the endpoint has no delete — the club logo has none today, so no
   *  remove control is drawn rather than one that fails. */
  onRemove?: () => void
  previewUrl?: string | null
  /** The square's own words when empty. Defaults to "add an image"; the logo passes its
   *  own, because "512×512" is information the generic label cannot carry. */
  label?: string
  hint?: string
  /** The square's edge length. A logo wants a small one, a product photo a larger one. */
  size?: string
  /** An i18n KEY, already resolved by the caller if it came from a server code. */
  error?: ReactNode
  testId?: string
}) {
  const chosen = previewUrl !== null && previewUrl !== ''
  return (
    <div style={{ ...wrapStyle, inlineSize: size }}>
      <label
        style={chosen ? filledStyle : frameStyle}
        data-testid={testId ? `${testId}-frame` : undefined}
      >
        {chosen ? (
          <img
            src={previewUrl}
            alt={t(locale, 'common.imagePicker.preview')}
            style={imageStyle}
          />
        ) : (
          <>
            <Icon name="image" size={28} />
            <span style={{ fontSize: 'var(--text-label)' }}>
              {label ?? t(locale, 'common.imagePicker.empty')}
            </span>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
              {hint ?? t(locale, 'common.imagePicker.hint')}
            </span>
          </>
        )}
        <input
          type="file"
          accept={IMAGE_ACCEPT}
          style={inputStyle}
          data-testid={testId}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onChoose(file)
            // The same file again after a rejection must refire onChange — otherwise a
            // manager who fixes nothing and retries gets silence.
            event.target.value = ''
          }}
        />
      </label>

      {chosen ? (
        <div style={actionsStyle}>
          {/* A second, explicit affordance for replacing. The square itself is already a
              label and would do it, but once it holds a photo it stops LOOKING pressable,
              and "click the picture" is not discoverable. */}
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
            {t(locale, 'common.imagePicker.replace')}
          </span>
          {onRemove ? (
            <button
              type="button"
              className="studio-btn"
              data-variant="ghost"
              data-testid={testId ? `${testId}-remove` : undefined}
              onClick={onRemove}
            >
              {t(locale, 'common.imagePicker.remove')}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" data-testid={testId ? `${testId}-error` : undefined}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
