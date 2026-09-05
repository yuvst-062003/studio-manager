// §5.6 -- part 5. Emergency contact, health fund, the legal attestation and the signature.
//
// Three departures from the prototype, all of them §14.1:
//   * the attestation checkbox starts UNTICKED -- a pre-ticked consent box is not consent,
//     and `ConsentRecord` models an explicit grant
//   * the signature is REQUIRED, which no rule in the prototype enforces
//   * the pad shows a prompt, not the signer's name pre-rendered in cursive; an unsigned
//     pad that looks signed is worse than a blank one
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, PenTool, RotateCcw, Shield } from 'lucide-react'
import { SelectField, TextField } from './Field'
import { HEALTH_FUND_OPTIONS, STUDENT_FORM_COPY } from '../content'
import { isMinor } from '../types'
import type { StudentDraft } from '../types'
import type { FieldKey } from '../validation'

export function PartSignature({
  student,
  onChange,
  errorFor,
  onBlurField,
}: {
  student: StudentDraft
  onChange: (patch: Partial<StudentDraft>) => void
  errorFor: (field: FieldKey) => string | null
  onBlurField: (field: FieldKey) => void
}) {
  const copy = STUDENT_FORM_COPY
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(Boolean(student.signatureDataUrl))
  const signatureError = errorFor('signature')

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
    event.currentTarget.setPointerCapture(event.pointerId)
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
    if (canvas) onChange({ signatureDataUrl: canvas.toDataURL('image/png') })
  }

  const clear = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange({ signatureDataUrl: '' })
  }

  const signerLabel = isMinor(student.birthDate) ? copy.signGuardian : copy.signAdult

  return (
    <div className="flex flex-col gap-3.5">
      <div className="p-3 rounded-xl bg-[#f2f3ff] border border-[#e9edff] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#0056c5]" />
          <span className="text-[15px] font-bold text-[#001849]">{copy.emergencyTitle}</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-[#dae1ff] text-[#001849] text-[11px] font-bold">
          {copy.finalStep}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          label={copy.emergencyPhone}
          required
          type="tel"
          dir="ltr"
          value={student.emergencyPhone}
          placeholder={copy.phonePlaceholder}
          error={errorFor('emergencyPhone')}
          onChange={(event) => onChange({ emergencyPhone: event.target.value })}
          onBlur={() => onBlurField('emergencyPhone')}
        />
        <SelectField
          label={copy.healthFund}
          required
          value={student.healthFund}
          placeholder={copy.healthFundPlaceholder}
          options={HEALTH_FUND_OPTIONS}
          error={errorFor('healthFund')}
          onChange={(event) =>
            onChange({ healthFund: event.target.value as StudentDraft['healthFund'] })
          }
          onBlur={() => onBlurField('healthFund')}
        />
      </div>
      <p className="text-[11px] text-[#757681] -mt-2">{copy.emergencyHint}</p>

      <div
        className={`p-3.5 rounded-xl transition-all border flex flex-col gap-2.5 ${
          errorFor('attested') ? 'bg-red-50/40 border-2 border-red-400' : 'bg-[#f2f3ff] border-[#e9edff]'
        }`}
      >
        <span className="text-[13px] font-bold text-[#001849] flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-[#0056c5]" />
          {copy.attestTitle}
        </span>
        <p className="text-[12px] text-[#444650] leading-relaxed">{copy.attestBody}</p>
        <label
          className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
            errorFor('attested')
              ? 'bg-white border-2 border-red-400 text-red-900'
              : 'bg-white border border-[#c5c6d2]/60'
          }`}
        >
          <input
            type="checkbox"
            checked={student.attested}
            onChange={(event) => {
              onChange({ attested: event.target.checked })
              onBlurField('attested')
            }}
            className="w-5 h-5 mt-0.5 accent-[#0056c5]"
          />
          <span className="text-[12px] text-[#161b28] font-medium">
            {copy.attestCheckbox} <span className="text-red-500 font-bold">*</span>
          </span>
        </label>
        {errorFor('attested') ? (
          <p className="text-[11.5px] text-red-600 font-medium flex items-center gap-1" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorFor('attested')}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span
            className={`text-[13px] font-bold flex items-center gap-1 ${
              signatureError ? 'text-red-700' : 'text-[#161b28]'
            }`}
          >
            <PenTool className="w-4 h-4 text-[#0056c5]" />
            <span>{signerLabel}</span>
            <span className="text-red-500 font-bold">*</span>
          </span>
          <button
            type="button"
            onClick={clear}
            className="text-[#0056c5] text-[12px] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {copy.clearSignature}
          </button>
        </div>

        <div
          className={`relative h-28 w-full rounded-xl bg-white border-2 flex items-center justify-center overflow-hidden transition-all ${
            signatureError
              ? 'border-red-500 border-solid bg-red-50/20 ring-2 ring-red-400/30'
              : 'border-dashed border-[#c5c6d2]'
          }`}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
            aria-label={signerLabel}
            className="absolute inset-0 z-20 cursor-crosshair touch-none"
          />
          {/* A prompt, not the signer's name in cursive. */}
          {!hasInk ? (
            <p className="relative z-10 text-[12px] text-[#757681] text-center px-4 pointer-events-none select-none">
              {copy.signHere}
            </p>
          ) : null}
        </div>

        {signatureError ? (
          <p className="text-[11.5px] text-red-600 font-medium flex items-center gap-1" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{signatureError}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
