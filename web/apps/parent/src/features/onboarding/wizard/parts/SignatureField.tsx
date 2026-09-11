// The wizard's pad, on its own, because a second screen now asks for the same signature.
//
// **Not `features/health/SignaturePad`.** That one is artboard 12c's: @studio/ui styling, a
// `600×200` paper sheet with a baseline guide, its own `Button` controls, and an
// `onChange(string | null)`. This one is the Tailwind pad the ported wizard draws, in
// `--wz-*` tokens, sized to its column. Two pads is not duplication here — they are two
// different designs on two different styling systems, and merging them would mean one screen
// adopting the other's look. What WAS duplication is this file existing twice, which is what
// entrance A's conversion screen was about to do (2026-09-12).
//
// It keeps `PartSignature`'s three rules verbatim, all of them §14.1:
//   * the pad shows a PROMPT, never the signer's name pre-rendered in cursive — an unsigned
//     pad that looks signed is worse than a blank one
//   * `onChange` fires with a data URL on pointer-up and with `''` on clear, so a caller
//     asking "is it signed" asks one question of one value
//   * the error state is the caller's to decide; this only draws it
//
// **`dir="ltr"` on the canvas** is taken from 12c's pad, which states the rule this one only
// implied: "The pad sits inside a `dir="rtl"` ancestor... A stroke is a person's handwriting;
// a transform derived from `dir` would flip it." The points below are already computed from
// `getBoundingClientRect()`, which is screen space and direction-free, so this is the second
// half of a guarantee that was only ever half-written here.
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, PenTool, RotateCcw } from 'lucide-react'

export function SignatureField({
  label,
  clearLabel,
  promptLabel,
  value,
  error,
  onChange,
  testId = 'signature-field',
}: {
  /** What is being signed, and the canvas's accessible name. */
  label: string
  clearLabel: string
  /** Drawn inside the empty pad. */
  promptLabel: string
  /** A `data:image/png;base64,…` URL, or `''`. */
  value: string
  error?: string | null
  onChange: (dataUrl: string) => void
  testId?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(Boolean(value))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const width = canvas.parentElement?.clientWidth ?? 380
    canvas.width = width * ratio
    canvas.height = 112 * ratio
    canvas.style.width = `${width}px`
    canvas.style.height = '112px'
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    context.lineWidth = 2.5
    context.lineCap = 'round'
    context.strokeStyle = '#001849'
  }, [])

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    // Optional-called, like 12c's pad: pointer capture is a nicety — it keeps a stroke
    // following a finger that slides off the pad — and jsdom does not implement it, so
    // calling it unguarded turns every test that signs into a TypeError.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    drawing.current = true
    setHasInk(true)
    const { x, y } = pointFrom(event)
    context.beginPath()
    context.moveTo(x, y)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const { x, y } = pointFrom(event)
    context.lineTo(x, y)
    context.stroke()
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span
          className={`text-[13px] font-bold flex items-center gap-1 ${
            error ? 'text-red-700' : 'text-[var(--wz-ink)]'
          }`}
        >
          <PenTool className="w-4 h-4 text-[var(--wz-accent)]" />
          <span>{label}</span>
          <span className="text-red-500 font-bold">*</span>
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-[var(--wz-accent)] text-[12px] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {clearLabel}
        </button>
      </div>

      {/* **The paper is pinned light, and the ink with it.** 12c's pad learned this the hard
          way and wrote it down: "Dark ink on a dark surface measured about 1.06:1, so a
          parent signing at night watched their finger leave no visible mark and concluded
          the pad was broken." This pad had the same pairing — `#001849` strokes on
          `--wz-surface`, which is `#1a1d27` under `[data-theme="dark"]` — and the same
          result, seen in a dark render on 2026-09-12. The stored PNG is transparent-backed
          ink rendered onto white in the PDF, so light paper is also the honest preview of
          what was signed. The surrounding screen still themes normally; only the two
          centimetres standing in for a sheet of paper do not. */}
      <div
        className={`relative h-28 w-full rounded-xl bg-[#fffefb] border-2 flex items-center justify-center overflow-hidden transition-all ${
          error
            ? 'border-red-500 border-solid bg-red-50/20 ring-2 ring-red-400/30'
            : 'border-dashed border-[var(--wz-line-strong)]'
        }`}
      >
        <canvas
          ref={canvasRef}
          dir="ltr"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label={label}
          data-testid={testId}
          className="absolute inset-0 z-20 cursor-crosshair touch-none"
        />
        {/* A prompt, not the signer's name in cursive — and a LITERAL grey, for the same
            reason the sheet above is literal: `--wz-tertiary` is the dark-theme grey under a
            dark theme, which would be near-invisible on light paper. #6f6b62 on #fffefb is
            4.88:1, the lowest passing grey in D8 and the floor for text. */}
        {!hasInk ? (
          <p className="relative z-10 text-[12px] text-[#6f6b62] text-center px-4 pointer-events-none select-none">
            {promptLabel}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-[11.5px] text-red-600 font-medium flex items-center gap-1" role="alert">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
