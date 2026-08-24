/**
 * Artboard 4h, card שורת חניך · סרגל התקדמות · הודעת מערכת — the middle third.
 *
 * The readout is text as well as width: SC 1.4.1, and also the plain fact that "how many
 * of the class are here" is a number a coach wants to read, not estimate from a bar.
 *
 * tabular-nums on the readout is not decoration: the number sits beside a bar that
 * animates, and proportional digits make it jump sideways as it counts.
 */
export function ProgressBar({
  label,
  value,
  max,
  readout,
}: {
  label: string
  value: number
  max: number
  readout?: string
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="studio-progress">
      <div
        aria-label={label}
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={value}
        className="studio-progress__track"
        role="progressbar"
      >
        {/* Inline because the width IS the data. */}
        <span className="studio-progress__fill" style={{ inlineSize: `${percent}%` }} />
      </div>
      {readout ? <span className="studio-progress__readout">{readout}</span> : null}
    </div>
  )
}
