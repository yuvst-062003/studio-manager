// The club's join link, as one row that copies (owner, 2026-10-13).
//
// **What this replaces.** A whole screen at `#/join-link`: the URL printed in full across
// three wrapped lines of monospace, a status line, a "העתקה" button and a "ביטול" beside it.
// The manager's actual errand there was always the same — put the link on the clipboard and
// paste it into WhatsApp — and the screen made that a navigation, a read, a tap and a way
// back. The row does it in one tap and says "הועתק" for a moment, which is the whole
// feedback a clipboard write can honestly give.
//
// **Revoking moved out with the screen, deliberately.** It was the one other thing that page
// offered. It is a rare, destructive act — it invalidates a link that may already be in a
// hundred parents' phones — and it sat one tap from "copy". If the club needs it back it
// belongs behind its own confirmation, not beside the button people press weekly.
import { useEffect, useRef, useState } from 'react'
import { Check, Link2 } from 'lucide-react'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type LinkStatus = { active: boolean; url: string | null; families: number }

/** How long "הועתק" stays up. Long enough to read, short enough that the row is back to
 *  being a button before anyone wants to press it again. */
const CONFIRM_MS = 1800

export function JoinLinkCopyRow({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState<LinkStatus | null>(null)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/onboarding-link')
      .then((response) => (response.ok ? (response.json() as Promise<LinkStatus>) : null))
      .then((body) => alive && body && setStatus(body))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  // The timeout outlives a fast unmount otherwise, and setting state on a gone component is
  // the warning nobody reads until it hides a real one.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copy(): Promise<void> {
    const url = status?.url
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setFailed(false)
      setCopied(true)
    } catch {
      // A clipboard an insecure context or a permission refused: say so rather than show a
      // ✓ over nothing. The manager can still reach the link from the dashboard.
      setFailed(true)
      setCopied(false)
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setCopied(false)
      setFailed(false)
    }, CONFIRM_MS)
  }

  // No link yet, or a pre-2026-08-31 row whose token was only ever stored hashed: a row that
  // cannot copy anything is a row that should not be offered.
  if (!status?.active || !status.url) return null

  return (
    <button
      type="button"
      data-testid="join-link-copy"
      onClick={() => void copy()}
      className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--surface)] active:bg-[var(--disabled-surface)] transition-colors text-start"
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="w-8 h-8 rounded-xl bg-[var(--emphasis-tint)] text-[var(--emphasis)] flex items-center justify-center shrink-0 font-bold">
          <Link2 className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="flex flex-col items-start text-start min-w-0">
          <span className="font-bold text-[var(--fg)] truncate">
            {t(locale, 'people.join.card.title')}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] truncate">
            {t(locale, 'people.join.copyRow.subtitle')}
          </span>
        </span>
      </span>

      {/* `role="status"` so the confirmation is ANNOUNCED. A tick that only appears is no
          feedback at all to somebody who cannot see it, and this row's entire output is
          feedback — the clipboard itself is invisible. */}
      <span
        role="status"
        aria-live="polite"
        data-testid="join-link-copied"
        className="text-[11px] font-bold shrink-0 flex items-center gap-1 text-[var(--emphasis)]"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            {t(locale, 'people.join.copyRow.copied')}
          </>
        ) : null}
        {failed ? (
          <span className="text-[var(--danger)]">{t(locale, 'people.join.copyRow.failed')}</span>
        ) : null}
      </span>
    </button>
  )
}
