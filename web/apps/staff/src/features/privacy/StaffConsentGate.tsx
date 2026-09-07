// §6.1 step 5 for the STAFF app — the hard gate the coaches' side never had.
//
// **The hole.** `REQUIRED_CONSENT_TYPES` is `("terms", "privacy")` and applies to a PERSON,
// not to a parent: `POST /privacy/consents` takes no subject and records whoever is calling
// it. The parent app has blocked on it since M4. The staff app never did — `AccessGate` ->
// `Resolve` -> tour -> today, with nothing in between — so a coach who reads a child's
// health flag on a roster, sees a family's phone number and marks a register of minors had
// accepted neither the terms nor the privacy policy. That is the one population in the
// product with the most access to other people's data and the only one that signed nothing.
//
// **Shaped like the parent's `ConsentGate`, deliberately.** Same three-state read, same
// "children are not rendered at all" rule, same posture on each kind of failure. Two gates
// answering the same question differently is two rules a reader has to hold. What differs
// is only the drawing (Tailwind, in `.tw-scope`, like every other staff screen) and one
// line of copy naming why a coach in particular is being asked.
//
// **On a failed READ it stands aside.** A coach opening the app in a basement with no
// signal must not be locked out of a cached PWA by a gate that could not reach the server —
// and first sign-in cannot happen offline anyway, so the gate is never skipped on the one
// launch it exists for. **On a failed WRITE it stays up**: an acceptance that was not
// recorded is not an acceptance, and there is a person at the screen who can try again.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DraftNotice, PolicyDocument } from '@studio/ui'
import type { PolicyDoc } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { ConsentState, StaffConsentClient } from './staffConsentClient'

/** What the shell needs to know. `loading` is distinct from `open` because "no other screen
 *  is reachable" includes the tab bar that reaches them, and a bar drawn during the fetch is
 *  a bar a fast finger uses before the gate arrives. */
export type StaffConsentStatus = 'loading' | 'holding' | 'open'

export function StaffConsentGate({
  locale,
  client,
  children,
  onStatusChange,
}: {
  locale: Locale
  client: StaffConsentClient
  children: ReactNode
  onStatusChange?: (status: StaffConsentStatus) => void
}) {
  // `undefined` is "still asking"; `null` is "asked and could not tell". Collapsing them
  // would make an offline launch look like a pending one and render nothing, forever.
  const [state, setState] = useState<ConsentState | null | undefined>(undefined)
  const [accepted, setAccepted] = useState({ terms: false, privacy: false })
  const [openDoc, setOpenDoc] = useState<PolicyDoc | null>(null)
  /** The consent TYPE (`privacy`) and the document name (`policy`) differ. Mapped in one
   *  place so neither the checkbox list below nor the reader above has to know. */
  const DOC_OF: Record<'terms' | 'privacy', PolicyDoc> = { terms: 'terms', privacy: 'policy' }
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void client
      .consents()
      .then((next) => alive && setState(next))
      .catch(() => alive && setState(null))
    return () => {
      alive = false
    }
  }, [client])

  const status: StaffConsentStatus = useMemo(() => {
    if (state === undefined) return 'loading'
    if (state === null) return 'open'
    return state.outstanding.length > 0 ? 'holding' : 'open'
  }, [state])

  // Reported once per TRANSITION. The shell passes an inline callback, so a bare dependency
  // on it would fire this effect on every render of the shell and set state back into it —
  // a loop that only appears once the gate is actually mounted.
  const reported = useRef<StaffConsentStatus | null>(null)
  useEffect(() => {
    if (reported.current === status) return
    reported.current = status
    onStatusChange?.(status)
  }, [status, onStatusChange])

  const submit = useCallback(async () => {
    if (state == null || saving) return
    setSaving(true)
    setFailed(false)
    try {
      // The version the SCREEN rendered, not a constant this file carries. The server
      // answers 409 if the published wording has moved on, which is what stops a tab left
      // open across a policy change from recording agreement to text nobody saw.
      const next = await client.grant(state.policy_version, { terms: true, privacy: true })
      setState(next ?? { ...state, outstanding: [] })
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }, [client, saving, state])

  if (status === 'loading') return null
  if (status === 'open' || state == null) return <>{children}</>

  const both = accepted.terms && accepted.privacy

  if (openDoc) {
    return (
      <div className="tw-scope flex flex-col gap-4 px-4 pt-4 pb-8" data-testid="staff-consent-doc">
        <button
          type="button"
          data-testid="staff-consent-doc-back"
          onClick={() => setOpenDoc(null)}
          className="self-start rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
        >
          {t(locale, 'reports.privacy.gate.closeFull')}
        </button>
        {/* `only` narrows the shared document to the one the coach asked to read — the same
            component and the same `reports.privacy.*` text the sign-in footer and the parent
            app already render, so there is no second copy of the wording anywhere. The
            consent TYPE is `privacy`, the document is called `policy`; that mismatch is
            `PolicyDoc`'s, not this file's, and mapping it here keeps it in one place. */}
        <PolicyDocument
          isDraft={state.policy_is_draft}
          locale={locale}
          only={openDoc}
          versionLabel={state.policy_version_label}
        />
      </div>
    )
  }

  return (
    <div className="tw-scope flex flex-col gap-4 px-4 pt-6 pb-8" data-testid="staff-consent-gate">
      <header>
        <h1 className="text-2xl font-black text-slate-900">
          {t(locale, 'reports.privacy.gate.title')}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          {t(locale, 'reports.privacy.gate.body')}
        </p>
        {/* The one line that is the staff app's own. A coach is not being asked the same
            question a parent is: a parent consents to the club holding THEIR family's data,
            and a coach undertakes to handle other people's children's. */}
        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-700">
          {t(locale, 'reports.privacy.gate.staffBody')}
        </p>
        {state.policy_is_draft ? (
          <div className="mt-3">
            <DraftNotice label={state.policy_version_label} locale={locale} />
          </div>
        ) : null}
      </header>

      {(
        [
          ['terms', 'reports.privacy.gate.acceptTerms', 'reports.privacy.gate.termsSummary'],
          ['privacy', 'reports.privacy.gate.acceptPrivacy', 'reports.privacy.gate.privacySummary'],
        ] as const
      ).map(([key, titleKey, summaryKey]) => (
        <section key={key} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              data-testid={`staff-consent-check-${key}`}
              checked={accepted[key]}
              onChange={(event) => {
                const { checked } = event.currentTarget
                setAccepted((prev) => ({ ...prev, [key]: checked }))
              }}
              className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
            />
            <span className="text-sm font-black text-slate-900">{t(locale, titleKey)}</span>
          </label>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{t(locale, summaryKey)}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {t(locale, 'reports.privacy.doc.version')} {state.policy_version_label}
          </p>
          <button
            type="button"
            data-testid={`staff-consent-read-${key}`}
            onClick={() => setOpenDoc(DOC_OF[key])}
            className="mt-2 text-xs font-bold text-blue-700"
          >
            {t(locale, 'reports.privacy.gate.readFull')}
          </button>
        </section>
      ))}

      {failed ? (
        // Stays up. An acceptance that was not recorded is not an acceptance.
        <p
          role="alert"
          data-testid="staff-consent-failed"
          className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
        >
          {t(locale, 'reports.privacy.gate.failed')}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="staff-consent-submit"
        disabled={!both || saving}
        onClick={() => void submit()}
        className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
      >
        {t(locale, saving ? 'reports.privacy.gate.working' : 'reports.privacy.gate.submit')}
      </button>
    </div>
  )
}
