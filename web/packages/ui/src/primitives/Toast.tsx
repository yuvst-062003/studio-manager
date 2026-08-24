/**
 * Artboard 4h, card שורת חניך · סרגל התקדמות · הודעת מערכת — the last third.
 *
 * role="status" (polite), not role="alert" (assertive). A toast exists because something
 * just happened, so it IS a live region — but "הנוכחות נשמרה" should wait for a pause
 * rather than interrupt whatever a screen reader is in the middle of.
 */
export function Toast({
  message,
  action,
}: {
  message: string
  action?: { label: string; onAction: () => void }
}) {
  return (
    <div className="studio-toast" role="status">
      <svg
        aria-hidden="true"
        className="studio-toast__icon"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        viewBox="0 0 20 20"
      >
        <path d="M4 10.5 8 14.5 16 5.5" />
      </svg>
      <span className="studio-toast__message">{message}</span>
      {action ? (
        <button className="studio-toast__action" onClick={action.onAction} type="button">
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
