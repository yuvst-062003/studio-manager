// §6.1 step 5 — `5  אישורים  →  terms of service + privacy policy`. **A hard block.**
//
// SPEC:1314 puts step 5 in the BLOCKING band and SPEC:1327 says "Steps 5 and 6 are the
// only hard gates." Step 6 shipped in M4 and step 5 did not. `Resolve.tsx:9` records why:
// "Steps 5 and 6 — the BLOCKING consent and health gates — are M4's, and this file
// deliberately does NOT pre-build a seam for them… M4 decides its own shape."
//
// **Its shape is `HealthGate`'s**, and on purpose. Same file layout, same "children are
// not rendered at all" rule, same `null` while the answer is in flight, same posture on a
// failed read. Two adjacent gates that behave differently is two rules a reader has to
// hold; one rule, applied twice, is one.
//
// **It stands BEFORE the health gate.** Step 5 precedes step 6 in §6.1's own ordering, and
// the ordering carries an argument: the privacy policy is what says the club may collect a
// medical record about a child at all. Asking for the record first and the permission
// afterwards has the consent doing no work.
//
// **On a failed READ it stands aside**, exactly as `HealthGate` does and for the reason
// that component states: "first login (the moment §6.1 gates) cannot happen offline, and a
// network blip locking a family out of the cached PWA would punish exactly the parent §6.5
// worked hardest to keep." On a failed WRITE it does the opposite and stays up — an
// acceptance that was not recorded is not an acceptance, and there is a person at the
// screen who can try again.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Alert, Button, Card, Checkbox, DraftNotice, PolicyDocument } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PolicyDoc } from '@studio/ui'

import type { ConsentState, PrivacyClient } from './privacyClient'

const gateStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

/**
 * What the SHELL needs to know, and all it needs to know.
 *
 * `loading` is distinct from `open` because §6.1's "no other screen is reachable" includes
 * the tab bar that reaches them, and a bar drawn during the fetch is a bar a fast finger
 * uses before the gate arrives.
 */
export type ConsentGateStatus = 'loading' | 'holding' | 'open'

export type ConsentGateProps = {
  locale: Locale
  client: PrivacyClient
  children: ReactNode
  /** Called once per transition. The shell hides the tab bar unless this says `open`. */
  onStatusChange?: (status: ConsentGateStatus) => void
}

export function ConsentGate({ locale, client, children, onStatusChange }: ConsentGateProps) {
  // `undefined` is "still asking"; `null` is "asked and could not tell" — the failure that
  // stands the gate aside. Collapsing them would make an offline launch look like a
  // pending one and render nothing at all, forever.
  const [state, setState] = useState<ConsentState | null | undefined>(undefined)
  const [accepted, setAccepted] = useState({ terms: false, privacy: false })
  const [openDoc, setOpenDoc] = useState<PolicyDoc | null>(null)
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

  const status: ConsentGateStatus = useMemo(() => {
    if (state === undefined) return 'loading'
    if (state === null) return 'open'
    return state.outstanding.length > 0 ? 'holding' : 'open'
  }, [state])

  // Reported once per TRANSITION. The shell passes an inline callback, so a bare
  // dependency on it would fire this effect on every render of the shell and set state
  // back into it — a loop that only shows up once the gate is actually mounted.
  const reported = useRef<ConsentGateStatus | null>(null)
  useEffect(() => {
    if (reported.current === status) return
    reported.current = status
    onStatusChange?.(status)
  }, [status, onStatusChange])

  if (status === 'loading') return null
  if (status === 'open' || state == null) return <>{children}</>

  const both = accepted.terms && accepted.privacy
  const version = `${t(locale, 'reports.privacy.doc.version')} ${state.policy_version_label}`

  const submit = async (): Promise<void> => {
    setSaving(true)
    setFailed(false)
    try {
      // The version the SCREEN rendered, not a constant this file carries. The server
      // answers 409 if the published wording has moved on, which is what stops a tab left
      // open across a policy change from recording an agreement to text nobody saw.
      const next = await client.grant(state.policy_version, { terms: true, privacy: true })
      setState(next ?? { ...state, outstanding: [] })
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    // `children` is not rendered at all — not hidden, not disabled, not behind an overlay.
    // §6.1 says no other screen is reachable, and a screen that is merely covered is one
    // CSS bug away from being reachable.
    <div data-testid="consent-gate" style={gateStyle}>
      <Card>
        <h1>{t(locale, 'reports.privacy.gate.title')}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{t(locale, 'reports.privacy.gate.body')}</p>
        {state.policy_is_draft ? (
          <DraftNotice label={state.policy_version_label} locale={locale} />
        ) : null}
      </Card>

      <Card>
        <Checkbox
          block
          checked={accepted.terms}
          data-testid="consent-check-terms"
          label={t(locale, 'reports.privacy.terms.title')}
          onChange={(event) => {
            const { checked } = event.currentTarget
            setAccepted((prev) => ({ ...prev, terms: checked }))
          }}
        />
        <p style={{ color: 'var(--text-muted)' }}>
          {t(locale, 'reports.privacy.gate.termsSummary')}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>{version}</p>
        <Button
          data-testid="consent-read-terms"
          onClick={() => setOpenDoc('terms')}
          type="button"
          variant="ghost"
        >
          {t(locale, 'reports.privacy.gate.readFull')}
        </Button>
      </Card>

      <Card>
        <Checkbox
          block
          checked={accepted.privacy}
          data-testid="consent-check-privacy"
          label={t(locale, 'reports.privacy.policy.title')}
          onChange={(event) => {
            const { checked } = event.currentTarget
            setAccepted((prev) => ({ ...prev, privacy: checked }))
          }}
        />
        <p style={{ color: 'var(--text-muted)' }}>
          {t(locale, 'reports.privacy.gate.privacySummary')}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>{version}</p>
        <Button
          data-testid="consent-read-privacy"
          onClick={() => setOpenDoc('policy')}
          type="button"
          variant="ghost"
        >
          {t(locale, 'reports.privacy.gate.readFull')}
        </Button>
      </Card>

      {openDoc ? (
        <Card>
          <div data-testid="consent-document-sheet">
            <Button onClick={() => setOpenDoc(null)} type="button" variant="ghost">
              {t(locale, 'reports.privacy.gate.closeFull')}
            </Button>
            <PolicyDocument
              isDraft={state.policy_is_draft}
              locale={locale}
              only={openDoc}
              versionLabel={state.policy_version_label}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        {!both ? (
          <p style={{ color: 'var(--text-muted)' }}>
            {t(locale, 'reports.privacy.gate.mustAccept')}
          </p>
        ) : null}
        {failed ? (
          <span data-testid="consent-error">
            {/* `live` here and nowhere else on this screen: this banner appears in
                response to something the parent just did. */}
            <Alert iconLabel={t(locale, 'reports.privacy.gate.title')} live tone="danger">
              {t(locale, 'reports.privacy.gate.failed')}
            </Alert>
          </span>
        ) : null}
        <Button
          data-testid="consent-accept"
          disabled={!both || saving}
          onClick={() => void submit()}
        >
          {saving
            ? t(locale, 'reports.privacy.gate.working')
            : t(locale, 'reports.privacy.gate.submit')}
        </Button>
      </Card>
    </div>
  )
}
