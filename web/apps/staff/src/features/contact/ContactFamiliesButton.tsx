// §4.9's contact hand-off, built once so the schedule card (this checkpoint), the student
// card and the task card (both later) share one component rather than three copies.
//
// **§5.11 already settled how, and it is not an integration.**
// `app/services/comms/notifications.py` states the spec "permits no email, no SMS and no
// WhatsApp" and that the names and numbers ARE the feature — the club already has a
// WhatsApp group, so this hands over the numbers and a pre-written message and lets a human
// press send. "Same outcome as automation, half a day of work, zero risk." `phoneList` and
// `whatsappShareUrl` (`@studio/core`, moved here from the dashboard so both apps share one
// copy) are the two actions that follow from that.
//
// Three rules, each already established elsewhere in this app:
//
// 1. **A missing number gets a sentence, not a dead link.** `AtRiskAlert` set this — "a link
//    that does nothing is worse than a sentence explaining why." Here that is
//    `contact.missingPhoneCount`, shown beside the actions rather than instead of them —
//    the WhatsApp share needs no phone number at all (it opens a picker, it does not dial),
//    so a family with no number on file still gets a message SOMEONE can forward, and the
//    count says who a coach still has to reach another way.
// 2. **Nothing claims delivery.** Opening WhatsApp is not proof anything was sent — the
//    coach may never press send there. This renders `contact.readyHint` up front and,
//    after a copy, `delivery.numbersCopied` — never a "sent" toast. The prototype this was
//    ported from shows "sent to everyone!" the instant the link opens, which is untrue.
// 3. **No new exposure.** Every number a caller passes in is one that caller's own client
//    could already read — the roster this coach downloaded, or the guardian record behind a
//    student they can already open. This component receives contacts; it does not fetch or
//    widen who they cover.
//
// **Why `resolveFamilies` is a function and not an array.** The schedule card's contacts are
// not known until the drawer opens — the roster carries `student_id`s, not phone numbers,
// so a coach's own client resolves guardian phones by student on demand, once, when the
// coach actually asks to chase them. A caller that already has its contacts synchronously
// (a student card, say) satisfies the same prop with `() => Promise.resolve(families)`.
import { useCallback, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, useModalDialog } from '@studio/ui'
import { phoneList, whatsappShareUrl } from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type ContactFamily = {
  person_id: string
  name: string
  phone: string | null
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  maxInlineSize: '28rem',
  inlineSize: '100%',
  padding: 'var(--space-4)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--surface-raised)',
  marginBlockStart: 'var(--space-2)',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
}

const titleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
}

const closeStyle: CSSProperties = {
  minInlineSize: '44px',
  minBlockSize: '44px',
  border: 0,
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 'var(--text-title)',
  lineHeight: 1,
}

const hintStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
}

const messageBoxStyle: CSSProperties = {
  margin: 0,
  padding: 'var(--space-3)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  fontSize: 'var(--text-body)',
  whiteSpace: 'pre-wrap',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const linkStyle: CSSProperties = {
  alignItems: 'center',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--fg)',
  display: 'inline-flex',
  minBlockSize: '44px',
  paddingInline: 'var(--space-3)',
  textDecoration: 'none',
}

export function ContactFamiliesButton({
  locale,
  triggerLabel,
  title,
  message,
  resolveFamilies,
}: {
  locale: Locale
  /** The trigger button's own label — callers differ (a session says how many have not
   *  confirmed; a student card would just say "contact"), so it is never invented here. */
  triggerLabel: string
  /** The panel's heading, and half of what `whatsappShareUrl` sends — the group name, the
   *  student's name, whatever names the audience for whoever opens the shared link. */
  title: string
  /** The pre-written message, verbatim. This component sends it exactly as given — §4.9
   *  says "pre-composed", not "composer". */
  message: string
  resolveFamilies: () => Promise<ContactFamily[]>
}) {
  const [open, setOpen] = useState(false)
  const [families, setFamilies] = useState<ContactFamily[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  const close = useCallback(() => setOpen(false), [])
  const dialogRef = useModalDialog(open, close)

  const onOpen = useCallback(() => {
    setOpen(true)
    setCopied(false)
    if (families !== null) return
    setLoading(true)
    setFailed(false)
    resolveFamilies()
      .then((resolved) => {
        setFamilies(resolved)
        setLoading(false)
      })
      .catch(() => {
        setFailed(true)
        setLoading(false)
      })
  }, [families, resolveFamilies])

  const copy = useCallback(() => {
    const text = phoneList(families ?? [])
    void globalThis.navigator?.clipboard?.writeText(text)
    setCopied(true)
  }, [families])

  const withPhone = (families ?? []).filter((family) => family.phone)
  const withoutPhone = (families ?? []).filter((family) => !family.phone)

  return (
    <>
      <Button variant="secondary" data-testid="contact-open" onClick={onOpen}>
        {triggerLabel}
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-families-title"
          data-testid="contact-panel"
          ref={dialogRef}
          style={panelStyle}
          tabIndex={-1}
        >
          <div style={headerStyle}>
            <h2 id="contact-families-title" style={titleStyle}>
              {title}
            </h2>
            <button
              type="button"
              onClick={close}
              style={closeStyle}
              data-testid="contact-close"
              aria-label={t(locale, 'common.a11y.close')}
            >
              ×
            </button>
          </div>

          <p style={hintStyle}>{t(locale, 'comms.contact.messageLabel')}</p>
          <p style={messageBoxStyle} data-testid="contact-message">
            {message}
          </p>
          <p style={hintStyle}>{t(locale, 'comms.contact.readyHint')}</p>

          {loading ? (
            <p style={hintStyle} data-testid="contact-loading">
              {t(locale, 'comms.contact.loading')}
            </p>
          ) : failed ? (
            <p style={hintStyle} data-testid="contact-failed">
              {t(locale, 'common.loadFailed.body')}
            </p>
          ) : (
            <>
              {withoutPhone.length > 0 ? (
                <p style={hintStyle} data-testid="contact-missing-phone">
                  {plural(locale, 'comms.contact.missingPhoneCount', withoutPhone.length)}
                </p>
              ) : null}

              <div style={actionsStyle}>
                {withPhone.length > 0 ? (
                  <Button variant="secondary" onClick={copy} data-testid="contact-copy">
                    {t(locale, 'comms.delivery.copyNumbers')}
                  </Button>
                ) : null}
                {/* No phone number embedded — this opens WhatsApp's own share picker, so
                    it works even when every family above has no number on file. */}
                <a
                  href={whatsappShareUrl(title, message)}
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                  data-testid="contact-whatsapp"
                >
                  {t(locale, 'comms.delivery.shareToWhatsapp')}
                </a>
              </div>

              {withPhone.length === 0 ? (
                <p style={hintStyle} data-testid="contact-no-numbers">
                  {t(locale, 'comms.contact.noNumbers')}
                </p>
              ) : null}

              {copied ? (
                <p style={hintStyle} data-testid="contact-copied">
                  {t(locale, 'comms.delivery.numbersCopied')}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  )
}
