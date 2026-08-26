// Parent artboard 12c — the pad, and the one thing on that screen that could go badly wrong.
//
// **The pad must not mirror.** 12c states it plainly: "The pad sits inside a `dir="rtl"`
// ancestor. Whatever captures the pointer path must render in true screen coordinates,
// independent of document direction. A stroke is a person's handwriting; a transform derived
// from `dir` would flip it. Isolate the canvas coordinate space."
//
// The isolation is two things and both are load-bearing:
//   1. the <canvas> carries `dir="ltr"` of its own, so no ancestor's direction reaches it;
//   2. every point is computed from `getBoundingClientRect()` — screen space — and never from an
//      offset that a layout could have flipped.
//
// **A gap, recorded rather than worked around.** 12c and 12j both draw this pad and the spec says
// "Build one `SignaturePad`". `web/packages/ui/src/primitives/` is not this lane's to write into,
// so it lives here and 12j's frame 2 (M3's, already merged) does not yet share it. Lifting it
// into the design system is a main-owned move, not a lane one.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Button, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const WIDTH = 600
const HEIGHT = 200
/** Ink on paper, at the pad's own scale. Thin enough to read a signature, thick enough to see. */
const STROKE = 3

/**
 * The pad is PAPER, and paper does not have a theme.
 *
 * The ink below is the literal `#1a1a1a` for a stated reason — a signature that inverted
 * with the theme would be a signature that changed after it was given, and the stored PNG is
 * transparent-backed ink rendered onto white in the PDF. The frame did not follow that
 * reasoning: it was `var(--surface)`, which is `#1e1d1a` under `[data-theme="dark"]`. Dark
 * ink on a dark surface measured about 1.06:1, so a parent signing at night watched their
 * finger leave no visible mark and concluded the pad was broken.
 *
 * Pinning the paper light is the fix that matches the ink. The surrounding screen still
 * themes normally; only the two centimetres that represent a sheet of paper do not.
 */
const PAPER = '#fffefb'
const INK = '#1a1a1a'

const frameStyle: CSSProperties = {
  border: '2px solid var(--fg)',
  borderRadius: 'var(--radius-md)',
  background: PAPER,
  position: 'relative',
  overflow: 'hidden',
  touchAction: 'none',
}

const canvasStyle: CSSProperties = {
  display: 'block',
  inlineSize: '100%',
  blockSize: 'auto',
  touchAction: 'none',
  cursor: 'crosshair',
}

/** The baseline guide. Symmetrically inset today; kept logical so it stays right if it stops being. */
const guideStyle: CSSProperties = {
  position: 'absolute',
  insetInlineStart: '8%',
  insetInlineEnd: '8%',
  insetBlockEnd: '28%',
  // On paper, not on the themed surface — so a literal, like the ink and the sheet.
  borderBlockEnd: '1px solid #8d8674',
  pointerEvents: 'none',
}

const placeholderStyle: CSSProperties = {
  position: 'absolute',
  insetInline: 0,
  insetBlockEnd: '30%',
  textAlign: 'center',
  // #6f6b62 on the #fffefb sheet is 4.88:1 — the lowest passing grey in D8, and the floor
  // for text. `var(--text-muted)` would be the DARK-mode grey here and fail on paper.
  color: '#6f6b62',
  fontSize: 'var(--text-caption)',
  pointerEvents: 'none',
}

/** The keyboard route sits directly under the sheet, not behind a disclosure: a control a
 *  parent has to discover is a control a parent who needs it will not find. */
const typedRowStyle: CSSProperties = {
  marginBlockStart: 'var(--space-2)',
}

const controlsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  marginBlockStart: 'var(--space-2)',
}

export type SignaturePadProps = {
  locale: Locale
  /** Called with a base64 PNG data URL, or `null` when the pad is cleared. */
  onChange: (dataUrl: string | null) => void
  /** The name-and-date attestation under the pad (12c's controls row). */
  attestation?: string
  error?: string
}

