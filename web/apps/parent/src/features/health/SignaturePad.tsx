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
import { Button } from '@studio/ui'
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
    onChange(null)
  }, [onChange])

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
      {/*
       * Decision 13 (2026-09-03 onboarding spec): the typed-full-name fallback that used to
       * sit here is deleted -- drawing is the only way to sign. Consequence, accepted: a
       * keyboard-only parent cannot sign, and §6.1's hard gate then blocks the whole app for
       * them. The mitigation is NOT here -- it is a line in the accessibility statement
       * (`common.a11y.statement.signature`, AccessibilityMenu.tsx) telling that parent to call
       * the club, who complete the declaration for them by phone.
       */}
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
