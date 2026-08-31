// The two documents the sign-in footer links to, rendered INSIDE this app.
//
// The point of this screen is where it is NOT: the footer could have pointed at the parent
// app's `#/privacy`, and that would have sent someone who is not signed in to a different
// origin, into an app that would show them its own sign-in. A legal link that cannot be
// read without an account is not a legal link.
//
// Everything below the header is `PolicyDocument` from @studio/ui — the same component,
// the same `reports.privacy.*` keys, and therefore the same text the parent app renders.
// Nothing here restates a word of it.
//
// The draft banner comes from `GET /privacy/policy`, which is public for exactly this
// reason (see the route's docstring). A reader who arrives before the request lands, or
// when it fails, gets the document without the banner — never a claim that the text is
// final, which is what hard-coding `isDraft={false}` would have been.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { components } from '@studio/api-client'
import { apiFetch } from '@studio/core'
import { PolicyDocument } from '@studio/ui'
import type { PolicyDoc } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

// From the generated client, not hand-written: SPEC §8.2 regenerates it from openapi.json
// and fails CI on a stale copy, so a shape declared here would be a second definition
// nothing keeps in step. Same rule the parent's `privacyClient.ts` states.
type Policy = components['schemas']['PolicyOut']

const pageStyle: CSSProperties = {
  minBlockSize: '100vh',
  background: 'var(--ground)',
  color: 'var(--fg)',
}

// This screen carried the sign-in's gold rule so arriving here did not feel like leaving
// the club. The rule came off the sign-in on 2026-09-01, so it comes off here too — the
// navy header is what carries the continuity now.
const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  background: '#001129',
  color: '#eff1f3',
}

const bodyStyle: CSSProperties = {
  maxInlineSize: '760px',
  marginInline: 'auto',
  padding: 'var(--space-4)',
}

export function LegalScreen({ locale, doc }: { locale: Locale; doc: PolicyDoc }) {
  const [policy, setPolicy] = useState<Policy | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const response = await apiFetch('/api/v1/privacy/policy')
        if (!response.ok) return
        const body = (await response.json()) as Policy
        if (alive) setPolicy(body)
      } catch {
        // Offline on a legal document means the document without its version banner. There
        // is nothing here for a reader to act on, so there is nothing to tell them.
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div style={pageStyle} data-testid="legal-screen">
      <header style={headerStyle}>
        {/* Back to the sign-in, which is what `#/` renders while anonymous. */}
        <a href="#/" style={{ color: '#f1be78' }}>
          {t(locale, 'common.auth.manager.backToSignIn')}
        </a>
      </header>
      <div style={bodyStyle}>
        <PolicyDocument
          locale={locale}
          only={doc}
          isDraft={policy?.policy_is_draft ?? false}
          versionLabel={policy?.policy_version_label ?? ''}
        />
      </div>
    </div>
  )
}