export function SignaturePad({ locale, onChange, attestation, error }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.lineWidth = STROKE
    context.lineCap = 'round'
    context.lineJoin = 'round'
    // A literal colour and not a token: `getContext('2d')` cannot resolve a CSS variable, and a
    // signature that inverted with the theme would be a signature that changed after it was
    // given. The stored PNG is transparent-backed ink, rendered onto white in the PDF.
    context.strokeStyle = INK
  }, [])

  /**
   * Screen space to canvas space, with no reference to `dir` anywhere in it.
   *
   * `clientX/clientY` are viewport coordinates and `getBoundingClientRect()` is the element's
   * viewport box, so the subtraction is direction-free by construction. The scale factor handles
   * a canvas whose CSS size differs from its bitmap size, which is every canvas on a phone.
   */
  const pointFor = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const box = canvas.getBoundingClientRect()
    const scaleX = box.width === 0 ? 1 : canvas.width / box.width
    const scaleY = box.height === 0 ? 1 : canvas.height / box.height
    return {
      x: (event.clientX - box.left) * scaleX,
      y: (event.clientY - box.top) * scaleY,
    }
  }, [])

  const emit = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/png'))
  }, [onChange])

  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = true
    last.current = pointFor(event)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const context = canvasRef.current?.getContext('2d')
    const from = last.current
    const to = pointFor(event)
    if (!context || !from) return
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    context.stroke()
    last.current = to
    if (!hasInk) setHasInk(true)
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    if (hasInk) emit()
  }

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    setTyped('')
    onChange(null)
  }, [onChange])

  /**
   * The keyboard route to signing, and it is not optional.
   *
   * §6.1 step 6 makes the health declaration a HARD GATE: until it is signed, no other
   * screen in the parent app is reachable. A pad that only answers to a pointer therefore
   * did not merely lack a keyboard affordance -- it locked a parent who cannot use a mouse,
   * a trackpad or a touchscreen out of the entire product, with no way to report the
   * problem from inside it. That is SC 2.1.1 at the highest possible cost.
   *
   * A typed name is a recognised form of electronic signature and, more to the point, it is
   * what the attestation line under the pad already records in words. Rendering it INTO the
   * canvas rather than storing it as text is what keeps this a fix and not a schema change:
   * the backend still receives one base64 PNG, `signature_image` still holds ink, and the
   * rendered PDF still shows a signature where a signature belongs.
   *
   * `dir="ltr"` is NOT set on the typed field, unlike on the canvas. The canvas is isolated
   * because a STROKE PATH must not mirror; a name is text, and a Hebrew name must lay out
   * right-to-left like every other name in the app.
   */
  const signWithName = useCallback(
    (name: string) => {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      const trimmed = name.trim()
      if (!trimmed) {
        setHasInk(false)
        onChange(null)
        return
      }
      context.save()
      context.fillStyle = INK
      // Sized off the canvas rather than a fixed px so a long name still fits the sheet.
      const size = Math.min(64, Math.max(28, (canvas.width * 0.9) / trimmed.length))
      context.font = `italic ${size}px 'Rubik Variable', Rubik, sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'alphabetic'
      // Sits ON the baseline guide, which is drawn at 28% up from the bottom.
      context.fillText(trimmed, canvas.width / 2, canvas.height * 0.72, canvas.width * 0.92)
      context.restore()
      setHasInk(true)
      onChange(canvas.toDataURL('image/png'))
    },
    [onChange],
  )

  return (
    <section aria-labelledby="signature-label">
      <h3 className="studio-section-label" id="signature-label">
        {t(locale, 'health.declaration.signature')}
      </h3>
      <div style={frameStyle}>
        <canvas
          aria-label={t(locale, 'health.declaration.signatureHint')}
          data-testid="signature-canvas"
          // Explicit and independent of the document: 12c's non-mirroring rule, in one attribute.
          dir="ltr"
          height={HEIGHT}
          onPointerCancel={end}
          onPointerDown={start}
          onPointerLeave={end}
          onPointerMove={move}
          onPointerUp={end}
          ref={canvasRef}
          role="img"
          style={canvasStyle}
          width={WIDTH}
        />
        <div style={guideStyle} />
        {hasInk ? null : <p style={placeholderStyle}>{t(locale, 'health.declaration.signatureHint')}</p>}
      </div>
      <div style={typedRowStyle}>
        <TextField
          hint={t(locale, 'health.declaration.signatureTypedHint')}
          label={t(locale, 'health.declaration.signatureTyped')}
          onChange={(event) => {
            const next = event.target.value
            setTyped(next)
            signWithName(next)
          }}
          value={typed}
        />
      </div>
      <div style={controlsStyle}>
        <Button disabled={!hasInk} onClick={clear} type="button" variant="secondary">
          {t(locale, 'health.declaration.signatureClear')}
        </Button>
        <span style={{ flex: 1 }} />
        {attestation ? (
          // `bdi` so a Hebrew name beside a Latin date does not reorder the pair.
          <span
            style={{
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-caption)',
            }}
          >
            <bdi>{attestation}</bdi>
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-caption)' }}>
          {error}
        </p>
      ) : null}
    </section>
  )
}
